import { AppError } from "@/lib/shared/errors";
import {
  AVAILABILITY,
  DRIVER_APP_PUBLIC_LABEL,
  DRIVER_UPLOADS,
  MATERIALS,
  PAYLOAD_UNITS,
  PRIVACY_POLICY_VERSION,
  TRAVEL_RADIUS,
  TRUCK_TYPES,
  labelFor,
  labelsFor,
  SERVICE_TYPES,
  APPOINTMENT_TOPICS,
  PRIVACY_REQUEST_TYPES,
  type DriverAppStatus,
} from "@/lib/shared/domain";
import { slotsForDate } from "@/lib/shared/slots";
import {
  AppointmentRequestSchema,
  ContactSchema,
  DriverRegistrationSchema,
  PrivacyRequestSchema,
  QuoteRequestSchema,
} from "@/lib/shared/validation";
import { check, db } from "../db.server";
import { hashIp, hashToken, randomToken } from "../crypto.server";
import { emailButton, emailLayout, emailTable, sendEmail, siteUrl, e } from "../email.server";
import { enforceRateLimit } from "../ratelimit.server";
import { getSetting } from "../settings.server";
import { looksLikeBot, verifyTurnstile } from "../turnstile.server";
import { notifyStaff } from "../notify.server";
import { log } from "../logger.server";

type Ctx = { request: Request; ip: string; rid: string };

function parse<T>(
  schema: {
    safeParse: (
      v: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: { message: string; path: readonly PropertyKey[] }[] } };
  },
  body: unknown,
): T {
  const r = schema.safeParse(body);
  if (!r.success) {
    const issue = r.error.issues[0];
    throw new AppError("VALIDATION", issue?.message ?? "Validation failed", {
      field: issue?.path?.join("."),
    });
  }
  return r.data;
}

async function guard(
  ctx: Ctx,
  form: string,
  input: { website?: string; ts: number; turnstileToken?: string },
  perMinute = 5,
  perDay = 40,
) {
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:${form}:m`, perMinute, 60);
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:${form}:d`, perDay, 86400);
  if (looksLikeBot(input)) return true;
  await verifyTurnstile(input.turnstileToken, ctx.ip);
  return false;
}

async function recordConsent(
  email: string,
  context: string,
  types: [string, boolean][],
  relatedId: string | null,
  ipHash: string,
  ua: string | null,
) {
  const rows = types.map(([consent_type, granted]) => ({
    subject_email: email.toLowerCase(),
    context,
    consent_type,
    granted,
    policy_version: PRIVACY_POLICY_VERSION,
    related_id: relatedId,
    ip_hash: ipHash,
    user_agent: ua?.slice(0, 300) ?? null,
  }));
  const { error } = await db().from("consent_records").insert(rows);
  if (error) log("error", "consent write failed", { error: error.message });
}

/** Links a submission to an open lead with the same email, or creates one. Never merges distinct people silently: only an exact email match on an open lead is reused. */
async function upsertLead(p: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  location?: string | null;
  service?: string | null;
  source: string;
  note: string;
}) {
  const email = p.email.toLowerCase();
  const existing = await db()
    .from("leads")
    .select("id")
    .ilike("email", email)
    .is("archived_at", null)
    .not("stage", "in", "(won,lost)")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let leadId: string | null = existing.data?.id ?? null;
  if (!leadId) {
    const created = await db()
      .from("leads")
      .insert({
        name: p.name,
        email,
        phone: p.phone || null,
        company: p.company || null,
        location: p.location || null,
        service_interest: SERVICE_TYPES.some((s) => s.value === p.service) ? p.service : null,
        source: p.source,
        stage: "new",
      })
      .select("id")
      .single();
    if (created.error) {
      log("error", "lead create failed", { error: created.error.message });
      return null;
    }
    leadId = created.data.id;
  }
  await db()
    .from("lead_activities")
    .insert({ lead_id: leadId, type: "form_submission", body: p.note.slice(0, 4000) });
  return leadId;
}

const shortRef = (id: string) => id.replace(/-/g, "").slice(0, 8).toUpperCase();

// ---------------------------------------------------------------------------------------
export async function submitContact(ctx: Ctx, body: unknown) {
  const input = parse(ContactSchema, body);
  if (await guard(ctx, "contact", input)) return { ref: "RECEIVED", delivered: false };
  const ipHash = await hashIp(ctx.ip);
  const serviceLabel = input.service || null;
  const leadId = await upsertLead({
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    location: input.address,
    service: null,
    source: "contact_form",
    note: `Website contact form${serviceLabel ? ` — ${serviceLabel}` : ""}:\n${input.message}`,
  });
  const sub = check(
    await db()
      .from("contact_submissions")
      .insert({
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        service: serviceLabel,
        message: [
          input.company && `Company: ${input.company}`,
          input.address && `Address: ${input.address}`,
          input.message,
        ]
          .filter(Boolean)
          .join("\n"),
        lead_id: leadId,
        consent_privacy: input.consentPrivacy === true,
        ip_hash: ipHash,
      })
      .select("id")
      .single(),
    "Saving your message",
  ) as { id: string };
  if (input.consentPrivacy)
    await recordConsent(
      input.email,
      "contact_form",
      [["privacy_notice", true]],
      sub.id,
      ipHash,
      ctx.request.headers.get("user-agent"),
    );

  await notifyStaff({
    permission: "crm.read",
    channel: "leads",
    type: "lead.contact_form",
    title: `New website inquiry — ${input.name}`,
    body: input.message.slice(0, 300),
    link: leadId ? `/admin/crm?lead=${leadId}` : "/admin/crm",
    replyTo: input.email,
    emailRows: [
      ["Name", input.name],
      ["Email", input.email],
      ["Phone", input.phone],
      ["Company", input.company],
      ["Service", serviceLabel],
      ["Message", input.message],
    ],
    relatedType: "contact_submission",
    relatedId: sub.id,
    request: ctx.request,
  });
  const confirm = await sendEmail({
    to: input.email,
    subject: "We received your message — AM Consulting & Hauling",
    template: "public.contact_confirmation",
    relatedType: "contact_submission",
    relatedId: sub.id,
    html: emailLayout(
      `Thank you, ${e(input.name)}!`,
      `<p style="color:#4B5563">We received your message and our team will get back to you, usually within one business day.</p>
       <div style="background:#F4F7FB;border-radius:8px;padding:16px;margin:16px 0;white-space:pre-wrap;font-size:14px">${e(input.message)}</div>
       <p style="color:#4B5563;font-size:14px">Reference: <strong>${shortRef(sub.id)}</strong></p>`,
      {
        footerNote:
          "You are receiving this one-time confirmation because you contacted us through our website.",
      },
    ),
  });
  await db()
    .from("contact_submissions")
    .update({ email_delivered: confirm.status === "sent" })
    .eq("id", sub.id);
  return { ref: shortRef(sub.id), delivered: confirm.status === "sent" };
}

// ---------------------------------------------------------------------------------------
/** Multi-select form fields (sent as repeated keys in multipart form data). */
const DRIVER_MULTI_FIELDS = new Set(["truckTypes", "availability", "materials", "counties"]);
const DRIVER_BOOL_FIELDS = new Set(["attestGeorgia", "consentPrivacy", "consentContact"]);

/** Converts the multipart registration form into the shape DriverRegistrationSchema expects. */
export function driverFormToInput(fd: FormData): {
  body: Record<string, unknown>;
  files: { field: string; file: File }[];
} {
  const body: Record<string, unknown> = {};
  const files: { field: string; file: File }[] = [];
  for (const key of new Set(fd.keys())) {
    const values = fd.getAll(key);
    if (DRIVER_UPLOADS.some((u) => u.field === key)) {
      for (const v of values) if (v instanceof File) files.push({ field: key, file: v });
      continue;
    }
    const strings = values.filter((v): v is string => typeof v === "string");
    if (DRIVER_MULTI_FIELDS.has(key)) body[key] = strings;
    else if (DRIVER_BOOL_FIELDS.has(key)) body[key] = strings[0] === "true";
    else if (key === "ts") body[key] = Number(strings[0]);
    else body[key] = strings[0];
  }
  if (files.length > DRIVER_UPLOADS.length)
    throw new AppError("VALIDATION", "Too many files attached.");
  return { body, files };
}

export async function submitDriverRegistration(
  ctx: Ctx,
  body: unknown,
  files: { field: string; file: File }[] = [],
) {
  const input = parse(DriverRegistrationSchema, body);
  if (await guard(ctx, "driver", input)) return { id: null, statusUrl: null, delivered: false };
  // Validate attachments before saving anything, so a bad file never leaves a half-saved record.
  // All four documents are required for a registration.
  for (const u of DRIVER_UPLOADS)
    if (!files.some((f) => f.field === u.field && f.file.size > 0))
      throw new AppError("VALIDATION", `${u.label}: please attach this document.`, {
        field: u.field,
      });
  const { prepareDriverUploads, storeDriverUploads } = await import("./files.server");
  const uploads = await prepareDriverUploads(files);
  const serviceArea = input.counties.join(", ");
  const ipHash = await hashIp(ctx.ip);
  const now = new Date().toISOString();
  const truckTypes = input.truckTypes.join(",");
  const availability = input.availability.join(",");
  const materials = input.materials.join(",");
  const reg = check(
    await db()
      .from("driver_registrations")
      .insert({
        owner_name: input.ownerName,
        company_name: input.companyName || null,
        email: input.email.toLowerCase(),
        phone: input.phone,
        dot_number: input.dotNumber,
        mc_number: input.mcNumber || null,
        truck_type: truckTypes,
        truck_count: input.truckCount,
        payload_capacity: input.payloadCapacity,
        payload_unit: input.payloadUnit,
        service_area: serviceArea,
        current_location: input.currentLocation,
        availability,
        cdl_class: input.cdlClass,
        insurance_active: input.insuranceActive,
        preferred_materials: materials || null,
        travel_radius: input.travelRadius || null,
        georgia_attested: true,
        georgia_attested_at: now,
        notes: input.notes || null,
        ip: ipHash, // hashed — raw IPs are no longer stored
        consent_privacy: input.consentPrivacy ?? null,
        consent_contact: input.consentContact ?? null,
        consent_at: input.consentPrivacy ? now : null,
      })
      .select("id")
      .single(),
    "Saving your registration",
  ) as { id: string };
  await db().from("driver_status_history").insert({
    registration_id: reg.id,
    from_status: null,
    to_status: "new",
    note: "Submitted via website",
  });
  const consents: [string, boolean][] = [["georgia_operating_attestation", true]];
  if (input.consentPrivacy !== undefined) consents.push(["privacy_notice", input.consentPrivacy]);
  if (input.consentContact !== undefined) consents.push(["contact", input.consentContact]);
  await recordConsent(
    input.email,
    "driver_registration",
    consents,
    reg.id,
    ipHash,
    ctx.request.headers.get("user-agent"),
  );
  const attached = uploads.length ? await storeDriverUploads(reg.id, input.ownerName, uploads) : [];
  const payload = `${input.payloadCapacity} ${labelFor(PAYLOAD_UNITS, input.payloadUnit).toLowerCase()}`;

  const statusUrl = await issueDriverStatusLink(reg.id, ctx.request);

  await notifyStaff({
    permission: "drivers.read",
    channel: "drivers",
    type: "driver.registration",
    title: `New driver registration — ${input.ownerName}`,
    link: `/admin/drivers?id=${reg.id}`,
    replyTo: input.email,
    emailRows: [
      ["Owner / driver", input.ownerName],
      ["Company", input.companyName],
      ["Email", input.email],
      ["Phone", input.phone],
      ["USDOT", input.dotNumber],
      ["MC", input.mcNumber],
      ["Dump trucks", input.truckCount],
      ["Truck type", labelsFor(TRUCK_TYPES, truckTypes)],
      ["Payload capacity", payload],
      ["Current location", input.currentLocation],
      ["Counties served (GA)", serviceArea],
      ["Availability", labelsFor(AVAILABILITY, availability)],
      ["Willing to travel", labelFor(TRAVEL_RADIUS, input.travelRadius || null)],
      ["CDL class", `Class ${input.cdlClass}`],
      ["Insurance active", input.insuranceActive ? "Yes" : "No"],
      ["Preferred material", labelsFor(MATERIALS, materials)],
      ["Documents attached", attached.length ? attached.join(", ") : "None"],
      ["Notes", input.notes],
    ],
    relatedType: "driver_registration",
    relatedId: reg.id,
    request: ctx.request,
  });
  const confirm = await sendEmail({
    to: input.email,
    subject: "Your AM Consulting & Hauling registration was received",
    template: "public.driver_confirmation",
    relatedType: "driver_registration",
    relatedId: reg.id,
    html: emailLayout(
      `Registration received, ${e(input.ownerName)}`,
      `<p style="color:#4B5563">Thanks for registering with AM Consulting &amp; Hauling. Our team will review your submission and contact you, usually within one business day.</p>
       ${emailTable([
         ["USDOT", input.dotNumber],
         ["MC", input.mcNumber || "—"],
         ["Dump trucks", `${input.truckCount} × ${labelsFor(TRUCK_TYPES, truckTypes)}`],
         ["Payload capacity", payload],
         ["Current location", input.currentLocation],
         ["Counties served (GA)", serviceArea],
         ["Availability", labelsFor(AVAILABILITY, availability)],
         ["Documents received", attached.length ? attached.join(", ") : "None yet"],
       ])}
       <p style="color:#4B5563;margin-top:20px"><strong>What happens next:</strong> we review your details${attached.length < DRIVER_UPLOADS.length ? " and may ask for any missing documents (CDL, insurance certificate, W-9, truck registration)" : ""} before any loads are dispatched.</p>
       ${emailButton("Check application status", statusUrl)}
       <p style="font-size:12px;color:#6B7280">This private link expires in 90 days. Don't forward it.</p>`,
      {
        footerNote:
          "You're receiving this because you registered at amconsultingllc.net. If this wasn't you, reply to let us know.",
      },
    ),
  });
  return {
    id: reg.id,
    statusUrl,
    delivered: confirm.status === "sent",
    driverConfirmation: confirm.status === "sent",
    documents: attached,
  };
}

export async function issueDriverStatusLink(
  registrationId: string,
  request?: Request,
): Promise<string> {
  const token = randomToken();
  check(
    await db()
      .from("driver_status_tokens")
      .insert({
        registration_id: registrationId,
        token_hash: await hashToken(token),
        expires_at: new Date(Date.now() + 90 * 86400000).toISOString(),
      }),
    "Creating status link",
  );
  return `${siteUrl(request)}/drivers/status?token=${encodeURIComponent(token)}`;
}

const mask = (v: string | null) => (v ? `•••${v.slice(-3)}` : null);

/** Secure token lookup: returns applicant-safe fields only (no internal notes, no reviewer). */
export async function driverStatusByToken(ctx: Ctx, token: string) {
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:dstatus`, 30, 60);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token))
    throw new AppError("NOT_FOUND", "This link is invalid or has expired.");
  const t = await db()
    .from("driver_status_tokens")
    .select("id,registration_id,expires_at,use_count")
    .eq("token_hash", await hashToken(token))
    .maybeSingle();
  if (!t.data || new Date(t.data.expires_at).getTime() < Date.now())
    throw new AppError("NOT_FOUND", "This link is invalid or has expired.");
  await db()
    .from("driver_status_tokens")
    .update({ use_count: t.data.use_count + 1, last_used_at: new Date().toISOString() })
    .eq("id", t.data.id);
  const reg = await db()
    .from("driver_registrations")
    .select(
      "id,status,owner_name,company_name,dot_number,mc_number,truck_type,truck_count,current_location,service_area,availability,created_at,updated_at,info_request_note",
    )
    .eq("id", t.data.registration_id)
    .maybeSingle();
  if (!reg.data) throw new AppError("NOT_FOUND", "This link is invalid or has expired.");
  const r = reg.data;
  const status = r.status as DriverAppStatus;
  return {
    registration: {
      id: r.id,
      status,
      statusLabel: DRIVER_APP_PUBLIC_LABEL[status] ?? "Received",
      owner_name: r.owner_name,
      company_name: r.company_name,
      dot_number: mask(r.dot_number),
      mc_number: mask(r.mc_number),
      truck_type: r.truck_type,
      truck_count: r.truck_count,
      service_area: r.service_area,
      availability: r.availability,
      created_at: r.created_at,
      updated_at: r.updated_at,
      info_request_note: status === "info_requested" ? r.info_request_note : null,
    },
  };
}

/** Legacy reference+email lookup: minimal status only, with per-reference failure lockout. */
export async function driverStatusByIdEmail(ctx: Ctx, id: string, email: string) {
  const ipKey = await hashIp(ctx.ip);
  await enforceRateLimit(`ip:${ipKey}:dlookup`, 20, 60);
  await enforceRateLimit(
    `id:${id}:dlookup`,
    10,
    600,
    "Too many attempts for this registration. Try again later.",
  );
  await new Promise((r) => setTimeout(r, 200));
  const { data } = await db()
    .from("driver_registrations")
    .select("id,status,email,created_at,updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!data || data.email.trim().toLowerCase() !== email.trim().toLowerCase())
    throw new AppError("NOT_FOUND", "We couldn't find a registration with those details.");
  const status = data.status as DriverAppStatus;
  return {
    registration: {
      id: data.id,
      status,
      statusLabel: DRIVER_APP_PUBLIC_LABEL[status] ?? "Received",
      created_at: data.created_at,
      updated_at: data.updated_at,
      limited: true,
    },
  };
}

/** Emails a fresh secure status link if id+email match. Always returns the same response. */
export async function resendDriverStatusLink(ctx: Ctx, id: string, email: string) {
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:dresend`, 5, 3600);
  await enforceRateLimit(`id:${id}:dresend`, 3, 3600);
  const { data } = await db()
    .from("driver_registrations")
    .select("id,email,owner_name")
    .eq("id", id)
    .maybeSingle();
  if (data && data.email.trim().toLowerCase() === email.trim().toLowerCase()) {
    const url = await issueDriverStatusLink(data.id, ctx.request);
    await sendEmail({
      to: data.email,
      subject: "Your secure application status link",
      template: "public.driver_status_link",
      relatedType: "driver_registration",
      relatedId: data.id,
      html: emailLayout(
        "Your application status link",
        `<p style="color:#4B5563">Use the button below to view your application status. The link expires in 90 days.</p>${emailButton("View status", url)}`,
      ),
    });
  }
  return { message: "If those details match a registration, we've emailed a secure status link." };
}

// ---------------------------------------------------------------------------------------
export async function submitQuoteRequest(ctx: Ctx, body: unknown) {
  const input = parse(QuoteRequestSchema, body);
  if (await guard(ctx, "quote", input)) return { ref: "RECEIVED", delivered: false };
  const ipHash = await hashIp(ctx.ip);
  const serviceLabel = labelFor(SERVICE_TYPES, input.serviceType);
  const leadId = await upsertLead({
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    location: input.pickupLocation,
    service: input.serviceType,
    source: "quote_request",
    note: `Quote request — ${serviceLabel} at ${input.pickupLocation}${input.details ? `\n${input.details}` : ""}`,
  });
  const qr = check(
    await db()
      .from("quote_requests")
      .insert({
        name: input.name,
        company: input.company || null,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        service_type: input.serviceType,
        pickup_location: input.pickupLocation,
        destination: input.destination || null,
        truck_type: input.truckType || null,
        truck_count: input.truckCount ?? null,
        material: input.material || null,
        estimated_duration: input.estimatedDuration || null,
        preferred_date: input.preferredDate || null,
        details: input.details || null,
        lead_id: leadId,
        consent_privacy: true,
        ip_hash: ipHash,
      })
      .select("id,ref")
      .single(),
    "Saving your quote request",
  ) as { id: string; ref: string };
  await recordConsent(
    input.email,
    "quote_request",
    [["privacy_notice", true]],
    qr.id,
    ipHash,
    ctx.request.headers.get("user-agent"),
  );
  await notifyStaff({
    permission: "quotes.read",
    channel: "quotes",
    type: "quote.request",
    title: `New quote request ${qr.ref} — ${input.name}`,
    link: `/admin/quotes?request=${qr.id}`,
    replyTo: input.email,
    emailRows: [
      ["Name", input.name],
      ["Company", input.company],
      ["Email", input.email],
      ["Phone", input.phone],
      ["Service", serviceLabel],
      ["Jobsite / pickup", input.pickupLocation],
      ["Destination", input.destination],
      ["Trucks", input.truckCount],
      ["Preferred date", input.preferredDate],
      ["Details", input.details],
    ],
    relatedType: "quote_request",
    relatedId: qr.id,
    request: ctx.request,
  });
  const confirm = await sendEmail({
    to: input.email,
    subject: `Quote request ${qr.ref} received — AM Consulting & Hauling`,
    template: "public.quote_request_confirmation",
    relatedType: "quote_request",
    relatedId: qr.id,
    html: emailLayout(
      "We received your quote request",
      `<p style="color:#4B5563">Thanks, ${e(input.name)}. Our team will review your request and follow up. Estimates are for planning only and are not binding until confirmed in writing.</p>${emailTable(
        [
          ["Reference", qr.ref],
          ["Service", serviceLabel],
          ["Jobsite / pickup", input.pickupLocation],
          ["Preferred date", input.preferredDate || "Flexible"],
        ],
      )}`,
    ),
  });
  return { ref: qr.ref, delivered: confirm.status === "sent" };
}

// ---------------------------------------------------------------------------------------
export async function availableSlots(ctx: Ctx, date: string) {
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:slots`, 60, 60);
  const hours = await getSetting("appointments.business_hours");
  const dayStart = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(dayStart.getTime())) throw new AppError("VALIDATION", "Invalid date");
  const from = new Date(dayStart.getTime() - 86400000).toISOString();
  const to = new Date(dayStart.getTime() + 2 * 86400000).toISOString();
  const busy = await db()
    .from("appointments")
    .select("starts_at,ends_at")
    .in("status", ["requested", "confirmed"])
    .gte("ends_at", from)
    .lte("starts_at", to);
  const slots = slotsForDate(
    date,
    hours,
    (busy.data ?? []).map((b: { starts_at: string; ends_at: string }) => ({
      start: b.starts_at,
      end: b.ends_at,
    })),
  );
  return { timezone: hours.timezone, slots };
}

export async function submitAppointment(ctx: Ctx, body: unknown) {
  const input = parse(AppointmentRequestSchema, body);
  if (await guard(ctx, "appointment", input, 3, 10)) return { status: "requested" };
  const hours = await getSetting("appointments.business_hours");
  const start = new Date(input.start);
  const localDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: hours.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(start);
  const { slots } = await availableSlots(ctx, localDate);
  const slot = slots.find((s) => s.start === start.toISOString());
  if (!slot)
    throw new AppError("CONFLICT", "That time is no longer available. Please choose another slot.");
  const ipHash = await hashIp(ctx.ip);
  const token = randomToken();
  const status = hours.require_approval === false ? "confirmed" : "requested";
  const topic = labelFor(APPOINTMENT_TOPICS, input.topic);
  const leadId = await upsertLead({
    name: input.name,
    email: input.email,
    phone: input.phone,
    company: input.company,
    source: "appointment",
    note: `Consultation requested: ${topic} at ${slot.start}`,
  });
  const appt = check(
    await db()
      .from("appointments")
      .insert({
        name: input.name,
        email: input.email.toLowerCase(),
        phone: input.phone || null,
        company: input.company || null,
        topic: input.topic,
        notes: input.notes || null,
        starts_at: slot.start,
        ends_at: slot.end,
        status,
        lead_id: leadId,
        manage_token_hash: await hashToken(token),
        consent_privacy: true,
        ip_hash: ipHash,
      })
      .select("id")
      .single(),
    "Booking your consultation",
  ) as { id: string };
  await recordConsent(
    input.email,
    "appointment",
    [["privacy_notice", true]],
    appt.id,
    ipHash,
    ctx.request.headers.get("user-agent"),
  );
  const when = new Intl.DateTimeFormat("en-US", {
    timeZone: hours.timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(start);
  const manageUrl = `${siteUrl(ctx.request)}/book/manage?token=${encodeURIComponent(token)}`;
  await notifyStaff({
    permission: "appointments.read",
    channel: "appointments",
    type: "appointment.requested",
    title: `Consultation ${status === "confirmed" ? "booked" : "requested"} — ${input.name}, ${when}`,
    link: `/admin/appointments?id=${appt.id}`,
    replyTo: input.email,
    emailRows: [
      ["Name", input.name],
      ["Email", input.email],
      ["Phone", input.phone],
      ["Company", input.company],
      ["Topic", topic],
      ["When", when],
      ["Notes", input.notes],
    ],
    relatedType: "appointment",
    relatedId: appt.id,
    request: ctx.request,
  });
  await sendEmail({
    to: input.email,
    subject:
      status === "confirmed"
        ? "Your consultation is booked"
        : "Your consultation request was received",
    template: "public.appointment_received",
    relatedType: "appointment",
    relatedId: appt.id,
    html: emailLayout(
      status === "confirmed" ? "Consultation booked" : "Consultation request received",
      `<p style="color:#4B5563">${status === "confirmed" ? "Your consultation is confirmed." : "We'll confirm this time shortly."}</p>${emailTable(
        [
          ["When", `${when} (${hours.timezone})`],
          ["Topic", topic],
        ],
      )}${emailButton("Reschedule or cancel", manageUrl)}`,
    ),
  });
  return { status, when };
}

export async function appointmentByToken(ctx: Ctx, token: string) {
  await enforceRateLimit(`ip:${await hashIp(ctx.ip)}:appt`, 30, 60);
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token))
    throw new AppError("NOT_FOUND", "This link is invalid.");
  const { data } = await db()
    .from("appointments")
    .select("id,name,topic,starts_at,ends_at,status")
    .eq("manage_token_hash", await hashToken(token))
    .maybeSingle();
  if (!data) throw new AppError("NOT_FOUND", "This link is invalid.");
  return { appointment: { ...data, topicLabel: labelFor(APPOINTMENT_TOPICS, data.topic) } };
}

export async function cancelAppointmentByToken(ctx: Ctx, token: string) {
  const { appointment } = await appointmentByToken(ctx, token);
  if (!["requested", "confirmed"].includes(appointment.status))
    throw new AppError("CONFLICT", "This appointment can no longer be changed online.");
  check(
    await db().from("appointments").update({ status: "cancelled" }).eq("id", appointment.id),
    "Cancelling",
  );
  await db().from("audit_logs").insert({
    action: "appointment.cancelled_by_customer",
    entity_type: "appointment",
    entity_id: appointment.id,
    summary: "Cancelled via customer manage link",
  });
  await notifyStaff({
    permission: "appointments.read",
    type: "appointment.cancelled",
    title: `Consultation cancelled by customer — ${appointment.name}`,
    link: `/admin/appointments?id=${appointment.id}`,
  });
  return { status: "cancelled" };
}

// ---------------------------------------------------------------------------------------
export async function submitPrivacyRequest(ctx: Ctx, body: unknown) {
  const input = parse(PrivacyRequestSchema, body);
  if (await guard(ctx, "privacy", input, 3, 10)) return { ref: "RECEIVED" };
  const ipHash = await hashIp(ctx.ip);
  const pr = check(
    await db()
      .from("privacy_requests")
      .insert({
        name: input.name,
        email: input.email.toLowerCase(),
        state_of_residence: input.stateOfResidence || null,
        request_type: input.requestType,
        details: input.details || null,
        ip_hash: ipHash,
      })
      .select("id,ref,due_at")
      .single(),
    "Saving your request",
  ) as { id: string; ref: string; due_at: string };
  await notifyStaff({
    permission: "compliance.read",
    type: "privacy.request",
    title: `Privacy request ${pr.ref} (${labelFor(PRIVACY_REQUEST_TYPES, input.requestType)})`,
    body: `Respond by ${new Date(pr.due_at).toDateString()}.`,
    link: "/admin/compliance",
  });
  await sendEmail({
    to: input.email,
    subject: `Privacy request ${pr.ref} received`,
    template: "public.privacy_request_received",
    relatedType: "privacy_request",
    relatedId: pr.id,
    html: emailLayout(
      "We received your privacy request",
      `<p style="color:#4B5563">Reference <strong>${pr.ref}</strong>. We may contact you to verify your identity before acting on the request. We aim to respond within 45 days.</p>`,
    ),
  });
  return { ref: pr.ref };
}

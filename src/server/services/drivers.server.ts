import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import {
  DRIVER_APP_PUBLIC_LABEL,
  DRIVER_APP_STATUSES,
  DRIVER_APP_TRANSITIONS,
  type DriverAppStatus,
} from "@/lib/shared/domain";
import { sanitizeSearchTerm } from "@/lib/shared/resource-schema";
import { audit } from "../audit.server";
import { actorOf, requirePermission, type StaffContext } from "../authz.server";
import { check, db } from "../db.server";
import { emailButton, emailLayout, sendEmail, e } from "../email.server";
import { issueDriverStatusLink } from "./intake.server";

const COLS =
  "id,created_at,updated_at,owner_name,company_name,email,phone,dot_number,mc_number,truck_type,truck_count,payload_capacity,payload_unit,current_location,service_area,availability,travel_radius,cdl_class,insurance_active,preferred_materials,georgia_attested,georgia_attested_at,notes,status,reviewer_id,archived_at,consent_privacy,consent_contact,info_request_note,decision_note,decided_at";

export const ListApplicationsInput = z.object({
  search: z.string().max(200).optional().default(""),
  status: z.string().optional().default(""),
  availability: z.string().optional().default(""),
  truckType: z.string().optional().default(""),
  serviceArea: z.string().max(200).optional().default(""),
  reviewerId: z.string().optional().default(""),
  includeArchived: z.boolean().optional().default(false),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(500).default(50),
});

function filtered(p: z.infer<typeof ListApplicationsInput>, cols = COLS) {
  let q = db()
    .from("driver_registrations")
    .select(cols, { count: "exact" })
    .order("created_at", { ascending: false });
  if (p.status) {
    if (!(DRIVER_APP_STATUSES as readonly string[]).includes(p.status))
      throw new AppError("VALIDATION", "Invalid status");
    q = q.eq("status", p.status);
  } else if (!p.includeArchived) q = q.neq("status", "archived");
  // Multi-select values are stored comma-separated; option values never overlap as substrings.
  const opt = (v: string) => sanitizeSearchTerm(v).replace(/[^a-z-]/g, "");
  if (p.availability) q = q.ilike("availability", `%${opt(p.availability)}%`);
  if (p.truckType) q = q.ilike("truck_type", `%${opt(p.truckType)}%`);
  if (p.reviewerId)
    q = p.reviewerId === "__none" ? q.is("reviewer_id", null) : q.eq("reviewer_id", p.reviewerId);
  const area = sanitizeSearchTerm(p.serviceArea);
  if (area) q = q.or(`service_area.ilike.%${area}%,current_location.ilike.%${area}%`);
  const s = sanitizeSearchTerm(p.search);
  if (s)
    q = q.or(
      ["owner_name", "company_name", "email", "phone", "dot_number", "mc_number"]
        .map((c) => `${c}.ilike.%${s}%`)
        .join(","),
    );
  return q;
}

export async function listApplications(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "drivers.read");
  const p = ListApplicationsInput.parse(input ?? {});
  const from = (p.page - 1) * p.pageSize;
  const res = await filtered(p).range(from, from + p.pageSize - 1);
  const rows = check(res, "Loading applications") as unknown as Record<string, unknown>[];
  const counts = await db().from("driver_registrations").select("status");
  const byStatus: Record<string, number> = {};
  for (const r of (counts.data ?? []) as { status: string }[])
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
  return { rows, total: res.count ?? rows.length, byStatus };
}

export async function getApplication(ctx: StaffContext, id: string) {
  requirePermission(ctx, "drivers.read");
  const [app, history, notes, driver, docs] = await Promise.all([
    db().from("driver_registrations").select(COLS).eq("id", id).maybeSingle(),
    db()
      .from("driver_status_history")
      .select("id,from_status,to_status,note,changed_by,created_at")
      .eq("registration_id", id)
      .order("created_at", { ascending: false }),
    db()
      .from("driver_notes")
      .select("id,body,author_id,created_at")
      .eq("registration_id", id)
      .order("created_at", { ascending: false }),
    db().from("drivers").select("id,full_name,status").eq("registration_id", id).maybeSingle(),
    db()
      .from("documents")
      .select("id,title,category,filename,created_at,expires_on")
      .eq("entity_type", "driver_application")
      .eq("entity_id", id)
      .eq("is_current", true),
  ]);
  if (!app.data) throw new AppError("NOT_FOUND", "Application not found.");
  const staffIds = [
    ...new Set(
      [
        ...(history.data ?? []).map((h: { changed_by: string }) => h.changed_by),
        ...(notes.data ?? []).map((n: { author_id: string }) => n.author_id),
        (app.data as { reviewer_id?: string }).reviewer_id,
      ].filter(Boolean),
    ),
  ];
  const staff = staffIds.length
    ? ((await db().from("staff_profiles").select("user_id,full_name,email").in("user_id", staffIds))
        .data ?? [])
    : [];
  const names = Object.fromEntries(
    staff.map((s: { user_id: string; full_name: string | null; email: string }) => [
      s.user_id,
      s.full_name || s.email,
    ]),
  );
  return {
    application: app.data,
    history: history.data ?? [],
    notes: notes.data ?? [],
    driver: driver.data,
    documents: docs.data ?? [],
    staffNames: names,
  };
}

export const ChangeStatusInput = z.object({
  id: z.string().uuid(),
  status: z.enum(DRIVER_APP_STATUSES),
  note: z.string().trim().max(2000).optional().default(""),
  /** Message shown to the applicant (info requests / decisions). */
  applicantMessage: z.string().trim().max(2000).optional().default(""),
  notifyApplicant: z.boolean().optional().default(true),
});

export async function changeApplicationStatus(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "drivers.review");
  const p = ChangeStatusInput.parse(input);
  const cur = await db().from("driver_registrations").select(COLS).eq("id", p.id).maybeSingle();
  if (!cur.data) throw new AppError("NOT_FOUND", "Application not found.");
  const app = cur.data as unknown as Record<string, any>;
  const from = (app.status ?? "new") as DriverAppStatus;
  if (from === p.status) return { ok: true };
  if (!(DRIVER_APP_TRANSITIONS[from] ?? DRIVER_APP_TRANSITIONS.new).includes(p.status)) {
    throw new AppError("VALIDATION", `Can't move an application from ${from} to ${p.status}.`);
  }
  if (p.status === "info_requested" && !p.applicantMessage)
    throw new AppError("VALIDATION", "Tell the applicant what information you need.");
  const patch: Record<string, unknown> = { status: p.status };
  if (p.status === "info_requested") patch.info_request_note = p.applicantMessage;
  if (p.status === "approved" || p.status === "rejected") {
    patch.decided_at = new Date().toISOString();
    patch.decision_note = p.note || null;
  }
  if (p.status === "archived") patch.archived_at = new Date().toISOString();
  else if (from === "archived") patch.archived_at = null;
  if (!app.reviewer_id) patch.reviewer_id = ctx.userId;
  check(
    await db().from("driver_registrations").update(patch).eq("id", p.id),
    "Updating application",
  );
  await db()
    .from("driver_status_history")
    .insert({
      registration_id: p.id,
      from_status: from,
      to_status: p.status,
      note: p.note || null,
      changed_by: ctx.userId,
    });

  let driverId: string | null = null;
  if (p.status === "approved") {
    const existing = await db()
      .from("drivers")
      .select("id")
      .eq("registration_id", p.id)
      .maybeSingle();
    if (existing.data) {
      driverId = existing.data.id;
      await db().from("drivers").update({ status: "active", archived_at: null }).eq("id", driverId);
    } else {
      const created = check(
        await db()
          .from("drivers")
          .insert({
            registration_id: p.id,
            full_name: app.owner_name,
            company_name: app.company_name,
            email: app.email,
            phone: app.phone,
            service_area: app.service_area,
            usdot_number: app.dot_number,
            mc_number: app.mc_number,
            status: "active",
          })
          .select("id")
          .single(),
        "Creating driver record",
      ) as { id: string };
      driverId = created.id;
    }
  }
  await audit(
    actorOf(ctx),
    `driver_application.${p.status}`,
    "driver_application",
    p.id,
    `Application for ${app.owner_name}: ${from} → ${p.status}`,
    { status: { from, to: p.status }, note: p.note || undefined },
  );

  let notified = false;
  if (
    p.notifyApplicant &&
    ["info_requested", "approved", "rejected", "reviewed"].includes(p.status)
  ) {
    const statusUrl = await issueDriverStatusLink(p.id);
    const headline: Record<string, string> = {
      reviewed: "Your application is under review",
      info_requested: "We need a little more information",
      approved: "Your registration has been approved",
      rejected: "Update on your registration",
    };
    const res = await sendEmail({
      to: app.email,
      subject: `${headline[p.status]} — AM Consulting & Hauling`,
      template: `driver.status.${p.status}`,
      relatedType: "driver_registration",
      relatedId: p.id,
      html: emailLayout(
        headline[p.status],
        `<p style="color:#4B5563">Hi ${e(app.owner_name)}, your application status is now <strong>${e(DRIVER_APP_PUBLIC_LABEL[p.status])}</strong>.</p>
         ${p.applicantMessage ? `<div style="background:#F4F7FB;border-radius:8px;padding:14px;white-space:pre-wrap">${e(p.applicantMessage)}</div>` : ""}
         ${emailButton("View application status", statusUrl)}`,
      ),
    });
    notified = res.status === "sent";
  }
  return { ok: true, driverId, notified };
}

export async function addApplicationNote(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "drivers.write");
  const p = z
    .object({ id: z.string().uuid(), body: z.string().trim().min(1).max(4000) })
    .parse(input);
  check(
    await db()
      .from("driver_notes")
      .insert({ registration_id: p.id, author_id: ctx.userId, body: p.body }),
    "Saving note",
  );
  await audit(
    actorOf(ctx),
    "driver_application.note",
    "driver_application",
    p.id,
    "Added internal note",
  );
  return { ok: true };
}

export async function assignReviewer(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "drivers.review");
  const p = z
    .object({ id: z.string().uuid(), reviewerId: z.string().uuid().nullable() })
    .parse(input);
  if (p.reviewerId) {
    const r = await db().from("user_roles").select("role").eq("user_id", p.reviewerId);
    if (!r.data?.length) throw new AppError("VALIDATION", "Reviewer must be a staff member.");
  }
  check(
    await db().from("driver_registrations").update({ reviewer_id: p.reviewerId }).eq("id", p.id),
    "Assigning reviewer",
  );
  await audit(
    actorOf(ctx),
    "driver_application.assign_reviewer",
    "driver_application",
    p.id,
    "Reviewer changed",
    { reviewer_id: p.reviewerId },
  );
  return { ok: true };
}

export async function exportApplications(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "drivers.export");
  const p = ListApplicationsInput.parse({ ...(input as object), page: 1, pageSize: 500 });
  const cols =
    "id,created_at,status,owner_name,company_name,email,phone,dot_number,mc_number,truck_type,truck_count,payload_capacity,payload_unit,current_location,service_area,availability,travel_radius,cdl_class,insurance_active,preferred_materials,georgia_attested";
  const rows = (check(await filtered(p, cols).range(0, 4999), "Exporting") ??
    []) as unknown as Record<string, unknown>[];
  const header = cols.split(",");
  const cell = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [header.join(","), ...rows.map((r) => header.map((h) => cell(r[h])).join(","))].join(
    "\n",
  );
  await audit(
    actorOf(ctx),
    "driver_application.export",
    "driver_application",
    null,
    `Exported ${rows.length} driver applications`,
    { filters: p },
  );
  return {
    filename: `driver-registrations-${new Date().toISOString().slice(0, 10)}.csv`,
    csv,
    count: rows.length,
  };
}

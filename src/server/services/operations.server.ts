import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import { APPOINTMENT_TOPICS, LEAD_STAGES, labelFor } from "@/lib/shared/domain";
import { audit } from "../audit.server";
import { actorOf, can, requirePermission, type StaffContext } from "../authz.server";
import { check, db } from "../db.server";
import { emailLayout, emailTable, sendEmail } from "../email.server";
import { getSetting } from "../settings.server";
import { detectDispatchConflicts } from "./resource-hooks.server";

const uuid = z.string().uuid();
const Range = z.object({ from: z.string().datetime(), to: z.string().datetime() });

async function labels(table: string, ids: string[], cols: string[], key = "id") {
  if (!ids.length) return {} as Record<string, string>;
  const { data } = await db()
    .from(table)
    .select([key, ...cols].join(","))
    .in(key, ids);
  return Object.fromEntries(
    ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => [
      String(r[key]),
      cols
        .map((c) => r[c])
        .filter(Boolean)
        .join(" · "),
    ]),
  );
}
const uniq = (xs: unknown[]) => [...new Set(xs.filter((x): x is string => typeof x === "string"))];

// ---- dispatch -------------------------------------------------------------------------
export async function dispatchCalendar(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dispatch.read");
  const p = Range.extend({
    driverId: uuid.optional(),
    truckId: uuid.optional(),
    projectId: uuid.optional(),
    dispatcherId: uuid.optional(),
    includeCancelled: z.boolean().optional(),
  }).parse(input);
  const span = new Date(p.to).getTime() - new Date(p.from).getTime();
  if (span <= 0 || span > 62 * 86400000)
    throw new AppError("VALIDATION", "Choose a range of up to two months.");
  let q = db()
    .from("dispatch_jobs")
    .select(
      "id,dispatch_number,status,scheduled_start,scheduled_end,pickup_location,destination,driver_id,truck_id,project_id,dispatcher_id,material",
    )
    .lt("scheduled_start", p.to)
    .gt("scheduled_end", p.from)
    .order("scheduled_start")
    .limit(1000);
  if (p.driverId) q = q.eq("driver_id", p.driverId);
  if (p.truckId) q = q.eq("truck_id", p.truckId);
  if (p.projectId) q = q.eq("project_id", p.projectId);
  if (p.dispatcherId) q = q.eq("dispatcher_id", p.dispatcherId);
  if (!p.includeCancelled) q = q.neq("status", "cancelled");
  const jobs = (check(await q, "Loading calendar") ?? []) as Record<string, unknown>[];
  const [drivers, trucks, projects, staff] = await Promise.all([
    labels("drivers", uniq(jobs.map((j) => j.driver_id)), ["full_name"]),
    labels("trucks", uniq(jobs.map((j) => j.truck_id)), ["unit_number"]),
    labels("projects", uniq(jobs.map((j) => j.project_id)), ["project_number", "name"]),
    labels(
      "staff_profiles",
      uniq(jobs.map((j) => j.dispatcher_id)),
      ["full_name", "email"],
      "user_id",
    ),
  ]);
  return { jobs, labels: { ...drivers, ...trucks, ...projects, ...staff } };
}

export async function dispatchWorkload(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dispatch.read");
  const p = Range.parse(input);
  const { data } = await db()
    .from("dispatch_jobs")
    .select("dispatcher_id,driver_id,status,scheduled_start,scheduled_end")
    .lt("scheduled_start", p.to)
    .gt("scheduled_end", p.from)
    .neq("status", "cancelled")
    .limit(5000);
  const by = (key: "dispatcher_id" | "driver_id") => {
    const m = new Map<string, { id: string | null; jobs: number; hours: number; open: number }>();
    for (const j of (data ?? []) as Record<string, string>[]) {
      const id = j[key] ?? "__unassigned";
      const e = m.get(id) ?? { id: j[key] ?? null, jobs: 0, hours: 0, open: 0 };
      e.jobs += 1;
      e.hours +=
        (new Date(j.scheduled_end).getTime() - new Date(j.scheduled_start).getTime()) / 3600000;
      if (j.status !== "completed") e.open += 1;
      m.set(id, e);
    }
    return [...m.values()].sort((a, b) => b.jobs - a.jobs);
  };
  const dispatchers = by("dispatcher_id");
  const drivers = by("driver_id");
  return {
    dispatchers,
    drivers,
    labels: {
      ...(await labels(
        "staff_profiles",
        uniq(dispatchers.map((d) => d.id)),
        ["full_name", "email"],
        "user_id",
      )),
      ...(await labels("drivers", uniq(drivers.map((d) => d.id)), ["full_name"])),
    },
  };
}

export async function dispatchDetail(ctx: StaffContext, id: string) {
  requirePermission(ctx, "dispatch.read");
  const [history, comms, loads] = await Promise.all([
    db()
      .from("dispatch_status_history")
      .select("id,from_status,to_status,note,changed_by,created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    db()
      .from("dispatch_communications")
      .select("id,channel,direction,counterpart,summary,created_by,created_at")
      .eq("job_id", id)
      .order("created_at", { ascending: false }),
    db()
      .from("load_records")
      .select("id,ticket_number,material,quantity,unit,recorded_at,notes")
      .eq("job_id", id)
      .order("recorded_at", { ascending: false }),
  ]);
  const staff = await labels(
    "staff_profiles",
    uniq(
      [...(history.data ?? []), ...(comms.data ?? [])].map(
        (r: Record<string, unknown>) => r.changed_by ?? r.created_by,
      ),
    ),
    ["full_name", "email"],
    "user_id",
  );
  return {
    history: history.data ?? [],
    communications: comms.data ?? [],
    loads: loads.data ?? [],
    staff,
    canManageAll: can(ctx, "dispatch.manage_all"),
  };
}

export async function checkDispatchConflicts(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dispatch.read");
  const p = z
    .object({
      id: uuid.optional(),
      driver_id: uuid.nullable().optional(),
      truck_id: uuid.nullable().optional(),
      scheduled_start: z.string().datetime(),
      scheduled_end: z.string().datetime(),
    })
    .parse(input);
  return { conflicts: await detectDispatchConflicts({ ...p, status: "scheduled" }) };
}

// ---- projects -------------------------------------------------------------------------
export async function projectDetail(ctx: StaffContext, id: string) {
  requirePermission(ctx, "projects.read");
  const [jobs, resources, docs, estimate] = await Promise.all([
    can(ctx, "dispatch.read")
      ? db()
          .from("dispatch_jobs")
          .select(
            "id,dispatch_number,status,scheduled_start,scheduled_end,driver_id,truck_id,pickup_location",
          )
          .eq("project_id", id)
          .order("scheduled_start")
      : Promise.resolve({ data: [] }),
    db()
      .from("project_resources")
      .select("id,resource_type,staff_id,driver_id,truck_id,role,created_at")
      .eq("project_id", id),
    can(ctx, "documents.read")
      ? db()
          .from("documents")
          .select("id,title,category,filename,created_at,sensitivity")
          .eq("entity_type", "project")
          .eq("entity_id", id)
          .eq("is_current", true)
          .is("archived_at", null)
      : Promise.resolve({ data: [] }),
    db()
      .from("estimates")
      .select("id,estimate_number,total,status")
      .eq("project_id", id)
      .maybeSingle(),
  ]);
  const jl = (jobs.data ?? []) as Record<string, unknown>[];
  const rl = (resources.data ?? []) as Record<string, unknown>[];
  const lab = {
    ...(await labels(
      "drivers",
      uniq([...jl.map((j) => j.driver_id), ...rl.map((r) => r.driver_id)]),
      ["full_name"],
    )),
    ...(await labels("trucks", uniq([...jl.map((j) => j.truck_id), ...rl.map((r) => r.truck_id)]), [
      "unit_number",
    ])),
    ...(await labels(
      "staff_profiles",
      uniq(rl.map((r) => r.staff_id)),
      ["full_name", "email"],
      "user_id",
    )),
  };
  const total = jl.filter((j) => j.status !== "cancelled").length;
  const done = jl.filter((j) => j.status === "completed").length;
  return {
    jobs: jl,
    resources: rl,
    documents: docs.data ?? [],
    estimate: estimate.data,
    labels: lab,
    progress: { total, done, pct: total ? Math.round((done / total) * 100) : 0 },
  };
}

export async function addProjectResource(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "projects.write");
  const p = z
    .object({
      projectId: uuid,
      type: z.enum(["staff", "driver", "truck"]),
      resourceId: uuid,
      role: z.string().max(80).optional(),
    })
    .parse(input);
  const row: Record<string, unknown> = {
    project_id: p.projectId,
    resource_type: p.type,
    role: p.role ?? null,
  };
  row[`${p.type === "staff" ? "staff" : p.type}_id`] = p.resourceId;
  check(await db().from("project_resources").insert(row), "Assigning resource");
  await audit(
    actorOf(ctx),
    "project.assign_resource",
    "project",
    p.projectId,
    `Assigned ${p.type} to project`,
    { resource_id: p.resourceId },
  );
  return { ok: true };
}

export async function removeProjectResource(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "projects.write");
  const p = z.object({ id: uuid, projectId: uuid }).parse(input);
  check(
    await db().from("project_resources").delete().eq("id", p.id).eq("project_id", p.projectId),
    "Removing resource",
  );
  await audit(
    actorOf(ctx),
    "project.remove_resource",
    "project",
    p.projectId,
    "Removed resource from project",
  );
  return { ok: true };
}

// ---- CRM ------------------------------------------------------------------------------
export async function pipeline(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "crm.read");
  const p = z.object({ ownerId: uuid.optional() }).parse(input ?? {});
  let q = db()
    .from("leads")
    .select("id,name,company,stage,service_interest,source,owner_id,next_follow_up_at,created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (p.ownerId) q = q.eq("owner_id", p.ownerId);
  const leads = (check(await q, "Loading pipeline") ?? []) as Record<string, unknown>[];
  const columns = Object.fromEntries(
    LEAD_STAGES.map((s) => [s, leads.filter((l) => l.stage === s)]),
  );
  return {
    columns,
    owners: await labels(
      "staff_profiles",
      uniq(leads.map((l) => l.owner_id)),
      ["full_name", "email"],
      "user_id",
    ),
  };
}

export async function leadDetail(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "crm.read");
  const p = z
    .object({ leadId: uuid.optional(), customerId: uuid.optional() })
    .refine((v) => v.leadId || v.customerId)
    .parse(input);
  const col = p.leadId ? "lead_id" : "customer_id";
  const id = (p.leadId ?? p.customerId)!;
  const [activities, tasks, estimates, projects, contacts, submissions] = await Promise.all([
    db()
      .from("lead_activities")
      .select("id,type,body,created_by,created_at")
      .eq(col, id)
      .order("created_at", { ascending: false })
      .limit(100),
    db()
      .from("follow_up_tasks")
      .select("id,title,status,due_at,assigned_to,priority")
      .eq(col, id)
      .order("due_at"),
    can(ctx, "quotes.read")
      ? db()
          .from("estimates")
          .select("id,estimate_number,title,status,total,created_at")
          .eq(col, id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    p.customerId && can(ctx, "projects.read")
      ? db().from("projects").select("id,project_number,name,status").eq("customer_id", id)
      : Promise.resolve({ data: [] }),
    p.customerId
      ? db()
          .from("customer_contacts")
          .select("id,name,title,email,phone,is_primary")
          .eq("customer_id", id)
      : Promise.resolve({ data: [] }),
    p.leadId
      ? db()
          .from("contact_submissions")
          .select("id,message,service,created_at")
          .eq("lead_id", id)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);
  const staff = await labels(
    "staff_profiles",
    uniq([
      ...(activities.data ?? []).map((a: { created_by: string }) => a.created_by),
      ...(tasks.data ?? []).map((t: { assigned_to: string }) => t.assigned_to),
    ]),
    ["full_name", "email"],
    "user_id",
  );
  return {
    activities: activities.data ?? [],
    tasks: tasks.data ?? [],
    estimates: estimates.data ?? [],
    projects: projects.data ?? [],
    contacts: contacts.data ?? [],
    submissions: submissions.data ?? [],
    staff,
  };
}

export async function convertLeadToCustomer(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "crm.write");
  const p = z.object({ leadId: uuid, existingCustomerId: uuid.optional() }).parse(input);
  const { data: lead } = await db().from("leads").select("*").eq("id", p.leadId).maybeSingle();
  if (!lead) throw new AppError("NOT_FOUND", "Lead not found.");
  let customerId = p.existingCustomerId ?? lead.customer_id;
  if (!customerId) {
    const c = check(
      await db()
        .from("customers")
        .insert({
          name: lead.name,
          company: lead.company,
          email: lead.email,
          phone: lead.phone,
          address: lead.location,
          service_interest: lead.service_interest,
          source: lead.source,
          account_owner_id: lead.owner_id ?? ctx.userId,
          notes: lead.notes,
        })
        .select("id")
        .single(),
      "Creating customer",
    ) as { id: string };
    customerId = c.id;
  }
  check(
    await db()
      .from("leads")
      .update({ customer_id: customerId, stage: lead.stage === "lost" ? lead.stage : "won" })
      .eq("id", p.leadId),
    "Linking lead",
  );
  await db().from("lead_activities").insert({
    lead_id: p.leadId,
    customer_id: customerId,
    type: "stage_change",
    body: "Converted to customer",
    created_by: ctx.userId,
  });
  await audit(
    actorOf(ctx),
    "lead.convert",
    "lead",
    p.leadId,
    `Converted lead ${lead.name} to customer`,
    { customer_id: customerId },
  );
  return { customerId };
}

// ---- appointments ---------------------------------------------------------------------
export async function listAppointments(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "appointments.read");
  const p = Range.extend({ status: z.string().optional() }).parse(input);
  let q = db()
    .from("appointments")
    .select(
      "id,name,email,phone,company,topic,notes,starts_at,ends_at,status,staff_id,lead_id,created_at",
    )
    .gte("starts_at", p.from)
    .lte("starts_at", p.to)
    .order("starts_at")
    .limit(500);
  if (p.status) q = q.eq("status", p.status);
  const rows = (check(await q, "Loading appointments") ?? []) as Record<string, unknown>[];
  const hours = await getSetting("appointments.business_hours");
  return {
    appointments: rows,
    timezone: hours.timezone,
    staff: await labels(
      "staff_profiles",
      uniq(rows.map((r) => r.staff_id)),
      ["full_name", "email"],
      "user_id",
    ),
  };
}

export async function updateAppointment(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "appointments.write");
  const p = z
    .object({
      id: uuid,
      status: z.enum(["requested", "confirmed", "cancelled", "completed", "no_show"]).optional(),
      startsAt: z.string().datetime().optional(),
      staffId: uuid.nullable().optional(),
      notes: z.string().max(1500).optional(),
      notifyCustomer: z.boolean().default(true),
    })
    .parse(input);
  const { data: cur } = await db().from("appointments").select("*").eq("id", p.id).maybeSingle();
  if (!cur) throw new AppError("NOT_FOUND", "Appointment not found.");
  const hours = await getSetting("appointments.business_hours");
  const patch: Record<string, unknown> = {};
  if (p.status) patch.status = p.status;
  if (p.staffId !== undefined) patch.staff_id = p.staffId;
  if (p.notes !== undefined) patch.notes = p.notes;
  let rescheduled = false;
  if (p.startsAt && p.startsAt !== new Date(cur.starts_at).toISOString()) {
    const start = new Date(p.startsAt);
    patch.starts_at = start.toISOString();
    patch.ends_at = new Date(start.getTime() + hours.slot_minutes * 60000).toISOString();
    if (!p.status) patch.status = "confirmed";
    rescheduled = true;
  }
  check(await db().from("appointments").update(patch).eq("id", p.id), "Updating appointment");
  await audit(
    actorOf(ctx),
    rescheduled ? "appointment.reschedule" : `appointment.${p.status ?? "update"}`,
    "appointment",
    p.id,
    `Appointment for ${cur.name} updated`,
    patch,
  );
  let emailStatus: string | null = null;
  const newStatus = (patch.status as string | undefined) ?? cur.status;
  if (
    p.notifyCustomer &&
    (rescheduled ||
      (p.status && p.status !== cur.status && ["confirmed", "cancelled"].includes(p.status)))
  ) {
    const when = new Intl.DateTimeFormat("en-US", {
      timeZone: hours.timezone,
      dateStyle: "full",
      timeStyle: "short",
    }).format(new Date((patch.starts_at as string) ?? cur.starts_at));
    const title =
      newStatus === "cancelled"
        ? "Your consultation was cancelled"
        : rescheduled
          ? "Your consultation was rescheduled"
          : "Your consultation is confirmed";
    const r = await sendEmail({
      to: cur.email,
      subject: `${title} — AM Consulting & Hauling`,
      template: `appointment.${rescheduled ? "rescheduled" : newStatus}`,
      relatedType: "appointment",
      relatedId: p.id,
      html: emailLayout(
        title,
        emailTable([
          ["When", `${when} (${hours.timezone})`],
          ["Topic", labelFor(APPOINTMENT_TOPICS, cur.topic)],
        ]) +
          `<p style="color:#4B5563;margin-top:16px">Questions? Reply to this email or call 404-862-0305.</p>`,
      ),
    });
    emailStatus = r.status;
  }
  return { ok: true, emailStatus };
}

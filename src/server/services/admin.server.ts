import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import { canManageRole, isRole, ROLES, type Role } from "@/lib/shared/permissions";
import { sanitizeSearchTerm } from "@/lib/shared/resource-schema";
import { audit } from "../audit.server";
import { actorOf, can, requirePermission, type StaffContext } from "../authz.server";
import { check, db } from "../db.server";
import { emailButton, emailLayout, sendEmail } from "../email.server";
import { notifyStaff } from "../notify.server";
import { SETTINGS_DEFAULTS, getSetting, type SettingsShape } from "../settings.server";
import { publishDueSections } from "./cms.server";

const uuid = z.string().uuid();
const count = async (q: any) => (await q).count ?? 0;
const head = (table: string) => db().from(table).select("id", { count: "exact", head: true });

// ---- dashboard ------------------------------------------------------------------------
export async function dashboardOverview(ctx: StaffContext) {
  requirePermission(ctx, "dashboard.view");
  const now = new Date();
  const in7 = new Date(now.getTime() + 7 * 86400000).toISOString();
  const in30 = new Date(now.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const cards: Record<string, number> = {};
  const jobs: Promise<void>[] = [];
  const add = (key: string, q: any) => jobs.push(count(q).then((n) => void (cards[key] = n)));
  if (can(ctx, "drivers.read")) {
    add(
      "pendingApplications",
      head("driver_registrations").in("status", ["new", "reviewed", "info_requested"]),
    );
    add("activeDrivers", head("drivers").eq("status", "active").is("archived_at", null));
  }
  if (can(ctx, "fleet.read")) {
    add(
      "activeTrucks",
      head("trucks").is("archived_at", null).neq("availability", "out_of_service"),
    );
    add(
      "expiringTruckDocs",
      head("trucks")
        .is("archived_at", null)
        .or(`registration_expires_on.lte.${in30},insurance_expires_on.lte.${in30}`),
    );
  }
  if (can(ctx, "dispatch.read")) {
    add(
      "openDispatch",
      head("dispatch_jobs").in("status", [
        "new",
        "scheduled",
        "assigned",
        "in_progress",
        "on_hold",
      ]),
    );
    add(
      "dispatchNext7",
      head("dispatch_jobs")
        .gte("scheduled_start", now.toISOString())
        .lte("scheduled_start", in7)
        .neq("status", "cancelled"),
    );
  }
  if (can(ctx, "projects.read"))
    add(
      "openProjects",
      head("projects")
        .in("status", ["planning", "scheduled", "active", "on_hold"])
        .is("archived_at", null),
    );
  if (can(ctx, "crm.read"))
    add("openLeads", head("leads").not("stage", "in", "(won,lost)").is("archived_at", null));
  if (can(ctx, "quotes.read")) {
    add("newQuoteRequests", head("quote_requests").eq("status", "new"));
    add("estimatesAwaiting", head("estimates").in("status", ["sent", "viewed"]));
  }
  if (can(ctx, "appointments.read"))
    add(
      "upcomingAppointments",
      head("appointments")
        .in("status", ["requested", "confirmed"])
        .gte("starts_at", now.toISOString()),
    );
  if (can(ctx, "compliance.read"))
    add("openPrivacyRequests", head("privacy_requests").not("status", "in", "(completed,denied)"));
  if (can(ctx, "documents.read"))
    add(
      "expiringDocuments",
      head("documents")
        .eq("is_current", true)
        .is("archived_at", null)
        .lte("expires_on", in30)
        .gte("expires_on", today),
    );
  await Promise.all(jobs);
  const myTasks =
    (
      await db()
        .from("follow_up_tasks")
        .select("id,title,due_at,priority,status")
        .eq("assigned_to", ctx.userId)
        .in("status", ["open", "in_progress"])
        .order("due_at", { nullsFirst: false })
        .limit(10)
    ).data ?? [];
  const upcomingDispatch = can(ctx, "dispatch.read")
    ? ((
        await db()
          .from("dispatch_jobs")
          .select("id,dispatch_number,status,scheduled_start,pickup_location")
          .gte("scheduled_start", now.toISOString())
          .neq("status", "cancelled")
          .order("scheduled_start")
          .limit(8)
      ).data ?? [])
    : [];
  const recentLeads = can(ctx, "crm.read")
    ? ((
        await db()
          .from("leads")
          .select("id,name,company,stage,source,created_at")
          .is("archived_at", null)
          .order("created_at", { ascending: false })
          .limit(8)
      ).data ?? [])
    : [];
  return { cards, myTasks, upcomingDispatch, recentLeads };
}

// ---- notifications --------------------------------------------------------------------
export async function listNotifications(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dashboard.view");
  const p = z
    .object({
      unreadOnly: z.boolean().optional().default(false),
      limit: z.number().int().min(1).max(100).default(30),
    })
    .parse(input ?? {});
  const perms = [...ctx.permissions].map((x) => `"${x}"`).join(",");
  const { data } = await db()
    .from("notifications")
    .select("id,type,title,body,link,created_at,read_at,user_id")
    .or(`user_id.eq.${ctx.userId},audience_permission.in.(${perms})`)
    .order("created_at", { ascending: false })
    .limit(p.limit);
  const ids = (data ?? []).map((n: { id: string }) => n.id);
  const reads = ids.length
    ? ((
        await db()
          .from("notification_reads")
          .select("notification_id")
          .eq("user_id", ctx.userId)
          .in("notification_id", ids)
      ).data ?? [])
    : [];
  const readSet = new Set(reads.map((r: { notification_id: string }) => r.notification_id));
  const items: (Record<string, unknown> & { read: boolean })[] = (data ?? []).map(
    (n: Record<string, unknown>) => ({
      ...n,
      read: readSet.has(n.id as string) || Boolean(n.user_id && n.read_at),
    }),
  );
  return {
    items: p.unreadOnly ? items.filter((i) => !i.read) : items,
    unread: items.filter((i) => !i.read).length,
  };
}

export async function markNotificationsRead(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dashboard.view");
  const p = z.object({ ids: z.array(uuid).max(100) }).parse(input);
  if (p.ids.length)
    await db()
      .from("notification_reads")
      .upsert(
        p.ids.map((id) => ({ notification_id: id, user_id: ctx.userId })),
        { onConflict: "notification_id,user_id" },
      );
  return { ok: true };
}

// ---- global search --------------------------------------------------------------------
export async function globalSearch(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dashboard.view");
  const term = sanitizeSearchTerm(z.object({ q: z.string().max(100) }).parse(input).q);
  if (term.length < 2) return { results: [] };
  const like = (cols: string[]) => cols.map((c) => `${c}.ilike.%${term}%`).join(",");
  const out: { type: string; id: string; title: string; subtitle?: string; href: string }[] = [];
  const tasks: Promise<void>[] = [];
  const run = (
    perm: Parameters<typeof can>[1],
    table: string,
    cols: string[],
    sel: string,
    map: (r: any) => (typeof out)[number],
  ) => {
    if (!can(ctx, perm)) return;
    tasks.push(
      Promise.resolve(db().from(table).select(sel).or(like(cols)).limit(5)).then(
        ({ data }) => void out.push(...((data ?? []) as any[]).map(map)),
      ),
    );
  };
  run(
    "drivers.read",
    "driver_registrations",
    ["owner_name", "company_name", "email", "dot_number"],
    "id,owner_name,company_name,status",
    (r) => ({
      type: "Driver application",
      id: r.id,
      title: r.owner_name,
      subtitle: r.company_name ?? r.status,
      href: `/admin/drivers?id=${r.id}`,
    }),
  );
  run(
    "drivers.read",
    "drivers",
    ["full_name", "company_name", "email"],
    "id,full_name,company_name",
    (r) => ({
      type: "Driver",
      id: r.id,
      title: r.full_name,
      subtitle: r.company_name,
      href: `/admin/drivers?tab=roster&id=${r.id}`,
    }),
  );
  run(
    "fleet.read",
    "trucks",
    ["unit_number", "owner_name", "make", "model"],
    "id,unit_number,vehicle_type",
    (r) => ({
      type: "Truck",
      id: r.id,
      title: r.unit_number,
      subtitle: r.vehicle_type,
      href: `/admin/fleet?id=${r.id}`,
    }),
  );
  run(
    "dispatch.read",
    "dispatch_jobs",
    ["dispatch_number", "pickup_location", "destination"],
    "id,dispatch_number,pickup_location",
    (r) => ({
      type: "Dispatch",
      id: r.id,
      title: r.dispatch_number,
      subtitle: r.pickup_location,
      href: `/admin/dispatch?id=${r.id}`,
    }),
  );
  run(
    "projects.read",
    "projects",
    ["name", "project_number", "address"],
    "id,name,project_number",
    (r) => ({
      type: "Project",
      id: r.id,
      title: r.name,
      subtitle: r.project_number,
      href: `/admin/projects?id=${r.id}`,
    }),
  );
  run("crm.read", "leads", ["name", "company", "email", "phone"], "id,name,company,stage", (r) => ({
    type: "Lead",
    id: r.id,
    title: r.name,
    subtitle: r.company ?? r.stage,
    href: `/admin/crm?lead=${r.id}`,
  }));
  run("crm.read", "customers", ["name", "company", "email", "phone"], "id,name,company", (r) => ({
    type: "Customer",
    id: r.id,
    title: r.name,
    subtitle: r.company,
    href: `/admin/crm?tab=customers&id=${r.id}`,
  }));
  run(
    "quotes.read",
    "estimates",
    ["estimate_number", "title", "customer_name"],
    "id,estimate_number,title",
    (r) => ({
      type: "Estimate",
      id: r.id,
      title: r.estimate_number,
      subtitle: r.title,
      href: `/admin/quotes?estimate=${r.id}`,
    }),
  );
  await Promise.all(tasks);
  return { results: out.slice(0, 30) };
}

// ---- reports --------------------------------------------------------------------------
export async function reports(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "reports.read");
  const p = z
    .object({
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    })
    .parse(input);
  const from = `${p.from}T00:00:00Z`;
  const to = `${p.to}T23:59:59Z`;
  const rows = async (table: string, cols: string, dateCol = "created_at") =>
    ((await db().from(table).select(cols).gte(dateCol, from).lte(dateCol, to).limit(10000)).data ??
      []) as unknown as Record<string, string>[];
  const group = (list: Record<string, string>[], key: string) =>
    list.reduce<Record<string, number>>(
      (m, r) => ((m[r[key] ?? "unknown"] = (m[r[key] ?? "unknown"] ?? 0) + 1), m),
      {},
    );
  const monthly = (list: Record<string, string>[], dateCol = "created_at") =>
    list.reduce<Record<string, number>>(
      (m, r) => ((m[r[dateCol].slice(0, 7)] = (m[r[dateCol].slice(0, 7)] ?? 0) + 1), m),
      {},
    );
  const [driverApps, dispatch, contacts, quoteReqs, estimates, leads, projects, tasks] =
    await Promise.all([
      rows("driver_registrations", "status,created_at"),
      rows("dispatch_jobs", "status,scheduled_start", "scheduled_start"),
      rows("contact_submissions", "created_at"),
      rows("quote_requests", "created_at,service_type"),
      rows("estimates", "status,created_at,total"),
      rows("leads", "stage,source,created_at"),
      rows("projects", "status,created_at"),
      rows("follow_up_tasks", "status,created_at"),
    ]);
  const sent = estimates.filter((e) => e.status !== "draft").length;
  const accepted = estimates.filter((e) => e.status === "accepted").length;
  const [activeTrucks, pendingApps] = await Promise.all([
    count(head("trucks").is("archived_at", null)),
    count(head("driver_registrations").in("status", ["new", "reviewed", "info_requested"])),
  ]);
  return {
    range: p,
    driverRegistrations: {
      total: driverApps.length,
      byStatus: group(driverApps, "status"),
      monthly: monthly(driverApps),
      pendingNow: pendingApps,
    },
    trucks: { activeNow: activeTrucks },
    dispatch: { total: dispatch.length, byStatus: group(dispatch, "status") },
    inquiries: {
      contactMonthly: monthly(contacts),
      quoteRequestsMonthly: monthly(quoteReqs),
      quoteRequestsByService: group(quoteReqs, "service_type"),
    },
    quotes: {
      total: estimates.length,
      sent,
      accepted,
      conversionRate: sent ? Math.round((accepted / sent) * 1000) / 10 : null,
      acceptedValue: estimates
        .filter((e) => e.status === "accepted")
        .reduce((s, e) => s + Number(e.total), 0),
    },
    leads: {
      total: leads.length,
      byStage: group(leads, "stage"),
      bySource: group(leads, "source"),
    },
    projects: { total: projects.length, byStatus: group(projects, "status") },
    tasks: { total: tasks.length, byStatus: group(tasks, "status") },
  };
}

export async function exportReport(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "reports.export");
  const r = await reports(ctx, input);
  const lines = ["section,metric,key,value"];
  const push = (section: string, metric: string, obj: Record<string, number>) =>
    Object.entries(obj).forEach(([k, v]) => lines.push(`${section},${metric},${k},${v}`));
  push("drivers", "by_status", r.driverRegistrations.byStatus);
  push("drivers", "monthly", r.driverRegistrations.monthly);
  push("dispatch", "by_status", r.dispatch.byStatus);
  push("inquiries", "contact_monthly", r.inquiries.contactMonthly);
  push("inquiries", "quote_requests_monthly", r.inquiries.quoteRequestsMonthly);
  push("leads", "by_stage", r.leads.byStage);
  push("leads", "by_source", r.leads.bySource);
  push("projects", "by_status", r.projects.byStatus);
  push("tasks", "by_status", r.tasks.byStatus);
  lines.push(
    `quotes,summary,sent,${r.quotes.sent}`,
    `quotes,summary,accepted,${r.quotes.accepted}`,
    `quotes,summary,conversion_rate_pct,${r.quotes.conversionRate ?? ""}`,
  );
  await audit(
    actorOf(ctx),
    "report.export",
    "report",
    null,
    `Exported operational report ${r.range.from}..${r.range.to}`,
  );
  return { filename: `amcms-report-${r.range.from}-to-${r.range.to}.csv`, csv: lines.join("\n") };
}

// ---- users ----------------------------------------------------------------------------
export async function listStaff(ctx: StaffContext) {
  requirePermission(ctx, "users.read");
  const [roles, profiles] = await Promise.all([
    db().from("user_roles").select("user_id,role"),
    db()
      .from("staff_profiles")
      .select("user_id,email,full_name,title,phone,active,last_login_at,created_at"),
  ]);
  const byUser = new Map<string, Record<string, unknown> & { roles: string[] }>();
  for (const p of profiles.data ?? []) byUser.set(p.user_id, { ...p, roles: [] });
  for (const r of roles.data ?? []) {
    if (!byUser.has(r.user_id))
      byUser.set(r.user_id, { user_id: r.user_id, email: "(no profile)", active: true, roles: [] });
    byUser.get(r.user_id)!.roles.push(r.role);
  }
  return {
    staff: [...byUser.values()].sort((a, b) => String(a.email).localeCompare(String(b.email))),
    assignableRoles: ROLES.filter((r) => canManageRole(ctx.roles, r)),
  };
}

export async function inviteStaff(ctx: StaffContext, input: unknown, request?: Request) {
  requirePermission(ctx, "users.manage");
  const p = z
    .object({
      email: z.string().trim().email().max(255),
      fullName: z.string().trim().max(120).optional(),
      title: z.string().trim().max(120).optional(),
      roles: z.array(z.string()).min(1, "Choose at least one role"),
    })
    .parse(input);
  const roles = p.roles.filter(isRole) as Role[];
  if (roles.length !== p.roles.length) throw new AppError("VALIDATION", "Unknown role.");
  for (const r of roles)
    if (!canManageRole(ctx.roles, r))
      throw new AppError("FORBIDDEN", `You can't grant the ${r} role.`);
  const email = p.email.toLowerCase();
  const { createInvite } = await import("../auth/service.server");
  const invite = await createInvite(email, request);
  const userId = invite.userId;
  await db()
    .from("staff_profiles")
    .upsert(
      {
        user_id: userId,
        email,
        full_name: p.fullName ?? null,
        title: p.title ?? null,
        active: true,
        invited_by: ctx.userId,
      },
      { onConflict: "user_id" },
    );
  check(
    await db()
      .from("user_roles")
      .upsert(
        roles.map((role) => ({ user_id: userId, role })),
        { onConflict: "user_id,role", ignoreDuplicates: true },
      ),
    "Granting roles",
  );
  await audit(
    actorOf(ctx),
    "user.invite",
    "user",
    userId!,
    `Invited ${email} with roles ${roles.join(", ")}`,
    { roles },
  );
  const sent = await sendEmail({
    to: email,
    subject: "You've been invited to AMCMS",
    template: "auth.invite",
    html: emailLayout(
      "Your AMCMS account",
      `<p style="color:#4B5563">You've been given access to the AM Consulting &amp; Hauling management system. Choose a password to activate your account. The link expires in 7 days.</p>${emailButton("Set your password", invite.link)}`,
    ),
  });
  // If email isn't configured, hand the one-time link to the inviting admin to deliver securely.
  return {
    userId,
    invited: invite.created,
    emailed: sent.status === "sent",
    inviteLink: sent.status === "sent" ? undefined : invite.link,
  };
}

export async function setStaffRoles(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "users.manage");
  const p = z.object({ userId: uuid, roles: z.array(z.string()) }).parse(input);
  const next = new Set(p.roles.filter(isRole));
  const current = new Set(
    ((await db().from("user_roles").select("role").eq("user_id", p.userId)).data ?? []).map(
      (r: { role: string }) => r.role,
    ),
  );
  const toAdd = [...next].filter((r) => !current.has(r));
  const toRemove = [...current].filter((r) => !next.has(r as Role)) as Role[];
  for (const r of [...toAdd, ...toRemove])
    if (!canManageRole(ctx.roles, r as Role))
      throw new AppError("FORBIDDEN", `You can't change the ${r} role.`);
  if (p.userId === ctx.userId && toRemove.some((r) => r === "super_admin" || r === "admin"))
    throw new AppError("FORBIDDEN", "You can't remove your own administrator role.");
  if (toRemove.includes("super_admin")) {
    const n = await count(head("user_roles").eq("role", "super_admin"));
    if (n <= 1) throw new AppError("CONFLICT", "At least one super admin must remain.");
  }
  if (toAdd.length)
    check(
      await db()
        .from("user_roles")
        .insert(toAdd.map((role) => ({ user_id: p.userId, role }))),
      "Granting roles",
    );
  if (toRemove.length)
    check(
      await db().from("user_roles").delete().eq("user_id", p.userId).in("role", toRemove),
      "Revoking roles",
    );
  await audit(
    actorOf(ctx),
    "user.roles_changed",
    "user",
    p.userId,
    `Roles changed (+${toAdd.join(",") || "none"} −${toRemove.join(",") || "none"})`,
    { added: toAdd, removed: toRemove },
  );
  return { ok: true };
}

export async function setStaffActive(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "users.manage");
  const p = z.object({ userId: uuid, active: z.boolean() }).parse(input);
  if (p.userId === ctx.userId)
    throw new AppError("FORBIDDEN", "You can't deactivate your own account.");
  const targetRoles: string[] = (
    (await db().from("user_roles").select("role").eq("user_id", p.userId)).data ?? []
  ).map((r: { role: string }) => r.role);
  if (
    targetRoles.some((r) => r === "super_admin" || r === "admin") &&
    !ctx.roles.includes("super_admin")
  )
    throw new AppError("FORBIDDEN", "Only a super admin can change administrator accounts.");
  const { authUserEmail, setBanned } = await import("../auth/service.server");
  const authEmail = await authUserEmail(p.userId);
  await db()
    .from("staff_profiles")
    .upsert(
      { user_id: p.userId, email: authEmail ?? "unknown", active: p.active },
      { onConflict: "user_id" },
    );
  // Ban/unban at the auth layer; deactivation also ends every open session immediately.
  await setBanned(p.userId, !p.active);
  await audit(
    actorOf(ctx),
    p.active ? "user.reactivate" : "user.deactivate",
    "user",
    p.userId,
    `${p.active ? "Reactivated" : "Deactivated"} staff account`,
  );
  return { ok: true };
}

/** Clears a staff member's authenticator (lost device) so they re-enrol at next sign-in. */
export async function resetStaffMfa(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "users.manage");
  const p = z.object({ userId: uuid }).parse(input);
  if (!ctx.roles.includes("super_admin"))
    throw new AppError("FORBIDDEN", "Only a super admin can reset two-step verification.");
  const { resetMfa } = await import("../auth/service.server");
  await resetMfa(p.userId);
  await audit(actorOf(ctx), "user.mfa_reset", "user", p.userId, "Reset two-step verification");
  return { ok: true };
}

export async function updateOwnProfile(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "dashboard.view");
  const p = z
    .object({
      fullName: z.string().trim().max(120),
      title: z.string().trim().max(120).optional(),
      phone: z.string().trim().max(30).optional(),
    })
    .parse(input);
  await db()
    .from("staff_profiles")
    .upsert(
      {
        user_id: ctx.userId,
        email: ctx.email ?? "unknown",
        full_name: p.fullName,
        title: p.title ?? null,
        phone: p.phone ?? null,
      },
      { onConflict: "user_id" },
    );
  return { ok: true };
}

// ---- audit & login history ------------------------------------------------------------
export async function listAudit(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "audit.read");
  const p = z
    .object({
      entityType: z.string().max(60).optional(),
      entityId: z.string().max(80).optional(),
      actorId: uuid.optional(),
      action: z.string().max(80).optional(),
      page: z.number().int().min(1).default(1),
    })
    .parse(input ?? {});
  let q = db()
    .from("audit_logs")
    .select(
      "id,actor_id,actor_email,action,entity_type,entity_id,summary,changes,request_id,created_at",
      { count: "exact" },
    )
    .order("created_at", { ascending: false });
  if (p.entityType) q = q.eq("entity_type", p.entityType);
  if (p.entityId) q = q.eq("entity_id", p.entityId);
  if (p.actorId) q = q.eq("actor_id", p.actorId);
  if (p.action) q = q.ilike("action", `${sanitizeSearchTerm(p.action)}%`);
  const res = await q.range((p.page - 1) * 50, p.page * 50 - 1);
  return { rows: check(res, "Loading audit log") ?? [], total: res.count ?? 0 };
}

export async function listLoginEvents(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "audit.read");
  const p = z
    .object({ email: z.string().max(255).optional(), page: z.number().int().min(1).default(1) })
    .parse(input ?? {});
  let q = db()
    .from("login_audit_events")
    .select("id,user_id,email,event,detail,user_agent,created_at", { count: "exact" })
    .order("created_at", { ascending: false });
  if (p.email) q = q.ilike("email", sanitizeSearchTerm(p.email));
  const res = await q.range((p.page - 1) * 50, p.page * 50 - 1);
  return { rows: res.data ?? [], total: res.count ?? 0 };
}

export async function recordAuthEvent(ctx: StaffContext, input: unknown) {
  const p = z
    .object({
      event: z.enum([
        "logout",
        "mfa_enrolled",
        "mfa_verified",
        "mfa_failed",
        "password_changed",
        "session_timeout",
      ]),
    })
    .parse(input);
  await db()
    .from("login_audit_events")
    .insert({ user_id: ctx.userId, email: ctx.email, event: p.event, ip_hash: ctx.ipHash });
  if (p.event === "mfa_enrolled")
    await audit(
      actorOf(ctx),
      "user.mfa_enrolled",
      "user",
      ctx.userId,
      "Enrolled a TOTP authenticator",
    );
  return { ok: true };
}

export async function deliveryLog(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "settings.read");
  const p = z
    .object({ status: z.enum(["sent", "failed", "skipped", ""]).optional().default("") })
    .parse(input ?? {});
  let q = db()
    .from("notification_delivery_events")
    .select("id,channel,template,recipient,subject,status,error,related_type,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (p.status) q = q.eq("status", p.status);
  return { rows: (await q).data ?? [] };
}

// ---- compliance -----------------------------------------------------------------------
export async function consentRecords(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "compliance.read");
  const p = z.object({ email: z.string().max(255).optional() }).parse(input ?? {});
  let q = db()
    .from("consent_records")
    .select("id,subject_email,context,consent_type,granted,policy_version,created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (p.email) q = q.ilike("subject_email", sanitizeSearchTerm(p.email));
  return { rows: (await q).data ?? [] };
}

/** Finds every record tied to an email address — supports access/deletion requests. */
export async function dataSubjectLookup(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "compliance.write");
  const email = z.object({ email: z.string().trim().email() }).parse(input).email.toLowerCase();
  const tables = [
    "driver_registrations",
    "drivers",
    "customers",
    "customer_contacts",
    "leads",
    "contact_submissions",
    "quote_requests",
    "estimates",
    "appointments",
    "privacy_requests",
    "consent_records",
  ];
  const col = (t: string) =>
    t === "estimates" ? "customer_email" : t === "consent_records" ? "subject_email" : "email";
  const found: Record<string, number> = {};
  await Promise.all(
    tables.map(
      async (t) =>
        void (found[t] = await count(
          db().from(t).select("id", { count: "exact", head: true }).ilike(col(t), email),
        )),
    ),
  );
  await audit(actorOf(ctx), "privacy.lookup", "privacy", null, "Ran data-subject lookup", {
    tables: Object.keys(found).filter((k) => found[k] > 0),
  });
  return { email, found };
}

// ---- settings -------------------------------------------------------------------------
const SettingSchemas: { [K in keyof SettingsShape]: z.ZodType<SettingsShape[K]> } = {
  "appointments.business_hours": z.object({
    timezone: z.string().refine((tz) => {
      try {
        new Intl.DateTimeFormat("en-US", { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    slot_minutes: z.number().int().min(15).max(240),
    days: z.record(
      z.enum(["1", "2", "3", "4", "5", "6", "7"]),
      z.tuple([z.string().regex(/^\d{2}:\d{2}$/), z.string().regex(/^\d{2}:\d{2}$/)]),
    ),
    min_notice_hours: z.number().int().min(0).max(720),
    max_days_ahead: z.number().int().min(1).max(365),
    require_approval: z.boolean().optional(),
  }) as z.ZodType<SettingsShape["appointments.business_hours"]>,
  "notifications.recipients": z.object({
    leads: z.array(z.string().email()).max(10),
    drivers: z.array(z.string().email()).max(10),
    quotes: z.array(z.string().email()).max(10),
    appointments: z.array(z.string().email()).max(10),
  }),
  "quotes.defaults": z.object({
    valid_days: z.number().int().min(1).max(365),
    tax_rate: z.number().min(0).max(0.5),
    terms: z.string().max(4000),
  }),
  "retention.policy": z.record(z.string(), z.number().int().min(30).max(3650)),
  "security.session": z.object({ idle_timeout_minutes: z.number().int().min(5).max(480) }),
};

export async function getSettings(ctx: StaffContext) {
  requirePermission(ctx, "settings.read");
  const keys = Object.keys(SETTINGS_DEFAULTS) as (keyof SettingsShape)[];
  return {
    settings: Object.fromEntries(
      await Promise.all(keys.map(async (k) => [k, await getSetting(k)])),
    ),
  };
}

export async function updateSetting(ctx: StaffContext, input: unknown) {
  requirePermission(ctx, "settings.write");
  const p = z.object({ key: z.string(), value: z.unknown() }).parse(input);
  const schema = SettingSchemas[p.key as keyof SettingsShape];
  if (!schema) throw new AppError("NOT_FOUND", "Unknown setting.");
  const value = schema.parse(p.value);
  const before = await getSetting(p.key as keyof SettingsShape);
  check(
    await db()
      .from("system_settings")
      .upsert({ key: p.key, value, updated_by: ctx.userId }, { onConflict: "key" }),
    "Saving setting",
  );
  await audit(
    actorOf(ctx),
    "settings.update",
    "system_setting",
    p.key,
    `Updated setting ${p.key}`,
    { from: before, to: value },
  );
  return { ok: true };
}

// ---- scheduled maintenance (cron) -----------------------------------------------------
/** Idempotent daily job: scheduled publishing, expiry reminders, quote expiry. */
export async function runMaintenance() {
  const published = await publishDueSections();
  const today = new Date().toISOString().slice(0, 10);
  const in30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const reminders: string[] = [];
  const trucks =
    (
      await db()
        .from("trucks")
        .select("id,unit_number,registration_expires_on,insurance_expires_on,next_maintenance_on")
        .is("archived_at", null)
    ).data ?? [];
  for (const t of trucks) {
    for (const [col, label] of [
      ["registration_expires_on", "registration"],
      ["insurance_expires_on", "insurance"],
      ["next_maintenance_on", "maintenance"],
    ] as const) {
      const d = t[col];
      if (d && d <= in30) {
        reminders.push(`${t.unit_number}:${label}`);
        await notifyStaff({
          permission: "fleet.read",
          type: `fleet.${label}_due`,
          title: `Truck ${t.unit_number}: ${label} ${d < today ? "overdue" : "due"} ${d}`,
          link: `/admin/fleet?id=${t.id}`,
          dedupeKey: `truck:${t.id}:${col}:${d}`,
        });
      }
    }
  }
  const docs =
    (
      await db()
        .from("documents")
        .select("id,title,expires_on")
        .eq("is_current", true)
        .is("archived_at", null)
        .lte("expires_on", in30)
    ).data ?? [];
  for (const d of docs) {
    reminders.push(`doc:${d.id}`);
    await notifyStaff({
      permission: "documents.read",
      type: "document.expiring",
      title: `Document “${d.title}” ${d.expires_on < today ? "expired" : "expires"} ${d.expires_on}`,
      link: "/admin/documents",
      dedupeKey: `doc:${d.id}:${d.expires_on}`,
    });
  }
  const overdue =
    (
      await db()
        .from("privacy_requests")
        .select("id,ref,due_at")
        .not("status", "in", "(completed,denied)")
        .lte("due_at", new Date(Date.now() + 7 * 86400000).toISOString())
    ).data ?? [];
  for (const r of overdue)
    await notifyStaff({
      permission: "compliance.read",
      type: "privacy.due",
      title: `Privacy request ${r.ref} due ${r.due_at.slice(0, 10)}`,
      link: "/admin/compliance",
      dedupeKey: `privacy:${r.id}:due`,
    });
  await db()
    .from("estimates")
    .update({ status: "expired" })
    .in("status", ["sent", "viewed"])
    .lt("valid_until", today);
  const { pruneAuthData } = await import("../auth/service.server");
  await pruneAuthData();
  return { published, reminders: reminders.length, privacyDue: overdue.length };
}

import { AppError } from "@/lib/shared/errors";
import {
  canTransitionDispatch,
  findConflicts,
  impliedStatusOnAssignment,
  type JobLike,
} from "@/lib/shared/dispatch-rules";
import type { DispatchStatus } from "@/lib/shared/domain";
import type { ResourceKey } from "@/lib/shared/resources";
import { can, type StaffContext } from "../authz.server";
import { db } from "../db.server";
import { notifyUser } from "../notify.server";
import type { ResourceHooks, Row } from "./resources.server";

// ---- dispatch ------------------------------------------------------------------------
/** Dispatchers without dispatch.manage_all may only change jobs assigned to them or unassigned. */
function assertDispatchScope(ctx: StaffContext, before: Row | null, data: Record<string, unknown>) {
  if (can(ctx, "dispatch.manage_all")) return;
  if (before && before.dispatcher_id && before.dispatcher_id !== ctx.userId) {
    throw new AppError("FORBIDDEN", "This job is assigned to another dispatcher.");
  }
  if (data.dispatcher_id && data.dispatcher_id !== ctx.userId) {
    throw new AppError("FORBIDDEN", "You can only assign jobs to yourself.");
  }
}

export async function detectDispatchConflicts(job: JobLike) {
  if (!job.driver_id && !job.truck_id) return [];
  const ors = [
    job.driver_id && `driver_id.eq.${job.driver_id}`,
    job.truck_id && `truck_id.eq.${job.truck_id}`,
  ]
    .filter(Boolean)
    .join(",");
  const { data } = await db()
    .from("dispatch_jobs")
    .select("id,dispatch_number,driver_id,truck_id,scheduled_start,scheduled_end,status")
    .or(ors)
    .neq("status", "cancelled")
    .lt("scheduled_start", job.scheduled_end)
    .gt("scheduled_end", job.scheduled_start)
    .limit(20);
  return findConflicts(job, (data ?? []) as JobLike[]);
}

async function validateDispatch(
  ctx: StaffContext,
  before: Row | null,
  data: Record<string, unknown>,
) {
  assertDispatchScope(ctx, before, data);
  const merged = { ...(before ?? {}), ...data } as Record<string, unknown>;
  const fromStatus = (before?.status as DispatchStatus | undefined) ?? "new";
  let status = (merged.status as DispatchStatus) ?? "new";
  if (before && data.status && !canTransitionDispatch(fromStatus, data.status as DispatchStatus)) {
    throw new AppError(
      "VALIDATION",
      `A job can't move from “${fromStatus.replace("_", " ")}” to “${String(data.status).replace("_", " ")}”.`,
    );
  }
  // Auto-advance New/Scheduled → Assigned when a driver is set (and back when removed), unless the user chose a status explicitly.
  if (data.status === undefined && "driver_id" in data) {
    const implied = impliedStatusOnAssignment(status, Boolean(merged.driver_id));
    if (implied !== status) {
      data.status = implied;
      status = implied;
    }
  }
  if ((status === "assigned" || status === "in_progress") && !merged.driver_id) {
    throw new AppError(
      "VALIDATION",
      "Assign a driver before marking the job assigned or in progress.",
    );
  }
  const start = merged.scheduled_start as string;
  const end = merged.scheduled_end as string;
  if (start && end && new Date(end) <= new Date(start))
    throw new AppError("VALIDATION", "Scheduled end must be after the start.");

  if (data.driver_id) {
    const d = await db()
      .from("drivers")
      .select("status,archived_at")
      .eq("id", data.driver_id)
      .maybeSingle();
    if (!d.data || d.data.archived_at || d.data.status !== "active")
      throw new AppError("VALIDATION", "Only active, approved drivers can be assigned.");
  }
  if (data.truck_id) {
    const t = await db()
      .from("trucks")
      .select("availability,archived_at")
      .eq("id", data.truck_id)
      .maybeSingle();
    if (
      !t.data ||
      t.data.archived_at ||
      ["maintenance", "out_of_service"].includes(t.data.availability)
    ) {
      throw new AppError(
        "VALIDATION",
        "That truck is unavailable (maintenance or out of service).",
      );
    }
  }
  const schedulingChanged = [
    "driver_id",
    "truck_id",
    "scheduled_start",
    "scheduled_end",
    "status",
  ].some((k) => k in data);
  if (schedulingChanged && status !== "cancelled") {
    const conflicts = await detectDispatchConflicts({
      id: before?.id as string | undefined,
      driver_id: merged.driver_id as string | null,
      truck_id: merged.truck_id as string | null,
      scheduled_start: start,
      scheduled_end: end,
      status,
    });
    if (conflicts.length) {
      throw new AppError(
        "CONFLICT",
        `Scheduling conflict: the ${conflicts[0].resource} is already booked on ${conflicts[0].dispatchNumber ?? "another job"} at that time.`,
        { conflicts },
      );
    }
  }
  if (status === "completed" && fromStatus !== "completed")
    data.completed_at = new Date().toISOString();
  return data;
}

const dispatchHooks: ResourceHooks = {
  beforeCreate: async (ctx, data) => {
    if (!can(ctx, "dispatch.manage_all") && !data.dispatcher_id) data.dispatcher_id = ctx.userId;
    return validateDispatch(ctx, null, data);
  },
  beforeUpdate: (ctx, before, data) => validateDispatch(ctx, before, data),
  afterWrite: async (ctx, before, after) => {
    if (!before || before.status !== after.status) {
      await db()
        .from("dispatch_status_history")
        .insert({
          job_id: after.id,
          from_status: before?.status ?? null,
          to_status: after.status,
          changed_by: ctx.userId,
        });
    }
    if (
      after.dispatcher_id &&
      after.dispatcher_id !== ctx.userId &&
      after.dispatcher_id !== before?.dispatcher_id
    ) {
      await notifyUser(String(after.dispatcher_id), {
        type: "dispatch.assigned",
        title: `Dispatch ${after.dispatch_number} assigned to you`,
        link: `/admin/dispatch?id=${after.id}`,
      });
    }
  },
};

// ---- fleet ---------------------------------------------------------------------------
const truckHooks: ResourceHooks = {
  afterWrite: async (ctx, before, after) => {
    if ((before?.driver_id ?? null) === (after.driver_id ?? null)) return;
    const now = new Date().toISOString();
    await db()
      .from("truck_assignments")
      .update({ assigned_to: now })
      .eq("truck_id", after.id)
      .is("assigned_to", null);
    if (after.driver_id) {
      await db().from("truck_assignments").insert({
        truck_id: after.id,
        driver_id: after.driver_id,
        assigned_from: now,
        created_by: ctx.userId,
        note: "Assigned via truck profile",
      });
    }
  },
};

// ---- CRM -----------------------------------------------------------------------------
async function findDuplicates(email?: unknown, phone?: unknown) {
  const ors: string[] = [];
  if (typeof email === "string" && email) ors.push(`email.ilike.${email.replace(/[,()%*]/g, "")}`);
  const digits = typeof phone === "string" ? phone.replace(/\D/g, "") : "";
  if (digits.length >= 7) ors.push(`phone.ilike.%${digits.slice(-7, -4)}%${digits.slice(-4)}%`);
  if (!ors.length) return [];
  const [leads, customers] = await Promise.all([
    db()
      .from("leads")
      .select("id,name,company,email,phone,stage")
      .or(ors.join(","))
      .is("archived_at", null)
      .limit(5),
    db()
      .from("customers")
      .select("id,name,company,email,phone")
      .or(ors.join(","))
      .is("archived_at", null)
      .limit(5),
  ]);
  return [
    ...(leads.data ?? []).map((r: Record<string, unknown>) => ({ type: "lead", ...r })),
    ...(customers.data ?? []).map((r: Record<string, unknown>) => ({ type: "customer", ...r })),
  ];
}

/** Warns about likely duplicates; never merges automatically. */
const duplicateGuard: ResourceHooks["beforeCreate"] = async (_ctx, data, opts) => {
  if (opts.confirmDuplicate) return data;
  const dups = await findDuplicates(data.email, data.phone);
  if (dups.length)
    throw new AppError(
      "CONFLICT",
      "Possible duplicate found. Review the matches or confirm to create anyway.",
      { duplicates: dups },
    );
  return data;
};

const leadHooks: ResourceHooks = {
  beforeCreate: duplicateGuard,
  afterWrite: async (ctx, before, after) => {
    if (before && before.stage !== after.stage) {
      await db()
        .from("lead_activities")
        .insert({
          lead_id: after.id,
          type: "stage_change",
          body: `Stage changed from ${before.stage} to ${after.stage}`,
          created_by: ctx.userId,
        });
    }
    if (after.owner_id && after.owner_id !== before?.owner_id && after.owner_id !== ctx.userId) {
      await notifyUser(String(after.owner_id), {
        type: "lead.assigned",
        title: `Lead assigned to you: ${after.name}`,
        link: `/admin/crm?lead=${after.id}`,
      });
    }
  },
};

// ---- tasks ---------------------------------------------------------------------------
const taskHooks: ResourceHooks = {
  // Staff see their own tasks; managers (users.read) see all.
  scopeList: (ctx, q) =>
    can(ctx, "users.read") ? q : q.or(`assigned_to.eq.${ctx.userId},created_by.eq.${ctx.userId}`),
  beforeUpdate: async (ctx, before, data) => {
    if (
      !can(ctx, "users.read") &&
      before.assigned_to !== ctx.userId &&
      before.created_by !== ctx.userId
    ) {
      throw new AppError("FORBIDDEN", "You can only update your own tasks.");
    }
    if (data.status === "done" && before.status !== "done")
      data.completed_at = new Date().toISOString();
    if (data.status && data.status !== "done") data.completed_at = null;
    return data;
  },
  afterWrite: async (ctx, before, after) => {
    if (
      after.assigned_to &&
      after.assigned_to !== ctx.userId &&
      after.assigned_to !== before?.assigned_to
    ) {
      await notifyUser(String(after.assigned_to), {
        type: "task.assigned",
        title: `Task assigned: ${after.title}`,
        link: "/admin?tab=tasks",
      });
    }
  },
};

// ---- CMS FAQs ------------------------------------------------------------------------
const faqHooks: ResourceHooks = {
  beforeCreate: async (ctx, data) => {
    if (data.published && !can(ctx, "cms.publish"))
      throw new AppError("FORBIDDEN", "Publishing requires the publish permission.");
    return data;
  },
  beforeUpdate: async (ctx, before, data) => {
    if ("published" in data && data.published !== before.published && !can(ctx, "cms.publish")) {
      throw new AppError("FORBIDDEN", "Publishing requires the publish permission.");
    }
    if (before.published && !can(ctx, "cms.publish") && Object.keys(data).length) {
      throw new AppError("FORBIDDEN", "Editing a published FAQ requires the publish permission.");
    }
    return { ...data, updated_by: ctx.userId };
  },
};

const privacyHooks: ResourceHooks = {
  beforeUpdate: async (ctx, before, data) => {
    if (
      data.status &&
      ["completed", "denied"].includes(String(data.status)) &&
      !["completed", "denied"].includes(String(before.status))
    ) {
      data.resolved_at = new Date().toISOString();
      data.handled_by = data.handled_by ?? ctx.userId;
    }
    return data;
  },
};

export const RESOURCE_HOOKS: Partial<Record<ResourceKey, ResourceHooks>> = {
  dispatch_jobs: dispatchHooks,
  trucks: truckHooks,
  leads: leadHooks,
  customers: { beforeCreate: duplicateGuard },
  follow_up_tasks: taskHooks,
  faq_entries: faqHooks,
  privacy_requests: privacyHooks,
};

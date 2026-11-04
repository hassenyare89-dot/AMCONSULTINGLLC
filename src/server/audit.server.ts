import { db } from "./db.server";
import { log } from "./logger.server";

export type AuditActor = {
  userId: string | null;
  email: string | null;
  requestId?: string;
  ipHash?: string | null;
};

const MASK_KEYS = /vin|license_plate|policy_ref|password|token|dot_number|usdot|ssn/i;

/** Masks sensitive values so audit trails don't become a second copy of sensitive data. */
export function redactChanges(
  changes: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!changes) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(changes)) {
    if (MASK_KEYS.test(k)) out[k] = v == null || v === "" ? v : "[redacted]";
    else if (typeof v === "string" && v.length > 500) out[k] = `${v.slice(0, 500)}…`;
    else out[k] = v;
  }
  return out;
}

/** Computes field-level before/after for changed keys only. */
export function diff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(after)) {
    const prev = before?.[k];
    if (JSON.stringify(prev ?? null) !== JSON.stringify(v ?? null))
      out[k] = { from: prev ?? null, to: v ?? null };
  }
  return out;
}

export async function audit(
  actor: AuditActor,
  action: string,
  entityType: string,
  entityId: string | null,
  summary: string,
  changes?: Record<string, unknown> | null,
) {
  const row = {
    actor_id: actor.userId,
    actor_email: actor.email,
    action,
    entity_type: entityType,
    entity_id: entityId,
    summary: summary.slice(0, 500),
    changes: redactChanges(changes ?? null),
    ip_hash: actor.ipHash ?? null,
    request_id: actor.requestId ?? null,
  };
  const { error } = await db().from("audit_logs").insert(row);
  // Audit failures must be visible but should not silently succeed — log loudly.
  if (error)
    log("error", "AUDIT WRITE FAILED", { action, entityType, entityId, error: error.message });
}

export async function loginEvent(e: {
  userId?: string | null;
  email?: string | null;
  event: string;
  ipHash?: string | null;
  userAgent?: string | null;
  detail?: string;
}) {
  const { error } = await db()
    .from("login_audit_events")
    .insert({
      user_id: e.userId ?? null,
      email: e.email?.toLowerCase() ?? null,
      event: e.event,
      ip_hash: e.ipHash ?? null,
      user_agent: e.userAgent?.slice(0, 300) ?? null,
      detail: e.detail?.slice(0, 300) ?? null,
    });
  if (error) log("error", "login audit write failed", { error: error.message });
}

import { ROLE_LABELS } from "@/lib/shared/permissions";
import { requireClaims } from "../auth/cookie.server";
import {
  assertStaff,
  loadStaff,
  maybeBootstrapSuperAdmin,
  type StaffContext,
} from "../authz.server";
import { hashIp } from "../crypto.server";
import { db } from "../db.server";
import { env } from "../env.server";
import { getSetting } from "../settings.server";

/** For raw API routes (uploads, private files): session cookie + staff + MFA. */
export async function authenticateRequest(
  request: Request,
  rid: string,
  ip: string,
): Promise<StaffContext> {
  const claims = await requireClaims(request);
  const ctx = await loadStaff(claims.sub, claims, rid, await hashIp(ip));
  assertStaff(ctx);
  return ctx;
}

/** Session summary for the admin shell. Works before MFA so the UI can route to enrolment. */
export async function sessionInfo(ctx: StaffContext, claims: Record<string, unknown>) {
  let bootstrapped = false;
  if (ctx.roles.length === 0) {
    bootstrapped = await maybeBootstrapSuperAdmin(ctx, claims);
    if (bootstrapped) ctx = await loadStaff(ctx.userId, claims, ctx.requestId, ctx.ipHash);
  }
  const profile = await db()
    .from("staff_profiles")
    .select("full_name,title")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  const session = await getSetting("security.session");
  return {
    userId: ctx.userId,
    email: ctx.email,
    fullName: profile.data?.full_name ?? null,
    roles: ctx.roles,
    roleLabels: ctx.roles.map((r) => ROLE_LABELS[r]),
    permissions: [...ctx.permissions],
    aal: ctx.aal,
    mfaRequired: env.requireMfa(),
    mfaSatisfied: ctx.mfaSatisfied,
    active: ctx.active,
    hasAccess: ctx.active && ctx.roles.length > 0,
    bootstrapped,
    idleTimeoutMinutes: session.idle_timeout_minutes,
  };
}

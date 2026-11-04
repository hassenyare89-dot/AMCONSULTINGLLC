import { AppError } from "@/lib/shared/errors";
import { isRole, permissionsForRoles, type Permission, type Role } from "@/lib/shared/permissions";
import { audit } from "./audit.server";
import { db } from "./db.server";
import { env } from "./env.server";
import { query } from "./pg/pool.server";

export type StaffContext = {
  userId: string;
  email: string | null;
  roles: Role[];
  permissions: Set<Permission>;
  aal: "aal1" | "aal2";
  mfaSatisfied: boolean;
  active: boolean;
  requestId: string;
  ipHash: string | null;
};

type Claims = { sub?: string; email?: string; aal?: string; [k: string]: unknown };

/** Loads roles + profile for an authenticated user. Does not enforce anything. */
export async function loadStaff(
  userId: string,
  claims: Claims,
  requestId: string,
  ipHash: string | null = null,
): Promise<StaffContext> {
  const [rolesRes, profileRes] = await Promise.all([
    db().from("user_roles").select("role").eq("user_id", userId),
    db().from("staff_profiles").select("active,email").eq("user_id", userId).maybeSingle(),
  ]);
  if (rolesRes.error) throw new AppError("INTERNAL", "Could not load roles.");
  const roles = (rolesRes.data ?? []).map((r: { role: string }) => r.role).filter(isRole);
  const aal = claims.aal === "aal2" ? "aal2" : "aal1";
  return {
    userId,
    email: (claims.email as string | undefined) ?? profileRes.data?.email ?? null,
    roles,
    permissions: permissionsForRoles(roles),
    aal,
    mfaSatisfied: !env.requireMfa() || aal === "aal2",
    // Staff without a profile row (legacy admins) are treated as active.
    active: profileRes.data ? profileRes.data.active !== false : true,
    requestId,
    ipHash,
  };
}

/** Baseline gate for every AMCMS call: must be active staff with MFA satisfied. */
export function assertStaff(ctx: StaffContext, opts: { allowWithoutMfa?: boolean } = {}) {
  if (!ctx.active) throw new AppError("FORBIDDEN", "Your account has been deactivated.");
  if (ctx.roles.length === 0)
    throw new AppError("FORBIDDEN", "Your account does not have access to the management system.");
  if (!opts.allowWithoutMfa && !ctx.mfaSatisfied) {
    throw new AppError(
      "MFA_REQUIRED",
      "Multi-factor authentication is required for staff accounts.",
    );
  }
}

export function requirePermission(ctx: StaffContext, permission: Permission) {
  assertStaff(ctx);
  if (!ctx.permissions.has(permission))
    throw new AppError("FORBIDDEN", "You don't have permission to do that.");
}

export function can(ctx: StaffContext, permission: Permission) {
  return ctx.permissions.has(permission);
}

export const actorOf = (ctx: StaffContext) => ({
  userId: ctx.userId,
  email: ctx.email,
  requestId: ctx.requestId,
  ipHash: ctx.ipHash,
});

/**
 * One-time bootstrap: if BOOTSTRAP_SUPER_ADMIN_EMAIL matches this verified user and no super
 * admin exists yet, grant super_admin. Replaces the old (revoked) claim_first_admin RPC.
 */
export async function maybeBootstrapSuperAdmin(
  ctx: StaffContext,
  claims: Claims,
): Promise<boolean> {
  const target = env.bootstrapSuperAdminEmail();
  if (!target || !ctx.email || ctx.email.toLowerCase() !== target) return false;
  void claims;
  // Only an address proven by completing an emailed invite/reset link qualifies.
  const verified = await query(
    "SELECT 1 FROM auth.users WHERE id = $1 AND email_verified_at IS NOT NULL",
    [ctx.userId],
  );
  if (!verified.rows.length) return false;
  const { count, error } = await db()
    .from("user_roles")
    .select("id", { head: true, count: "exact" })
    .eq("role", "super_admin");
  if (error || (count ?? 0) > 0) return false;
  const ins = await db().from("user_roles").insert({ user_id: ctx.userId, role: "super_admin" });
  if (ins.error) return false;
  await db()
    .from("staff_profiles")
    .upsert({ user_id: ctx.userId, email: ctx.email, active: true }, { onConflict: "user_id" });
  await audit(
    { userId: ctx.userId, email: ctx.email, requestId: ctx.requestId },
    "user.bootstrap_super_admin",
    "user",
    ctx.userId,
    "Bootstrap super admin granted via BOOTSTRAP_SUPER_ADMIN_EMAIL",
  );
  return true;
}

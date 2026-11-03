import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import { ROLE_LABELS } from "@/lib/shared/permissions";
import {
  assertStaff,
  loadStaff,
  maybeBootstrapSuperAdmin,
  type StaffContext,
} from "../authz.server";
import { loginEvent } from "../audit.server";
import { hashIp } from "../crypto.server";
import { db } from "../db.server";
import { env } from "../env.server";
import { siteUrl } from "../email.server";
import { rateLimit } from "../ratelimit.server";
import { getSetting } from "../settings.server";

function anonClient() {
  const url = env.supabaseUrl();
  const key = env.supabasePublishableKey();
  if (!url || !key) throw new AppError("NOT_CONFIGURED", "Authentication is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
  });
}

/** Verifies a Supabase access token and returns its claims. */
export async function verifyToken(token: string) {
  if (!token || token.split(".").length !== 3)
    throw new AppError("UNAUTHENTICATED", "Please sign in.");
  const { data, error } = await anonClient().auth.getClaims(token);
  if (error || !data?.claims?.sub)
    throw new AppError("UNAUTHENTICATED", "Your session has expired. Please sign in again.");
  return data.claims as Record<string, unknown> & { sub: string };
}

/** For raw API routes (uploads): bearer auth + staff + MFA. */
export async function authenticateRequest(
  request: Request,
  rid: string,
  ip: string,
): Promise<StaffContext> {
  const header = request.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  const claims = await verifyToken(header.slice(7));
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

const SignInInput = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

/**
 * Password sign-in mediated by the server so attempts can be throttled per account and per IP
 * and recorded in login_audit_events. Returns the Supabase session for the browser to adopt.
 */
export async function staffSignIn(request: Request, ip: string, body: unknown) {
  const p = SignInInput.safeParse(body);
  if (!p.success) throw new AppError("VALIDATION", "Enter your email and password.");
  const email = p.data.email.toLowerCase();
  const ipHash = await hashIp(ip);
  const ua = request.headers.get("user-agent");
  const okIp = await rateLimit(`login:ip:${ipHash}`, 20, 900);
  const okAcct = await rateLimit(`login:acct:${email}`, 8, 900);
  if (!okIp || !okAcct) {
    await loginEvent({
      email,
      event: "login_blocked",
      ipHash,
      userAgent: ua,
      detail: !okAcct ? "account throttle" : "ip throttle",
    });
    throw new AppError(
      "RATE_LIMITED",
      "Too many sign-in attempts. Wait 15 minutes or reset your password.",
    );
  }
  const { data, error } = await anonClient().auth.signInWithPassword({
    email,
    password: p.data.password,
  });
  if (error || !data.session || !data.user) {
    await loginEvent({
      email,
      event: "login_failed",
      ipHash,
      userAgent: ua,
      detail: error?.code ?? "invalid",
    });
    // Generic message: don't reveal whether the account exists.
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  }
  await loginEvent({ userId: data.user.id, email, event: "login_success", ipHash, userAgent: ua });
  await db()
    .from("staff_profiles")
    .update({ last_login_at: new Date().toISOString() })
    .eq("user_id", data.user.id);
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
}

export async function requestPasswordReset(request: Request, ip: string, body: unknown) {
  const p = z.object({ email: z.string().trim().email().max(255) }).safeParse(body);
  if (!p.success) throw new AppError("VALIDATION", "Enter a valid email.");
  const email = p.data.email.toLowerCase();
  const ipHash = await hashIp(ip);
  if (
    (await rateLimit(`reset:ip:${ipHash}`, 5, 3600)) &&
    (await rateLimit(`reset:acct:${email}`, 3, 3600))
  ) {
    await anonClient().auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl(request)}/auth/update-password`,
    });
    await loginEvent({
      email,
      event: "password_reset_requested",
      ipHash,
      userAgent: request.headers.get("user-agent"),
    });
  }
  return { message: "If an account exists for that email, a reset link is on its way." };
}

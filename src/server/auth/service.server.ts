import QRCode from "qrcode";
import { z } from "zod";
import { AppError } from "@/lib/shared/errors";
import { passwordProblems } from "@/lib/shared/password";
import { loginEvent } from "../audit.server";
import { hashIp, hashToken, randomToken } from "../crypto.server";
import { emailButton, emailLayout, sendEmail, siteUrl } from "../email.server";
import { query, transaction } from "../pg/pool.server";
import { rateLimit } from "../ratelimit.server";
import { getSetting } from "../settings.server";
import { open, seal } from "./crypto-box.server";
import { hashPassword, verifyAgainstDummy, verifyPassword } from "./password";
import { generateSecret, otpauthUri, verifyTotp } from "./totp";

/**
 * Self-hosted authentication: email + password (scrypt), server-side sessions (only a SHA-256
 * of the bearer token is stored), TOTP MFA, password reset and staff invites.
 */
const SESSION_HOURS = 12;
const RESET_MINUTES = 60;
const INVITE_DAYS = 7;

export type SessionClaims = {
  sub: string;
  email: string;
  aal: "aal1" | "aal2";
  session_id: string;
};

// ---- sessions -------------------------------------------------------------------------
async function createSession(
  userId: string,
  ipHash: string | null,
  userAgent: string | null,
): Promise<string> {
  const token = randomToken();
  await query(
    `INSERT INTO auth.sessions (user_id, token_hash, ip_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, now() + make_interval(hours => $5))`,
    [userId, await hashToken(token), ipHash, userAgent?.slice(0, 300) ?? null, SESSION_HOURS],
  );
  return token;
}

/** Resolves a bearer token to its claims, enforcing expiry, idle timeout, revocation and bans. */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) return null;
  const { rows } = await query<{
    id: string;
    user_id: string;
    email: string;
    aal: "aal1" | "aal2";
    last_seen_at: string;
    banned: boolean;
  }>(
    `SELECT s.id, s.user_id, u.email, s.aal, s.last_seen_at, coalesce(u.banned_until > now(), false) AS banned
       FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [await hashToken(token)],
  );
  const s = rows[0];
  if (!s) return null;
  if (s.banned) return null;
  const idleMinutes = (await getSetting("security.session")).idle_timeout_minutes || 30;
  const idleMs = Date.now() - new Date(s.last_seen_at).getTime();
  if (idleMs > idleMinutes * 60_000) {
    await query("UPDATE auth.sessions SET revoked_at = now() WHERE id = $1", [s.id]);
    return null;
  }
  if (idleMs > 60_000)
    await query("UPDATE auth.sessions SET last_seen_at = now() WHERE id = $1", [s.id]);
  return { sub: s.user_id, email: s.email, aal: s.aal, session_id: s.id };
}

export async function revokeSession(token: string) {
  await query(
    "UPDATE auth.sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
    [await hashToken(token)],
  );
}

export async function revokeAllSessions(userId: string) {
  await query(
    "UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
    [userId],
  );
}

// ---- sign in --------------------------------------------------------------------------
const SignInInput = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(1).max(200),
});

export async function signIn(request: Request, ip: string, body: unknown) {
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
  const { rows } = await query<{
    id: string;
    password_hash: string | null;
    banned: boolean;
    mfa_enabled_at: string | null;
  }>(
    "SELECT id, password_hash, coalesce(banned_until > now(), false) AS banned, mfa_enabled_at FROM auth.users WHERE lower(email) = $1",
    [email],
  );
  const user = rows[0];
  const valid = user
    ? await verifyPassword(p.data.password, user.password_hash)
    : await verifyAgainstDummy(p.data.password);
  if (!user || !valid) {
    await loginEvent({
      userId: user?.id,
      email,
      event: "login_failed",
      ipHash,
      userAgent: ua,
      detail: "invalid credentials",
    });
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  }
  if (user.banned) {
    await loginEvent({
      userId: user.id,
      email,
      event: "login_blocked",
      ipHash,
      userAgent: ua,
      detail: "deactivated",
    });
    throw new AppError("UNAUTHENTICATED", "Incorrect email or password.");
  }
  const token = await createSession(user.id, ipHash, ua);
  await query("UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1", [user.id]);
  await query("UPDATE public.staff_profiles SET last_login_at = now() WHERE user_id = $1", [
    user.id,
  ]);
  await loginEvent({ userId: user.id, email, event: "login_success", ipHash, userAgent: ua });
  return { token, mfaEnabled: Boolean(user.mfa_enabled_at) };
}

export async function sessionSummary(claims: SessionClaims) {
  const { rows } = await query<{ mfa_enabled_at: string | null }>(
    "SELECT mfa_enabled_at FROM auth.users WHERE id = $1",
    [claims.sub],
  );
  return {
    user: { id: claims.sub, email: claims.email },
    aal: claims.aal,
    mfaEnabled: Boolean(rows[0]?.mfa_enabled_at),
  };
}

// ---- MFA ------------------------------------------------------------------------------
export async function mfaEnroll(claims: SessionClaims) {
  const { rows } = await query<{ mfa_enabled_at: string | null }>(
    "SELECT mfa_enabled_at FROM auth.users WHERE id = $1",
    [claims.sub],
  );
  if (rows[0]?.mfa_enabled_at)
    throw new AppError("CONFLICT", "Two-step verification is already set up for this account.");
  const secret = generateSecret();
  await query(
    "UPDATE auth.users SET mfa_pending_secret_enc = $2, updated_at = now() WHERE id = $1",
    [claims.sub, seal(secret)],
  );
  const uri = otpauthUri(secret, claims.email);
  return { secret, uri, qrDataUrl: await QRCode.toDataURL(uri, { margin: 1, width: 240 }) };
}

export async function mfaVerify(
  request: Request,
  ip: string,
  claims: SessionClaims,
  body: unknown,
) {
  const code = z
    .object({
      code: z
        .string()
        .trim()
        .regex(/^\d{6}$/, "Enter the 6-digit code"),
    })
    .parse(body).code;
  const ipHash = await hashIp(ip);
  if (!(await rateLimit(`mfa:${claims.sub}`, 10, 900)))
    throw new AppError("RATE_LIMITED", "Too many attempts. Try again in 15 minutes.");
  const { rows } = await query<{
    mfa_secret_enc: string | null;
    mfa_pending_secret_enc: string | null;
    mfa_last_counter: number | null;
  }>(
    "SELECT mfa_secret_enc, mfa_pending_secret_enc, mfa_last_counter FROM auth.users WHERE id = $1",
    [claims.sub],
  );
  const u = rows[0];
  const enrolling = !u?.mfa_secret_enc && Boolean(u?.mfa_pending_secret_enc);
  const sealed = u?.mfa_secret_enc ?? u?.mfa_pending_secret_enc;
  if (!sealed) throw new AppError("BAD_REQUEST", "Set up two-step verification first.");
  const counter = verifyTotp(open(sealed), code, u?.mfa_last_counter ?? null);
  if (counter === null) {
    await loginEvent({
      userId: claims.sub,
      email: claims.email,
      event: "mfa_failed",
      ipHash,
      userAgent: request.headers.get("user-agent"),
    });
    throw new AppError(
      "UNAUTHENTICATED",
      "That code didn't work. Check your authenticator app's time and try again.",
    );
  }
  await transaction(async (q) => {
    if (enrolling) {
      await q(
        "UPDATE auth.users SET mfa_secret_enc = mfa_pending_secret_enc, mfa_pending_secret_enc = NULL, mfa_enabled_at = now(), mfa_last_counter = $2, updated_at = now() WHERE id = $1",
        [claims.sub, counter],
      );
    } else {
      await q("UPDATE auth.users SET mfa_last_counter = $2 WHERE id = $1", [claims.sub, counter]);
    }
    await q("UPDATE auth.sessions SET aal = 'aal2' WHERE id = $1", [claims.session_id]);
  });
  await loginEvent({
    userId: claims.sub,
    email: claims.email,
    event: enrolling ? "mfa_enrolled" : "mfa_verified",
    ipHash,
    userAgent: request.headers.get("user-agent"),
  });
  return { ok: true };
}

/** Admin action: clear a user's authenticator so they re-enrol at next sign-in. */
export async function resetMfa(userId: string) {
  await query(
    "UPDATE auth.users SET mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL, mfa_enabled_at = NULL, mfa_last_counter = NULL, updated_at = now() WHERE id = $1",
    [userId],
  );
  await revokeAllSessions(userId);
}

// ---- passwords ------------------------------------------------------------------------
function assertStrong(password: string, email: string) {
  const problems = passwordProblems(password, email);
  if (problems.length) throw new AppError("VALIDATION", problems[0]);
}

export async function changePassword(claims: SessionClaims, body: unknown) {
  const p = z
    .object({
      currentPassword: z.string().min(1).max(200),
      newPassword: z.string().min(1).max(200),
    })
    .parse(body);
  const { rows } = await query<{ password_hash: string | null }>(
    "SELECT password_hash FROM auth.users WHERE id = $1",
    [claims.sub],
  );
  if (!(await verifyPassword(p.currentPassword, rows[0]?.password_hash)))
    throw new AppError("VALIDATION", "Your current password is incorrect.");
  assertStrong(p.newPassword, claims.email);
  await query("UPDATE auth.users SET password_hash = $2, updated_at = now() WHERE id = $1", [
    claims.sub,
    await hashPassword(p.newPassword),
  ]);
  // Keep this session; sign out everywhere else.
  await query(
    "UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND id <> $2 AND revoked_at IS NULL",
    [claims.sub, claims.session_id],
  );
  await loginEvent({ userId: claims.sub, email: claims.email, event: "password_changed" });
  return { ok: true };
}

async function issueToken(
  userId: string,
  purpose: "password_reset" | "invite",
  ttlMinutes: number,
): Promise<string> {
  const token = randomToken();
  await query(
    "UPDATE auth.one_time_tokens SET used_at = now() WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL",
    [userId, purpose],
  );
  await query(
    "INSERT INTO auth.one_time_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, $2, $3, now() + make_interval(mins => $4))",
    [userId, purpose, await hashToken(token), ttlMinutes],
  );
  return token;
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
    const { rows } = await query<{ id: string }>(
      "SELECT id FROM auth.users WHERE lower(email) = $1 AND (banned_until IS NULL OR banned_until < now())",
      [email],
    );
    if (rows[0]) {
      const token = await issueToken(rows[0].id, "password_reset", RESET_MINUTES);
      const link = `${siteUrl(request)}/auth/update-password?token=${encodeURIComponent(token)}`;
      await sendEmail({
        to: email,
        subject: "Reset your AMCMS password",
        template: "auth.password_reset",
        html: emailLayout(
          "Reset your password",
          `<p style="color:#4B5563">Use the button below to choose a new password. The link expires in ${RESET_MINUTES} minutes. If you didn't ask for this, ignore this email.</p>${emailButton("Choose a new password", link)}`,
        ),
      });
    }
    await loginEvent({
      email,
      event: "password_reset_requested",
      ipHash,
      userAgent: request.headers.get("user-agent"),
    });
  }
  return { message: "If an account exists for that email, a reset link is on its way." };
}

/** Completes a password reset or an invite: sets the password from a one-time token. */
export async function completeToken(ip: string, body: unknown) {
  const p = z
    .object({
      token: z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "This link is invalid or has expired."),
      password: z.string().min(1).max(200),
    })
    .parse(body);
  if (!(await rateLimit(`token:${await hashIp(ip)}`, 10, 900)))
    throw new AppError("RATE_LIMITED", "Too many attempts. Try again later.");
  const { rows } = await query<{ id: string; user_id: string; purpose: string; email: string }>(
    `SELECT t.id, t.user_id, t.purpose, u.email FROM auth.one_time_tokens t JOIN auth.users u ON u.id = t.user_id
      WHERE t.token_hash = $1 AND t.used_at IS NULL AND t.expires_at > now()`,
    [await hashToken(p.token)],
  );
  const t = rows[0];
  if (!t)
    throw new AppError("NOT_FOUND", "This link is invalid or has expired. Ask for a new one.");
  assertStrong(p.password, t.email);
  await transaction(async (q) => {
    await q("UPDATE auth.one_time_tokens SET used_at = now() WHERE id = $1", [t.id]);
    await q(
      "UPDATE auth.users SET password_hash = $2, email_verified_at = coalesce(email_verified_at, now()), updated_at = now() WHERE id = $1",
      [t.user_id, await hashPassword(p.password)],
    );
    await q(
      "UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
      [t.user_id],
    );
  });
  await loginEvent({
    userId: t.user_id,
    email: t.email,
    event: "password_changed",
    detail: t.purpose,
  });
  return { ok: true, email: t.email };
}

// ---- staff provisioning (called by authorised admin services) --------------------------
/** Creates the auth user if needed and returns its id plus a one-time invite link. */
export async function createInvite(
  email: string,
  request?: Request,
): Promise<{ userId: string; link: string; created: boolean }> {
  const normalized = email.trim().toLowerCase();
  const existing = await query<{ id: string }>(
    "SELECT id FROM auth.users WHERE lower(email) = $1",
    [normalized],
  );
  let userId = existing.rows[0]?.id;
  const created = !userId;
  if (!userId)
    userId = (
      await query<{ id: string }>("INSERT INTO auth.users (email) VALUES ($1) RETURNING id", [
        normalized,
      ])
    ).rows[0].id;
  const token = await issueToken(userId, "invite", INVITE_DAYS * 24 * 60);
  return {
    userId,
    created,
    link: `${siteUrl(request)}/auth/update-password?token=${encodeURIComponent(token)}&invite=yes`,
  };
}

export async function authUserEmail(userId: string): Promise<string | null> {
  return (
    (await query<{ email: string }>("SELECT email FROM auth.users WHERE id = $1", [userId])).rows[0]
      ?.email ?? null
  );
}

/** Deactivating bans the account and ends every session immediately. */
export async function setBanned(userId: string, banned: boolean) {
  await query("UPDATE auth.users SET banned_until = $2, updated_at = now() WHERE id = $1", [
    userId,
    banned ? "infinity" : null,
  ]);
  if (banned) await revokeAllSessions(userId);
}

/** Daily housekeeping: drop sessions and one-time tokens that ended more than 30 days ago. */
export async function pruneAuthData() {
  await query(
    "DELETE FROM auth.sessions WHERE coalesce(revoked_at, expires_at) < now() - interval '30 days'",
  );
  await query(
    "DELETE FROM auth.one_time_tokens WHERE coalesce(used_at, expires_at) < now() - interval '30 days'",
  );
}

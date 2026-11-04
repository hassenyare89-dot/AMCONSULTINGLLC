#!/usr/bin/env node
/**
 * Creates (or re-invites) a Super Admin and prints a one-time link to set their password.
 * Run on the server once after the first deploy:
 *
 *   docker compose exec app node scripts/create-admin.mjs owner@example.com "Owner Name"
 *
 * Other uses:
 *   node scripts/create-admin.mjs --reset-mfa user@example.com   clear a lost authenticator
 *
 * The link is printed only to your terminal; it is never emailed or logged elsewhere.
 * It expires in 24 hours and works once.
 */
import { createHash, randomBytes } from "node:crypto";
import pg from "pg";

const args = process.argv.slice(2);
const resetMfa = args[0] === "--reset-mfa";
const email = (resetMfa ? args[1] : args[0])?.trim().toLowerCase();
const fullName = resetMfa ? null : (args[1] ?? null);
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error(
    'Usage: node scripts/create-admin.mjs <email> ["Full Name"]\n       node scripts/create-admin.mjs --reset-mfa <email>',
  );
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const siteUrl = (
  process.env.PUBLIC_SITE_URL ||
  (process.env.DOMAIN ? `https://${process.env.DOMAIN}` : "http://localhost:3000")
).replace(/\/$/, "");
const sslMode = process.env.PGSSLMODE;
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  ssl:
    sslMode && sslMode !== "disable"
      ? { rejectUnauthorized: sslMode === "verify-full" }
      : undefined,
});

const tokenHash = (t) => createHash("sha256").update(`tok:${t}`).digest("hex");

async function main() {
  await client.connect();
  await client.query("BEGIN");
  try {
    if (resetMfa) {
      const r = await client.query(
        "UPDATE auth.users SET mfa_secret_enc = NULL, mfa_pending_secret_enc = NULL, mfa_enabled_at = NULL, mfa_last_counter = NULL, updated_at = now() WHERE lower(email) = $1 RETURNING id",
        [email],
      );
      if (!r.rows[0]) throw new Error(`No user with email ${email}`);
      await client.query(
        "UPDATE auth.sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
        [r.rows[0].id],
      );
      await client.query("COMMIT");
      console.log(
        `Two-step verification reset for ${email}. They will set up a new authenticator at next sign-in.`,
      );
      return;
    }
    let userId = (await client.query("SELECT id FROM auth.users WHERE lower(email) = $1", [email]))
      .rows[0]?.id;
    if (!userId)
      userId = (
        await client.query("INSERT INTO auth.users (email) VALUES ($1) RETURNING id", [email])
      ).rows[0].id;
    await client.query(
      `INSERT INTO public.staff_profiles (user_id, email, full_name, active) VALUES ($1, $2, $3, true)
       ON CONFLICT (user_id) DO UPDATE SET active = true, full_name = coalesce(EXCLUDED.full_name, public.staff_profiles.full_name)`,
      [userId, email, fullName],
    );
    await client.query(
      "INSERT INTO public.user_roles (user_id, role) VALUES ($1, 'super_admin') ON CONFLICT (user_id, role) DO NOTHING",
      [userId],
    );
    await client.query("UPDATE auth.users SET banned_until = NULL WHERE id = $1", [userId]);
    await client.query(
      "UPDATE auth.one_time_tokens SET used_at = now() WHERE user_id = $1 AND purpose = 'invite' AND used_at IS NULL",
      [userId],
    );
    const token = randomBytes(32).toString("base64url");
    await client.query(
      "INSERT INTO auth.one_time_tokens (user_id, purpose, token_hash, expires_at) VALUES ($1, 'invite', $2, now() + interval '24 hours')",
      [userId, tokenHash(token)],
    );
    await client.query(
      `INSERT INTO public.audit_logs (actor_email, action, entity_type, entity_id, summary)
       VALUES ('system (create-admin script)', 'user.bootstrap_super_admin', 'user', $1, $2)`,
      [userId, `Super admin ${email} provisioned from the server console`],
    );
    await client.query("COMMIT");
    console.log(`\nSuper admin ready: ${email}`);
    console.log(
      "Open this one-time link within 24 hours to set the password (then set up two-step verification):\n",
    );
    console.log(`  ${siteUrl}/auth/update-password?token=${token}&invite=yes\n`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(`Failed: ${err.message}`);
  process.exit(1);
});

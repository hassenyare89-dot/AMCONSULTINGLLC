# Security

This is an engineering control summary, **not a certification**. No penetration test of production was
performed (none was authorized). Testing covered the local development environment only.

## Controls implemented

| Area | Control | Where |
|---|---|---|
| Authentication | Built-in password sign-in (scrypt N=2¹⁵, constant-time compare, dummy hash for unknown emails) with per-account (8/15 min) and per-IP (20/15 min) throttling; generic failure messages; every attempt logged | `server/auth/service.server.ts`, `login_audit_events` |
| | Public self-signup removed from the UI; staff are invited by administrators | `routes/auth.index.tsx`, `users.invite` |
| | **TOTP MFA required** for all staff (RFC 6238, ±30 s window, code replay blocked, secret AES-256-GCM encrypted at rest); every privileged server operation requires an AAL2 session | `server/auth/totp.ts`, `MfaGate.tsx`, `authz.server.ts` |
| | Server-side sessions: random 256-bit token in an HttpOnly/Secure/SameSite=Lax cookie, only its SHA-256 stored; 12 h absolute + idle timeout (default 30 min, enforced on the server); sign-out revokes server-side; deactivation and password changes revoke sessions | `server/auth/*`, `users.setActive` |
| | Password policy (≥12 chars, common/email-derived passwords rejected) on reset/change | `lib/shared/password.ts` |
| | Password reset / invites: single-use 256-bit tokens (hash stored, 60 min / 7 day expiry), rate-limited, non-enumerating responses | `/api/auth/reset`, `/api/auth/complete` |
| Authorization | Code-defined RBAC (7 roles, 37 permissions); every operation checks permission on the server before data access; UI hiding is cosmetic only | `lib/shared/permissions.ts`, `rpc/registry.server.ts` |
| | Row scoping: dispatchers edit only their own/unassigned jobs; staff see their own tasks; restricted documents need `documents.restricted` | `resource-hooks.server.ts`, `files.server.ts` |
| | Only Super Admins grant/revoke Admin/Super Admin; last super admin cannot be removed; no self-demotion | `admin.server.ts` |
| Data access | App connects as the schema owner `amcms` (not a superuser); RLS on all tables and **no** anon/authenticated privileges as defence in depth; database not exposed outside the Docker network | `db/`, `docker-compose.yml` |
| Input | Zod validation on every endpoint (strict objects → no mass assignment); length limits; JSON body size limits | `lib/shared/*`, `server/http.server.ts` |
| Injection | All SQL parameterised (`server/pg/query.ts`); identifiers validated; search terms stripped of filter syntax; enum/uuid validation for filters | `server/pg/*`, `resource-schema.ts` |
| XSS | React escaping; CMS rich text allow-list sanitized on save **and** render; email templates escape all values; JSON-LD `<` escaped; `safeUrl` for CMS links | `lib/shared/sanitize.ts` |
| IDOR | Applicant status via 256-bit random tokens (only SHA-256 stored, 90-day expiry, removed from URL after load); estimates and appointment management via separate random tokens; legacy reference+email lookup returns status only and is throttled per reference | `intake.server.ts`, `quotes.server.ts` |
| CSRF | Session cookie is `SameSite=Lax` (not sent on cross-site POSTs) and every state-changing auth/public endpoint requires a same-origin `Origin` | `cookie.server.ts`, `assertSameOrigin` |
| Abuse | Postgres-backed rate limits (shared across app replicas), honeypot, time trap, optional Cloudflare Turnstile | `ratelimit.server.ts`, `turnstile.server.ts` |
| Uploads | Type from magic bytes (not filename/MIME), per-type size caps, random storage keys, path-traversal-safe local storage, never overwritten, served with `nosniff` + sandbox CSP; private documents only via 60 s HMAC-signed links, audited | `files.server.ts`, `storage.server.ts` |
| Privacy | IPs stored only as salted hashes; sensitive fields masked in audit logs and excluded from CSV exports | `crypto.server.ts`, `audit.server.ts` |
| Headers | CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, frame-ancestors; `noindex` + `no-store` on admin/auth/API | `src/server.ts` |
| Audit | Append-only `audit_logs` (DB trigger blocks edits) for admin actions, approvals, dispatch changes, quote approval, document downloads, publishing, settings, role changes | `audit.server.ts` |
| Errors | Typed safe errors; internal errors return a request id only; structured JSON logs with secret redaction | `logger.server.ts`, `rpc/dispatch.server.ts` |

## OWASP ASVS (v4.0.3) coverage summary

| Chapter | Status |
|---|---|
| V2 Authentication | Mostly met (MFA, throttling, generic errors, NIST-aligned password length, scrypt). Breached-password (HIBP) check not implemented. |
| V3 Session | Met — opaque server-side sessions, HttpOnly cookie, server-enforced idle + absolute timeout, revocation on sign-out/deactivation/password change. |
| V4 Access control | Met — server-side, deny by default, tested per operation. |
| V5 Validation/encoding | Met. |
| V7 Errors/logging | Met; ship logs to a central store (see Operations). |
| V8 Data protection | Partially — TLS (Caddy), private storage, MFA secrets encrypted. Disk encryption is up to the host (DigitalOcean encrypts Droplet volumes at rest). |
| V12 Files | Met except **malware scanning** (not available in this stack; `scan_status` column ready). |
| V13 API | Met. |
| V14 Config | Met — headers, secrets via env, dependency audit in CI. |

## Known gaps / follow-ups

1. **CSP `script-src 'unsafe-inline'`** — required by TanStack Start's inline hydration scripts; move to
   nonces when supported by the framework config.
2. **Malware scanning** of uploads — integrate e.g. Cloudflare/ClamAV scanning service and set `scan_status`.
3. **`AUTH_SECRET`** encrypts MFA secrets and signs document links: keep it secret and backed up;
   rotating it requires every staff member to re-enrol MFA.
4. Single server: the database, files and backups share one Droplet — copy backups off-site (docs/12).
5. WAF/DDoS: optionally put Cloudflare (proxy mode) in front of the Droplet and add rate-limiting rules on
   `/api/public/*` and `/api/auth/*`.

## Secrets

* The ZIP's `.env` contained only the Supabase **publishable** key/URL (public by design) — no service-role
  or Resend keys were found. `.env*` is git-ignored; `.env.example` documents every variable.
* Supabase is no longer used. If the old Supabase project is retired, delete it (or at least roll its keys)
  after exporting any data you still need. If a Resend key was ever shared outside a secrets manager,
  rotate it (Resend → API keys).
* On the server, `.env` should be `chmod 600` and owned by the deploy user.

## Hardening checklist (production)

- [ ] `.env` filled with random 32+ char `AUTH_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, DB passwords; `chmod 600`
- [ ] `AMCMS_REQUIRE_MFA` unset or `true`
- [ ] Firewall: only 22, 80, 443 open (ufw and/or DigitalOcean Cloud Firewall); SSH key auth only
- [ ] HTTPS certificate issued (Caddy); `http://` redirects to `https://`
- [ ] Turnstile keys configured (recommended)
- [ ] Nightly backups copied off-site; restore drill completed
- [ ] `unattended-upgrades` enabled; Docker images refreshed (`docker compose pull && docker compose up -d --build`) monthly
- [ ] Error monitoring / uptime check on `/api/health` connected (see Operations)

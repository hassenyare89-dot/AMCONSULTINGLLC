# Security

This is an engineering control summary, **not a certification**. No penetration test of production was
performed (none was authorized). Testing covered the local development environment only.

## Controls implemented

| Area | Control | Where |
|---|---|---|
| Authentication | Server-mediated password sign-in with per-account (8/15 min) and per-IP (20/15 min) throttling; generic failure messages; every attempt logged | `server/rpc/session.server.ts`, `login_audit_events` |
| | Public self-signup removed from the UI; staff are invited by administrators | `routes/auth.index.tsx`, `users.invite` |
| | **TOTP MFA required** for all staff; every privileged server operation requires an AAL2 session | `MfaGate.tsx`, `authz.server.ts` |
| | Idle sign-out (default 30 min, configurable); deactivation bans the auth user so refresh tokens stop working | `AdminShell.tsx`, `users.setActive` |
| | Password policy (≥12 chars, common/email-derived passwords rejected) on reset/change | `lib/shared/password.ts` |
| | Password reset: rate-limited, non-enumerating responses | `/api/auth/reset` |
| Authorization | Code-defined RBAC (7 roles, 37 permissions); every operation checks permission on the server before data access; UI hiding is cosmetic only | `lib/shared/permissions.ts`, `rpc/registry.server.ts` |
| | Row scoping: dispatchers edit only their own/unassigned jobs; staff see their own tasks; restricted documents need `documents.restricted` | `resource-hooks.server.ts`, `files.server.ts` |
| | Only Super Admins grant/revoke Admin/Super Admin; last super admin cannot be removed; no self-demotion | `admin.server.ts` |
| Data access | RLS on all tables, **no** anon/authenticated privileges; service-role key server-only | migration `…0200` |
| Input | Zod validation on every endpoint (strict objects → no mass assignment); length limits; JSON body size limits | `lib/shared/*`, `server/http.server.ts` |
| Injection | Parameterised PostgREST queries; search terms stripped of filter syntax; enum/uuid validation for filters | `resource-schema.ts`, `resources.server.ts` |
| XSS | React escaping; CMS rich text allow-list sanitized on save **and** render; email templates escape all values; JSON-LD `<` escaped; `safeUrl` for CMS links | `lib/shared/sanitize.ts` |
| IDOR | Applicant status via 256-bit random tokens (only SHA-256 stored, 90-day expiry, removed from URL after load); estimates and appointment management via separate random tokens; legacy reference+email lookup returns status only and is throttled per reference | `intake.server.ts`, `quotes.server.ts` |
| CSRF | Admin calls use bearer tokens (not cookies); public POSTs require same-origin `Origin` | `assertSameOrigin` |
| Abuse | Postgres-backed rate limits (shared across Worker isolates), honeypot, time trap, optional Cloudflare Turnstile | `ratelimit.server.ts`, `turnstile.server.ts` |
| Uploads | Type from magic bytes (not filename/MIME), per-type size caps, random storage keys, private bucket for documents, SHA-256 recorded, downloads via 60 s signed URLs and audited | `files.server.ts` |
| Privacy | IPs stored only as salted hashes; sensitive fields masked in audit logs and excluded from CSV exports | `crypto.server.ts`, `audit.server.ts` |
| Headers | CSP, HSTS, nosniff, Referrer-Policy, Permissions-Policy, COOP, frame-ancestors; `noindex` + `no-store` on admin/auth/API | `src/server.ts` |
| Audit | Append-only `audit_logs` (DB trigger blocks edits) for admin actions, approvals, dispatch changes, quote approval, document downloads, publishing, settings, role changes | `audit.server.ts` |
| Errors | Typed safe errors; internal errors return a request id only; structured JSON logs with secret redaction | `logger.server.ts`, `rpc/dispatch.server.ts` |

## OWASP ASVS (v4.0.3) coverage summary

| Chapter | Status |
|---|---|
| V2 Authentication | Mostly met (MFA, throttling, generic errors, NIST-aligned password length). Breached-password check not implemented (Supabase "leaked password protection" can be enabled on Pro). |
| V3 Session | Met via Supabase JWT sessions + idle timeout + ban on deactivation. Configure JWT expiry ≤ 1 h in Supabase. |
| V4 Access control | Met — server-side, deny by default, tested per operation. |
| V5 Validation/encoding | Met. |
| V7 Errors/logging | Met; ship logs to a central store (see Operations). |
| V8 Data protection | Partially — TLS + private storage; at-rest encryption is Supabase-managed. |
| V12 Files | Met except **malware scanning** (not available in this stack; `scan_status` column ready). |
| V13 API | Met. |
| V14 Config | Met — headers, secrets via env, dependency audit in CI. |

## Known gaps / follow-ups

1. **CSP `script-src 'unsafe-inline'`** — required by TanStack Start's inline hydration scripts; move to
   nonces when supported by the framework config.
2. **Malware scanning** of uploads — integrate e.g. Cloudflare/ClamAV scanning service and set `scan_status`.
3. **Supabase dashboard settings (manual):** disable "Allow new users to sign up", enable TOTP MFA, set
   minimum password length 12, enable leaked-password protection, set JWT expiry, restrict redirect URLs
   to `https://amconsultingllc.net/auth/update-password`.
4. Server-mediated sign-in throttles *our* endpoint; Supabase's own auth endpoint is still reachable with the
   publishable key and is protected by Supabase's built-in rate limits.
5. WAF/DDoS: enable Cloudflare WAF managed rules and rate-limiting rules on `/api/public/*` and `/api/auth/*`.

## Secrets

* The ZIP's `.env` contained only the Supabase **publishable** key/URL (public by design) — no service-role
  or Resend keys were found. `.env*` is now git-ignored; `.env.example` documents every variable.
* If a service-role key or Resend key has ever been shared outside the secrets manager, **rotate it**
  (Supabase → Settings → API → roll service_role key; Resend → API keys).

## Hardening checklist (production)

- [ ] Supabase Auth settings above applied
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT` (random 32+ chars), `CRON_SECRET`, `RESEND_API_KEY` set as secrets
- [ ] `AMCMS_REQUIRE_MFA` unset or `true`
- [ ] `BOOTSTRAP_SUPER_ADMIN_EMAIL` removed after first sign-in
- [ ] Cloudflare: HTTPS only, HSTS, TLS ≥1.2, WAF managed rules, bot fight mode, rate-limit rules
- [ ] Turnstile keys configured (recommended)
- [ ] Backups + PITR enabled; restore drill completed
- [ ] Error monitoring connected (see Operations)

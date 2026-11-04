# Test Report

Run on 2026-11-04 in the development container (Node 22, Postgres 16, Docker 29, Chromium via Playwright 1.63),
after replacing Supabase with self-hosted PostgreSQL.
Results below are the **actual** final results; nothing was run against production.

| Suite | Command | Result |
|---|---|---|
| Production build | `bun run build` | ✅ succeeds (standalone Node server, `node-server` preset) |
| Strict TypeScript | `bun run typecheck` | ✅ 0 errors |
| ESLint (errors) | `npx eslint src tests --quiet` | ✅ 0 errors (`no-explicit-any` is a warning in admin/server code — tracked debt) |
| Unit + authorization | `bun run test` | ✅ **142 / 142** passed (9 files) |
| Database migrations + RLS | `bun run test:db` | ✅ all assertions passed (app role is a non-superuser owner, as in production) |
| Self-hosted integration | `./scripts/test-integration.sh` | ✅ **21 / 21** checks (built server + Postgres: form → DB, create-admin, invite, sign-in, TOTP, uploads, signed links, sign-out, deactivation; one check in a real browser) |
| Docker Compose stack | manual run (`docker compose up`) | ✅ runtime image, Postgres init, migrations, Caddy HTTPS + redirect, `/api/cron` blocked publicly, scheduler backup, `create-admin`, maintenance job, backup → restore round-trip |
| E2E + accessibility | `bun run test:e2e` | ✅ **115 passed, 0 failed, 3 skipped** (desktop 1440×900 + Pixel 7) |

## What the suites cover

**Self-hosting units (Vitest, `selfhosted.test.ts`)** — filter parser and injection rejection, generated SQL for
select/or/not-in/upsert/update, refusal of unfiltered UPDATE/DELETE, RFC 6238 TOTP vectors + replay window,
scrypt password hashing, AES-GCM tamper detection, storage path traversal, signed-link tampering/expiry, cookie flags.

**Unit / authorization (Vitest)**
* RBAC matrix: role → permission mapping, viewer read-only, dispatcher/content-editor limits, protected-role grants.
* **Every one of the server operations** (60+) is invoked by a staff member with no permissions and must fail
  **without any database access**; a control test proves the same call reaches the DB when permitted. Read
  permission doesn't grant writes. Only `session.me`/`session.event` work before MFA. Deactivated/role-less
  accounts and AAL1 sessions are rejected.
* Dispatch workflow transitions, half-open overlap, driver/truck conflict detection, auto-assign status.
* Estimate money math in cents, tax validation, currency formatting.
* Sanitizer against 10 XSS payloads (script, event handlers, `javascript:`/`data:` URLs, iframe, svg, style), safe URLs.
* Appointment slots across DST, weekends, notice/horizon, busy times.
* Public form contracts (backward compatibility, honeypot, USDOT digits, consent).
* Resource schemas: mass-assignment protection, enum/pattern/VIN validation, null handling, filter-injection stripping.
* CMS: every default section validates; `javascript:` links and unknown fields rejected; unverified highlights hidden.
* Error serialization, password policy, audit redaction/diff, upload magic-byte sniffing (disguised HTML/EXE rejected), hero mode selection.

**Database (real PostgreSQL 16, all 7 migrations applied, AMCMS migration re-applied for idempotency)**
* anon/authenticated hold no privileges on any table (only the original own-roles read); RLS enabled everywhere.
  *This test found and fixed a real gap:* Supabase default privileges left `anon` with grants on `user_roles`.
* Privileged functions not executable by client roles; real anon SELECT/INSERT attempts fail.
* Rate limiter, dispatch double-booking exclusion (overlap rejected, back-to-back and cancelled allowed),
  "assigned requires driver", appointment overlap, append-only audit log (UPDATE/DELETE rejected), VIN check,
  human-readable numbers, driver status check.

**End-to-end (Playwright + axe-core)** — 17 public pages render one `<h1>`, title and canonical; 404 for unknown
service; hero headline/CTAs and absence of the removed unverified stats; skip link; footer legal links and no `#`
links; FAQ empty state; desktop navigation with `aria-current`; mobile menu open/navigate/Escape; no horizontal
overflow; **axe WCAG 2.0/2.1/2.2 A+AA: 0 violations on 16 pages in both viewports**; reduced motion → static
image, no video/WebGL; pause control persists; client validation with focus management; map loads only after
click; API: cross-origin POST 403, malformed JSON 400, invalid input 400 without internals, honeypot silently
accepted, oversize payload refused, malformed status token 404, cron secret required, upload requires auth,
anonymous admin RPC rejected; security headers; `noindex` on admin; robots/sitemap; valid JSON-LD; `/admin`
redirects to sign-in with no sign-up offered.

Skipped by design: desktop-only navigation test on mobile, mobile-menu test on desktop, and the pause-control
test on mobile (mobile uses the background video, which isn't served in the test environment).

Issues found and fixed during the self-hosting work: an `infinity` ban timestamp not recognised as banned
(bans are now evaluated in SQL), and an unread 401 response body keeping the sign-in page's request open.

Issues found and fixed by earlier tests included the `user_roles` grant gap, a WCAG 2.5.3 label-in-name failure in
the logo fallback, a missing 404 for unknown service slugs, and HTTPS-only CSP directives breaking HTTP origins.

## Not tested here (and why)

| Area | Reason | How to verify |
|---|---|---|
| Most AMCMS screens clicked through with data | Integration test covers auth, uploads and one form; other screens rely on unit/authorization tests | Staging smoke test, docs/07 |
| The Docker image's *build* stage | Build containers in this sandbox have no package-registry access; the runtime stage was built from locally built output | First `docker compose up --build` on the Droplet (CI also runs `docker build`) |
| A real Droplet + Let's Encrypt certificate | No server/domain available here | docs/12 |
| Email delivery | No Resend key | Send a test contact form after configuring |
| Lighthouse / Core Web Vitals | Only a dev server was available | Run Lighthouse on the deployed site |
| Screen-reader and manual keyboard audit | Automated scans can't cover everything | NVDA + VoiceOver walkthrough |
| Load, penetration testing | Not authorized / out of scope | Commission separately |

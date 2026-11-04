# Handover Report

## What was delivered

The uploaded `Amconsultingllc.net--main.zip` (TanStack Start + Supabase, Lovable-connected) was audited and
extended in place — no framework migration, and every original page and API route path still exists.

**Public website:** CMS-driven Home (cinematic hero), About, Services + 6 service detail pages, Who We Serve,
How It Works, Request a Quote, Book a Consultation (+ manage/cancel link), Driver Registration, Confirmation and
secure Status, FAQ (searchable, FAQ schema), Contact, Privacy Policy, Terms, Accessibility, Cookie Policy,
Privacy Request form, customer estimate view/accept/decline, sitemap.xml, robots.txt.

**AMCMS (`/admin`):** Overview dashboard + tasks, Driver Management (applications review workflow, notes,
reviewer, history, approved roster), Truck & Fleet (profiles, assignment history, expiry/maintenance view),
Dispatch (jobs, workflow, conflict prevention, communications, load records, day/week/month calendar,
workload), Projects (resources, linked jobs, progress, printable report), CRM (pipeline board, leads,
customers, contacts, interactions, follow-ups, web submissions, duplicate warnings, lead→customer), Quotes
(requests, itemized estimates from approved pricing rules, send via secure link, customer response, revisions,
approval, convert to project), Appointments, Document Center (private, versioned, audited downloads),
Notifications, Website CMS (sections, rich text, media library, drafts, live preview, publish/schedule,
revisions/restore, FAQs), Reports (date-filtered, CSV), User Management (invite, roles, deactivate), Compliance
(privacy requests, consent records, data-subject lookup), Security & Audit Logs (actions, sign-ins, email
delivery), System Settings, My Account.

**Platform:** 2 additive migrations (~40 tables, RLS deny-by-default, exclusion constraints, append-only audit),
RBAC with 7 roles / 37 permissions enforced server-side, mandatory TOTP MFA, throttled sign-in, Postgres-backed
rate limiting, upload content sniffing, CSP and security headers, structured logging, CI workflow, and
11 documents under `docs/`.

## Notable changes to existing behaviour (review these)

| Change | Why |
|---|---|
| Contact submissions are now **saved** and create CRM leads | Previously lost when email wasn't configured |
| Open sign-up removed from `/auth`; staff are invited | Anyone could create accounts |
| Staff must use an authenticator app (MFA) | Brief requirement; set `AMCMS_REQUIRE_MFA=false` only for local dev |
| Stats band ("500+ loads", "98% on-time") and hero numbers removed; highlights show only when marked verified | Not substantiated anywhere in the repo |
| Hero badges changed from "Fully vetted / 24/7 / Nationwide" to factual service descriptions (CMS-editable) | Unverified claims; address says Atlanta area |
| Accent colour changed from cyan (#00FFFF) to brand green (#0DAA77) | Matches the brief and the original README brief; verify against the logo |
| USDOT number is now optional on driver registration | Brief: "where applicable" |
| Driver status links use secure tokens; id+email lookup shows status only | Prevents exposing application details |
| Raw IPs no longer stored (salted hash) | Data minimisation |
| `src/lib/admin.functions.ts` removed | Replaced by audited RPC; its first-admin RPC had already been revoked in the DB |
| `bun.lock` regenerated against the public npm registry | The original lockfile pointed at a private mirror unreachable here |

## Self-hosted PostgreSQL (Supabase removed)

At the owner's request, Supabase (database API, Auth/MFA, Storage) was replaced by a self-hosted stack
that runs with Docker on one Linux server (docs/12):

* **Database:** plain PostgreSQL 16; the 7 original migrations are unchanged and applied by
  `scripts/migrate.mjs`. A small parameterised query builder keeps all service code as it was.
* **Auth:** built in — scrypt passwords, server-side sessions in an HttpOnly cookie, TOTP MFA (encrypted
  secrets, replay protection), invite and reset links, deactivation revokes sessions. Super Admins can
  reset another user's MFA from **Users**.
* **Files:** local disk / Docker volume; public media at `/files/media/…`, private documents via
  60-second HMAC-signed links.
* **Deployment:** `Dockerfile` + `docker-compose.yml` (Postgres, app, Caddy HTTPS, scheduler for nightly
  backups + daily maintenance), `deploy/backup.sh` / `deploy/restore.sh`, `scripts/create-admin.mjs`.
* **Existing Supabase data is not migrated automatically.** If the old project holds data you need
  (staff accounts, driver applications, contact submissions), export it (`pg_dump` of the `public`
  schema) and import it before go-live; staff accounts must be re-created with `create-admin.mjs` /
  invites because Supabase password hashes and MFA factors are not carried over.

## Verification

See [10-TEST_REPORT.md](10-TEST_REPORT.md). In short: build ✅, strict typecheck ✅, ESLint ✅, unit and
authorization tests ✅, Postgres migration/RLS tests ✅ (as a non-superuser owner, like production), and
a self-hosted integration test ✅ that runs the built server against Postgres and exercises the contact
form, admin provisioning, invite link, sign-in, MFA, uploads, signed document links and sign-out — in the
API and in a real browser. The Docker Compose stack (runtime image, Postgres init, Caddy HTTPS, scheduler
backups, create-admin, restore) was run end-to-end locally. **Not verified here:** a real DigitalOcean
Droplet, Let's Encrypt issuance for the real domain, email delivery. Lighthouse scores were not measured.

## Required next actions (in order)

1. **Review & merge** the self-hosting PR.
2. **Create the Droplet and deploy** — docs/12 (DNS, `.env` secrets, `docker compose up -d --build`).
3. **Create the first Super Admin** with `scripts/create-admin.mjs` and invite staff — docs/09.
4. **Re-upload the logo, About image and hero video** in the CMS Media library (the `/__l5e/` pointers only
   work on Lovable hosting) — docs/07.
5. **Import any data** you need from the old Supabase project, then retire it (delete or roll its keys).
6. **Set `RESEND_API_KEY`** (+ verify the sending domain) for emails, optionally Turnstile keys.
7. **Run the smoke test** in docs/07; **copy backups off the server**; connect uptime monitoring.
8. **Business & legal review**: legal name, address/hours/service area, legal page drafts, FMCSA/broker
   question, retention periods — docs/08. Then publish the legal pages from the CMS.
9. Run Lighthouse against the deployed site and record results.

## Technical debt

* Generate row types from the schema, type `db()`, and remove the `any` lint exceptions.
* CSP still allows inline scripts (framework limitation) — move to nonces when available.
* No malware scanning on uploads.
* SMS notifications are intentionally not implemented (TCPA consent design required first).

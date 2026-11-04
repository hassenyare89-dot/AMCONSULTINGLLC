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

## Verification

See [10-TEST_REPORT.md](10-TEST_REPORT.md). In short: build ✅, strict typecheck ✅, ESLint ✅, unit and
authorization tests ✅, Postgres migration/RLS tests ✅, Playwright E2E + axe ✅ (details there). **Not
verified here:** anything requiring a live Supabase project (sign-in, MFA, saving records through the UI,
storage uploads, email). Lighthouse scores were not measured.

## Required next actions (in order)

1. **Review & merge** the branch `claude/magical-ramanujan-g1nlx4`.
2. **Back up** the production database, then apply the two new migrations.
3. **Configure Supabase Auth** (disable sign-ups, enable TOTP, redirect URLs, password length) — docs/06.
4. **Set secrets:** `SUPABASE_SERVICE_ROLE_KEY`, `IP_HASH_SALT`, `CRON_SECRET`, `RESEND_API_KEY`
   (+ verify sending domain), optionally Turnstile keys and `BOOTSTRAP_SUPER_ADMIN_EMAIL`.
5. **Bootstrap the first Super Admin** and invite staff — docs/09.
6. **Run the smoke test** in docs/07 on staging/production.
7. **Re-upload or confirm assets**: hero video, logo, about image (docs/05).
8. **Business & legal review**: legal name, address/hours/service area, legal page drafts, FMCSA/broker
   question, retention periods — docs/08. Then publish the legal pages from the CMS.
9. Schedule the daily `/api/cron/maintenance` call; connect error monitoring; enable Cloudflare WAF rules.
10. Run Lighthouse against the deployed site and record results.

## Technical debt

* Regenerate Supabase types and remove the untyped admin client / `any` lint exceptions.
* CSP still allows inline scripts (framework limitation) — move to nonces when available.
* No malware scanning on uploads.
* SMS notifications are intentionally not implemented (TCPA consent design required first).

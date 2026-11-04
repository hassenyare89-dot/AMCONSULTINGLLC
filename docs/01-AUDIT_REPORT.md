# AM Consulting LLC — Repository Audit Report

**Audited source:** `Amconsultingllc.net--main.zip` (uploaded to `main` in commit `ea6f009`)
**Audit date:** 2026-11-02
**Auditor:** Claude Code (automated engineering audit; not a legal or security certification)

---

## 1. Actual architecture (verified from source)

| Layer | Implemented technology | Notes |
|---|---|---|
| Framework | **TanStack Start 1.168** + TanStack Router 1.170 (file routes) | The README's mention of Next.js does **not** describe the code. |
| Build | Vite 8 (rolldown) via `@lovable.dev/vite-tanstack-config` | Builds a **Cloudflare Workers** bundle through Nitro (`.output/server/wrangler.json`). |
| UI | React 19, Tailwind CSS 4, shadcn/Radix components (47 in `src/components/ui`), framer-motion 12, lucide | |
| Data | Supabase (Postgres + Auth); 5 SQL migrations | Project is connected to **Lovable** (`.lovable/project.json`, `AGENTS.md`). |
| Server code | TanStack server routes (`src/routes/api/public/*`) and `createServerFn` (`src/lib/admin.functions.ts`) | Service-role client loaded only inside handlers (correct pattern). |
| Email | Resend REST API (optional, `RESEND_API_KEY`) | |

**Decision: keep TanStack Start.** It is technically suitable (SSR, typed server functions, file routes, Workers deploy), it is what Lovable syncs, and a migration would put existing features at risk for no benefit. Everything new follows the existing conventions.

## 2. Existing features (preserved)

| Feature | Location | State found |
|---|---|---|
| Homepage (video hero, stats, services, who-we-serve, why-us, process) | `routes/index.tsx`, `components/site/*` | Working; **stats and hero cards show unverified numbers** (see §4). |
| About / Services / Process / Contact pages | `routes/*.tsx` | Working. |
| Contact form with honeypot + time trap + address autocomplete (Nominatim) | `components/site/Contact.tsx`, `api/public/contact.ts` | **Does not persist to the database.** Without `RESEND_API_KEY` leads are only logged and are effectively lost. |
| Driver registration → DB insert + emails | `DriverRegistration.tsx`, `api/public/driver.ts` | Working. Stores raw IP. |
| Driver confirmation page | `drivers.confirmation.tsx` | Working (sessionStorage summary). |
| Driver status lookup (id + email) | `drivers.status.tsx`, `api/public/driver-status.ts` | Working; email + id are placed in the URL (leaks into logs, history, referrers) and full application details are returned. |
| Admin sign-in / sign-up | `routes/auth.tsx` | **Open self-signup** is offered in the UI. No MFA. |
| Admin driver list, filters, status change, CSV export | `_authenticated/admin.drivers.tsx` | Working; single `admin` role; no audit trail. |
| SEO: titles, descriptions, canonical, OG, LocalBusiness JSON-LD, manifest, icons | `__root.tsx`, `public/` | Partial: no sitemap, no robots.txt, duplicate meta tags. |
| Accessibility: skip link, focus utility, aria on nav | Header, styles | Good base. |

## 3. Missing features (vs. the brief)

All AMCMS modules are absent: fleet, dispatch, projects, CRM, quotes, appointments, documents, notifications, CMS, reports, user management, compliance, audit logs, settings. Public pages missing: Who We Serve (standalone), FAQ, Request a Quote, Privacy, Terms, Accessibility, Cookies, per-service detail pages. No tests, no CI, no `.env.example`, no sitemap/robots.

## 4. Security & integrity findings

| # | Severity | Finding | Remediation in this change |
|---|---|---|---|
| S1 | **High** | Contact leads are dropped when email isn't configured; no persistence. | Persist to `contact_submissions` + CRM `leads` before any email. |
| S2 | **High** | Open self-signup at `/auth`; any visitor can create a Supabase auth user. (They get no role, so no data exposure today, but it enlarges attack surface.) | Removed sign-up UI; staff are invited by authorised admins. **Also disable sign-ups in Supabase Auth settings** (manual step). |
| S3 | **High** | No MFA for privileged users. | TOTP MFA enrolment + AAL2 enforcement on every privileged server function. |
| S4 | Medium | Rate limiting is per-isolate in memory (ineffective on Workers, resets on cold start). | Postgres-backed `rate_limit_hit()` with in-memory fallback. |
| S5 | Medium | Driver status uses id+email in URL and returns full record. | Hashed, expiring access tokens (`driver_status_tokens`); id+email lookup returns status only and emails a secure link. |
| S6 | Medium | Raw IP addresses stored in `driver_registrations.ip` and emailed. | New writes store a salted SHA-256 hash; IP removed from emails. |
| S7 | Medium | No audit log of admin actions. | Append-only `audit_logs` table (update/delete blocked by trigger). |
| S8 | Medium | No security headers / CSP on SSR responses. | Headers added in `src/server.ts`. |
| S9 | Low | `.env` is **not** in `.gitignore` and is inside the ZIP. It contains only the Supabase **publishable** (anon) key and URL — designed to be public — and **no service-role key or Resend key**. | `.env*` added to `.gitignore`; `.env.example` added. Rotation of the publishable key is optional; **rotate immediately if a service-role key was ever committed elsewhere.** |
| S10 | Low | Public API endpoints accept cross-origin POSTs. | Origin check on public POST routes. |
| S11 | Low | `getAdminStatus` returned `adminExists`; `claimFirstAdmin` RPC was already revoked in migration `20260705032217`, so the button in the admin UI always errors. | Replaced with env-gated `BOOTSTRAP_SUPER_ADMIN_EMAIL` bootstrap. |

## 5. Content integrity findings (business facts — require owner verification)

These are displayed today but are **not substantiated anywhere in the repository**:

* Stats: "500+ Loads Coordinated", "100+ Clients Served", "98% On-Time Performance", "24/7 Support".
* Hero cards: "Active Loads Today 42 (+12%)", "On-Time Delivery 98%", "Routes Optimized 1.2k".
* Hero badges: "Fully vetted drivers", "24/7 dispatch support", "Nationwide coordination" (the business address and copy elsewhere say *Atlanta, GA & surrounding areas*).
* Driver email: "you'll start receiving consistent hauling work".
* Company name appears in three forms: "AM Consulting & Hauling", "AMCONSULTINGLLC", "AM Consulting LLC". The registered legal name must be confirmed.

**Action taken:** numeric stats/hero metrics are no longer hard-coded. Stats are CMS-managed and only render when an administrator enters them and ticks "verified"; hero cards are now descriptive (non-numeric). Badge copy defaults to factual service descriptions and is editable in the CMS.

## 6. Database design found

* `app_role` enum (`admin`), `user_roles` (RLS: read own), `has_role()` (service-role only), `claim_first_admin()` (revoked).
* `driver_registrations` — RLS enabled, all anon/authenticated writes explicitly denied, admin read policy was later dropped → **all access goes through the service role on the server**. This is a sound "deny by default, server mediates" model and is kept for every new table.

## 7. Asset availability

| Asset | In ZIP? | Status |
|---|---|---|
| `hero-truck.jpg` (172 KB) | **Yes** | Used as poster and fallback. |
| `hero.mp4` (6.9 MB) | **No** — only `hero.mp4.asset.json`, which points to Lovable's asset CDN at the relative path `/__l5e/assets-v1/b25cad92-…/hero.mp4`. | **Not recovered.** Fetching it from `amconsultingllc.net` was blocked by this environment's network policy. The relative URL is kept, so it will keep working **when deployed on Lovable**. If it fails to load, the hero falls back to the poster image. Admins can upload a replacement in CMS → Media. See `docs/05-HERO_VIDEO_SPEC.md`. |
| `am-logo-full.png`, `about-trucks.jpg`, `am-favicon.png` | **No** — asset JSON pointers only (About photos replaced Nov 2026 by `public/media/about-*.jpg`) | Same as above; logo falls back to a text wordmark on load error. Favicons/PWA icons **are** in `public/`. |

I did **not** obtain or fabricate the original video.

## 8. Required migrations

1. `20261102000100_rbac_role_values.sql` — adds 6 role values to `app_role` (additive).
2. `20261102000200_amcms_schema.sql` — all AMCMS tables, constraints, indexes, RLS, triggers, storage buckets, rate-limit function. **Additive only**: existing tables are altered with `ADD COLUMN IF NOT EXISTS`, `DROP NOT NULL` on `dot_number`, and a `NOT VALID` status check so existing rows are untouched.

No destructive statements. Take a backup before applying to production (see `docs/07-OPERATIONS.md`).

## 9. Implementation priorities

1. Persist leads (S1) and lock down auth (S2, S3).
2. Schema + RBAC + audit log.
3. AMCMS modules (drivers → fleet → dispatch → projects → CRM → quotes → appointments → documents → CMS → reports → users → compliance → settings).
4. Public site: hero/3D, new pages, legal drafts, SEO.
5. Tests, CI, docs.

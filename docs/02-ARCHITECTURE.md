# Architecture

## Decision: keep TanStack Start

The application was audited (docs/01) and **kept on TanStack Start**: it already provides SSR, typed
server functions, file-based routing and a Cloudflare Workers deployment, and Lovable syncs this
structure. No Next.js conventions were introduced.

## Layout

```
src/
  routes/                      File routes (TanStack Router)
    index.tsx, about.tsx, services.index.tsx, services.$slug.tsx, who-we-serve.tsx, process.tsx,
    quote.tsx, book.index.tsx, book.manage.tsx, quotes.view.tsx, faq.tsx, contact.tsx,
    drivers.index.tsx / .confirmation / .status, privacy.index.tsx, privacy.request.tsx,
    terms.tsx, accessibility.tsx, cookies.tsx, sitemap[.]xml.ts, robots[.]txt.ts
    auth.index.tsx / auth.reset.tsx / auth.update-password.tsx       staff sign-in (no public sign-up)
    _authenticated/route.tsx                                        requires a session (checked via /api/auth/session)
    _authenticated/admin.tsx                                        AMCMS shell (MFA gate, sidebar)
    _authenticated/admin.*.tsx                                      one file per AMCMS module
    api/public/*.ts                                                 public form endpoints
    api/auth/*.ts, api/admin/upload.ts, api/cron/maintenance.ts
  components/site/              Public UI (Hero, 3D scene, sections, forms)
  components/admin/             AMCMS UI kit (ResourceManager, forms, documents, CMS editor)
  components/ui/                shadcn/Radix primitives (unchanged)
  lib/shared/                   Isomorphic: permissions, domain vocabularies, Zod contracts,
                                resource definitions, CMS model, sanitizer, money & slot math
  lib/content/                  Default website content + legal drafts, site hooks, SEO helper
  lib/admin/                    Client RPC + session helpers
  lib/api/                      createServerFn entry points (adminRpc, getSiteContent)
  server/                       *.server.ts — never bundled for the browser
    authz, audit, crypto, db, email, env, http, logger, notify, ratelimit, settings, turnstile
    rpc/registry.server.ts      operation registry (every admin operation)
    rpc/dispatch.server.ts      central dispatcher: auth → staff/MFA gate → rate limit → handler
    services/                   domain services (intake, resources + hooks, drivers, quotes,
                                operations, cms, files, admin)
db/migrations/                  Ordered SQL migrations (original 5 + 2 AMCMS)
db/platform/                    Cluster roles + auth schema for plain PostgreSQL
db/tests/                       Database authorization tests (run on real Postgres)
Dockerfile, docker-compose.yml  Self-hosted deployment (docs/12)
tests/unit, tests/e2e           Vitest and Playwright suites
```

## Request flow

**Public forms** → `POST /api/public/<form>` → same-origin check → Zod validation (shared schema) →
Postgres-backed rate limit (per IP-hash, per minute and per day) → honeypot / time trap → optional
Turnstile → **persist first** (submission + CRM lead + consent record) → staff notification →
transactional email (logged in `notification_delivery_events`).

**Sign-in** → `POST /api/auth/sign-in` (throttled, audited) sets an HttpOnly `amcms_session` cookie →
`POST /api/auth/mfa-enroll` / `mfa-verify` upgrades that server-side session to AAL2.

**AMCMS** → browser calls `adminRpc({ op, input })` (one `createServerFn`); the session cookie is sent
automatically → `requireSession` (`lib/auth/middleware.ts`) resolves it against `auth.sessions`
(expiry, idle timeout, revocation, ban) → `runOp`:
1. load roles + profile (`loadStaff`),
2. `assertStaff`: active account, has a role, **session is AAL2 (MFA)** — only `session.me` and
   `session.event` are exempt so the UI can route to enrolment,
3. per-user rate limit,
4. the handler, which calls `requirePermission(ctx, <permission>)` before any data access,
5. typed errors are encoded (`AMCMS:{code,message}`) so the UI gets safe messages; anything
   unexpected becomes `INTERNAL` with a request id.

The database client (`server/db.server.ts`, a parameterised query builder over `pg`) connects as the
schema owner, so it is only reachable from server modules after these checks. The database itself is
reachable only on the private Docker network; RLS remains enabled and anon/authenticated have **no
table privileges** as defence in depth.

## Generic resource engine

`lib/shared/resources.ts` declares each record type once (fields, types, enums, references, list/search/
filter flags, permissions, archive/delete behaviour). From that:

* the server derives strict Zod schemas (`.strict()` → mass-assignment protection), column allow-lists,
  safe search (PostgREST filter characters stripped), filters, sorting, pagination, CSV export
  (formula-injection safe, sensitive columns excluded) and field-level audit diffs;
* the UI derives tables and forms (`ResourceManager`, `ResourceForm`).

Business rules live in `server/services/resource-hooks.server.ts` — e.g. dispatch status transitions,
conflict detection, dispatcher row-scoping, truck assignment history, CRM duplicate warnings, FAQ
publishing permission, privacy request resolution timestamps.

Bespoke workflows (driver review, estimates, CMS publishing, documents, appointments, reports, users)
have dedicated services.

## Website content (CMS)

`lib/shared/cms-schema.ts` defines editable sections and their fields; `lib/content/defaults.ts` holds the
default copy. The root route loader calls `getSiteContent()` which merges **published** CMS JSON over
defaults (validated, rich text re-sanitized) with a 30 s isolate cache; if the database is unavailable the
site renders defaults. Drafts, scheduled publishing, revisions and restore are handled in
`server/services/cms.server.ts`.

## Hero

`components/site/Hero.tsx` SSR-renders the poster image (fast LCP, no-JS fallback). After hydration it
chooses: **3D** (WebGL, ≥1024 px, ≥4 cores, no Save-Data), **video**, or **image** (reduced motion /
Save-Data / errors). The Three.js scene is code-split (`React.lazy`) so it never loads on mobile or for
reduced-motion users, pauses when off-screen or the tab is hidden, and has a persistent pause control.

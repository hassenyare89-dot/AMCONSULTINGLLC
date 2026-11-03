# Operations & Deployment

## Hosting model

The project is Lovable-connected and builds a **Cloudflare Workers** bundle through Nitro
(`bun run build` → `.output/`, `wrangler.json` generated). Recommended production path:

1. **Lovable publish** (default) — pushes to the connected branch deploy automatically; Lovable serves the
   `/__l5e/` asset CDN used by the original logo/video pointers.
2. **Self-managed Cloudflare** (alternative) — `bun run build && npx wrangler deploy --config .output/server/wrangler.json`.
   If you leave Lovable hosting, re-upload the logo, about image and hero video through the CMS Media library
   first (the `/__l5e/` pointers only resolve on Lovable).

Database/Auth/Storage: Supabase (Lovable Cloud project `ywfrbqonpnlsnguvqjrq` per `supabase/config.toml`).

## Environment variables

See `.env.example`. Server secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_API_KEY`, `IP_HASH_SALT`,
`CRON_SECRET`, `TURNSTILE_SECRET_KEY`) go in the hosting provider's secret store — never in Git or `VITE_*`.

## Release procedure

1. CI green on the PR (typecheck, lint, unit/authorization tests, DB migration tests, build, E2E + axe).
2. **Back up the database** (on-demand backup or `supabase db dump`). Record the timestamp.
3. Apply migrations to production: `supabase db push` (or Lovable Cloud migration run). Both AMCMS
   migrations are additive and idempotent.
4. Deploy the application.
5. Smoke test: home page, contact submission (check it appears in AMCMS → CRM → Website submissions),
   driver registration + status link, staff sign-in + MFA, one dispatch job create/cancel.
6. Configure Supabase Auth settings (docs/06) if not yet done.

## Rollback

* **App:** redeploy the previous build (Lovable version history, or `wrangler rollback`).
* **Database:** the AMCMS migrations only add objects; the previous app version ignores them, so app
  rollback does not require DB rollback. If a DB rollback is truly needed, restore the pre-release backup
  into a new project / PITR to the recorded timestamp — never hand-drop tables holding live data.

## DNS & SSL checklist

- [ ] `amconsultingllc.net` and `www` point to the hosting provider (Lovable custom domain or Cloudflare Workers route)
- [ ] `www` → apex 301 redirect (or the reverse — pick one canonical; code assumes `https://amconsultingllc.net`)
- [ ] Cloudflare SSL mode **Full (strict)**, "Always use HTTPS", minimum TLS 1.2, HSTS enabled
- [ ] Resend domain verified: SPF, DKIM and DMARC (`p=quarantine` once stable) records added
- [ ] `LEAD_FROM_EMAIL` uses the verified domain
- [ ] `PUBLIC_SITE_URL` / `VITE_PUBLIC_SITE_URL` set to the canonical origin
- [ ] Supabase Auth → URL configuration: Site URL and redirect allow-list set to the canonical origin

## Scheduled maintenance

`POST /api/cron/maintenance` with `Authorization: Bearer $CRON_SECRET`, **daily**. It publishes due scheduled
CMS sections, creates in-app reminders 30 days before truck registration/insurance/maintenance dates and
document expirations, flags privacy requests due within 7 days, and expires stale estimates. It is
idempotent (deduplicated notifications). Options: Cloudflare Cron Trigger calling the route, a GitHub
Actions `schedule`, or any uptime/cron service.

## Monitoring

* **Logs:** the server writes structured JSON (`ts`, `level`, `msg`, `rid`, `op`, …) with secret redaction.
  Enable Cloudflare Workers Logs / Logpush to a log store. Alert on `level=error` and on `AUDIT WRITE FAILED`.
* **Errors:** add Sentry (or equivalent) — `@sentry/cloudflare` for the Worker and `@sentry/react` in
  `__root.tsx`'s error boundary (existing `reportLovableError` hook is the integration point). Not installed
  here because it requires a DSN.
* **Email delivery:** AMCMS → Security & Audit Logs → Email delivery shows sent / failed / skipped.
* **Uptime:** monitor `/` and `/robots.txt`.

## Data retention runbook (quarterly)

Targets are configured in AMCMS → System Settings → Data retention. Retention deletion is a **reviewed manual
process** (legal holds and business-record obligations vary):

```sql
-- Review before deleting; run as the service role / SQL editor.
select count(*) from contact_submissions where created_at < now() - interval '730 days';
delete from contact_submissions where created_at < now() - interval '730 days';
delete from driver_registrations where status = 'rejected' and decided_at < now() - interval '365 days';
delete from login_audit_events where created_at < now() - interval '365 days';
delete from rate_limits where reset_at < now() - interval '1 day';
```

`audit_logs` is append-only by design; archiving it requires a DBA to temporarily disable the trigger in a
reviewed change.

## Backup & restore

See docs/04-DATABASE.md. Also back up the private `documents` storage bucket separately.

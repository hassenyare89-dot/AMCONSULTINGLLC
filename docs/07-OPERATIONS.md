# Operations & Deployment

## Hosting model

Self-hosted with Docker Compose on one Linux server (e.g. a DigitalOcean Droplet): PostgreSQL 16, the
Node.js app (`node .output/server/index.mjs`, built by Nitro's `node-server` preset), Caddy for automatic
HTTPS, and a scheduler for backups and the daily job. **Step-by-step: docs/12-DEPLOY_DIGITALOCEAN.md.**

There is no Supabase or Cloudflare dependency. Any host that runs Docker (or Node 22 + PostgreSQL 14+)
works.

> **Brand assets after leaving Lovable hosting.** The original logo, About image and hero video are
> referenced as `/__l5e/…` pointers that only resolve on Lovable's CDN, and the binaries are not in the
> repository. Until they are re-uploaded, the site shows its built-in fallbacks (text wordmark, gradient
> hero, no About photo). Fix: download the originals (from Lovable or your own copies), upload them in
> **AMCMS → Website content → Media library**, and set them as the logo / hero video / About image in the
> corresponding CMS sections, then publish.

## Environment variables

See `.env.example`. Secrets (`AUTH_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, database passwords,
`RESEND_API_KEY`, `TURNSTILE_SECRET_KEY`) live only in the server's `.env` (`chmod 600`) — never in Git
or `VITE_*` variables.

## Release procedure

1. CI green on the PR (typecheck, lint, unit/authorization tests, DB migration tests, build, self-hosted
   integration test, Docker build, E2E + axe).
2. On the server: `./deploy/backup.sh` (record the file name).
3. `git pull && docker compose up -d --build` — the app container applies pending migrations before it
   starts serving (`docker compose logs app` shows them).
4. Smoke test: home page, contact submission (check it appears in AMCMS → CRM → Website submissions),
   driver registration + status link, staff sign-in + MFA, one upload, one dispatch job create/cancel.

## Rollback

* **App:** `git checkout <previous tag/commit> && docker compose up -d --build`.
* **Database:** migrations only add objects; the previous app version ignores them, so an app rollback
  does not require a DB rollback. If one is truly needed, restore the pre-release dump with
  `deploy/restore.sh` — never hand-drop tables holding live data.

## DNS & SSL checklist

- [ ] `amconsultingllc.net` and `www` A records point to the Droplet IP (Caddy redirects `www` → apex)
- [ ] Certificate issued (check `docker compose logs caddy`); `http://` redirects to `https://`
- [ ] If Cloudflare proxies the domain: SSL mode **Full (strict)**
- [ ] Resend domain verified: SPF, DKIM and DMARC (`p=quarantine` once stable) records added
- [ ] `LEAD_FROM_EMAIL` uses the verified domain
- [ ] `PUBLIC_SITE_URL` set to the canonical origin (it is also baked into the browser build)

## Scheduled maintenance

`POST /api/cron/maintenance` with `Authorization: Bearer $CRON_SECRET`, **daily**. It publishes due scheduled
CMS sections, creates in-app reminders 30 days before truck registration/insurance/maintenance dates and
document expirations, flags privacy requests due within 7 days, and expires stale estimates. It is
idempotent (deduplicated notifications) and also prunes expired sessions/tokens. The Docker `scheduler`
service calls it every day at ~06:00 UTC over the internal network; Caddy blocks `/api/cron/*` from the
internet.

## Monitoring

* **Logs:** the server writes structured JSON (`ts`, `level`, `msg`, `rid`, `op`, …) with secret redaction.
  View with `docker compose logs app`; Docker rotates nothing by default, so set log rotation
  (`/etc/docker/daemon.json`: `{"log-driver":"local","log-opts":{"max-size":"20m","max-file":"5"}}`) or ship
  logs to a store. Alert on `level=error` and on `AUDIT WRITE FAILED`.
* **Errors:** add Sentry (or equivalent) — `@sentry/node` on the server and `@sentry/react` in
  `__root.tsx`'s error boundary (existing `reportLovableError` hook is the integration point). Not installed
  here because it requires a DSN.
* **Email delivery:** AMCMS → Security & Audit Logs → Email delivery shows sent / failed / skipped.
* **Uptime:** monitor `https://YOUR_DOMAIN/api/health` (checks the database) and `/`. DigitalOcean
  Monitoring can alert on Droplet CPU, memory and disk.

## Data retention runbook (quarterly)

Targets are configured in AMCMS → System Settings → Data retention. Retention deletion is a **reviewed manual
process** (legal holds and business-record obligations vary):

```sql
-- Review before deleting; run in: docker compose exec db psql -U amcms -d amcms
select count(*) from contact_submissions where created_at < now() - interval '730 days';
delete from contact_submissions where created_at < now() - interval '730 days';
delete from driver_registrations where status = 'rejected' and decided_at < now() - interval '365 days';
delete from login_audit_events where created_at < now() - interval '365 days';
delete from rate_limits where reset_at < now() - interval '1 day';
```

`audit_logs` is append-only by design; archiving it requires a DBA to temporarily disable the trigger in a
reviewed change.

## Backup & restore

See docs/04-DATABASE.md and docs/12 §7. Nightly dumps include the database; uploaded files are
archived alongside (`backups/storage-*.tar.gz`). Copy both off the server.

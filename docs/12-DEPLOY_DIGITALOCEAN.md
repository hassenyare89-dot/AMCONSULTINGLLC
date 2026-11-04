# 12 · Deploying on a DigitalOcean Droplet (Docker)

The site and AMCMS are fully self-hosted: **PostgreSQL 16**, the **Node.js app**, **Caddy** (automatic
HTTPS) and a small **scheduler** (nightly backups + daily maintenance) run with Docker Compose on one
Linux server. There is no Supabase or other hosted backend.

```
 Internet ──443/80──▶ caddy ──▶ app:3000 (Node) ──▶ db:5432 (PostgreSQL, private network only)
                                    │                      ▲
                                    └─ /data/storage        └── scheduler (pg_dump 03:15 UTC, maintenance 06:00 UTC)
```

## 1. Create the Droplet

* **Image:** Ubuntu 24.04 LTS. **Size:** 2 GB RAM / 1 vCPU minimum (4 GB recommended; the image build
  uses ~1.5 GB RAM). Enable **backups** (weekly Droplet snapshots) as an extra safety net.
* **Authentication:** SSH key (not a password).
* Optional: attach a **Volume** if you expect many uploaded documents.

Point DNS at it: an **A record** for `amconsultingllc.net` and one for `www` → the Droplet's IP. HTTPS
certificates are issued automatically once DNS resolves.

## 2. Prepare the server (once)

```bash
ssh root@YOUR_DROPLET_IP
```

```bash
apt-get update && apt-get -y upgrade && apt-get install -y ca-certificates curl git ufw unattended-upgrades
```

```bash
curl -fsSL https://get.docker.com | sh
```

Firewall — only SSH and web traffic in:

```bash
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw allow 443/udp && ufw --force enable
```

> Docker publishes only ports 80/443 (Caddy). PostgreSQL and the app are on an internal Docker network
> and are **not** reachable from the internet. You can also add a DigitalOcean Cloud Firewall with
> the same rules.

Create a deploy user (recommended) and log in as it:

```bash
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy && rsync -a ~/.ssh /home/deploy/ && chown -R deploy:deploy /home/deploy/.ssh
```

## 3. Get the code and configure

```bash
git clone https://github.com/hassenyare89-dot/AMCONSULTINGLLC.git amcms && cd amcms
```

```bash
cp .env.example .env && chmod 600 .env
```

Generate a random value for each secret (run once per secret, paste into `.env`):

```bash
openssl rand -base64 48 | tr -d '\n/+=' ; echo
```

Fill in `.env`: `DOMAIN`, `ACME_EMAIL`, `PUBLIC_SITE_URL`, `POSTGRES_SUPERUSER_PASSWORD`,
`APP_DB_PASSWORD`, `AUTH_SECRET`, `IP_HASH_SALT`, `CRON_SECRET`, and optionally `RESEND_API_KEY`
(email) and the Turnstile keys. **Back up `.env` somewhere safe** (password manager): losing
`AUTH_SECRET` forces every staff member to re-enrol two-step verification.

## 4. Start

```bash
docker compose up -d --build
```

The first build takes a few minutes. On every start the app container applies any pending database
migrations (locked, so it is safe to restart at any time) and then starts serving.

```bash
docker compose ps
```

```bash
docker compose logs -f app
```

Open `https://YOUR_DOMAIN/` — the public site should load with a valid certificate.

## 5. Create the first administrator

```bash
docker compose exec app node scripts/create-admin.mjs owner@amconsultingllc.net "Owner Name"
```

It prints a **one-time link** (valid 24 h). Open it, choose a password (12+ characters), then scan the
QR code with an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…).
Invite everyone else from **AMCMS → Users** (they get an email if `RESEND_API_KEY` is set; otherwise
the admin is shown the invite link to pass on securely).

Lost authenticator and no other super admin available:

```bash
docker compose exec app node scripts/create-admin.mjs --reset-mfa owner@amconsultingllc.net
```

## 6. Updating to a new version

```bash
cd ~/amcms && ./deploy/backup.sh && git pull && docker compose up -d --build
```

Migrations run automatically. To roll back code: `git checkout <previous-commit>` and
`docker compose up -d --build`; if a migration must be undone, restore the backup taken just before
(below). Migrations are additive and recorded in `public.schema_migrations`
(`docker compose exec app node scripts/migrate.mjs --status`).

## 7. Backups and restore

* **Automatic:** the `scheduler` container writes `backups/amcms-<time>.dump` (database) and
  `backups/storage-<date>.tar.gz` (uploaded files) every night and keeps `BACKUP_KEEP_DAYS` days.
* **On demand:** `./deploy/backup.sh`
* **Copy them off the server.** A backup on the same disk does not survive losing the Droplet. For
  example, sync `backups/` to DigitalOcean Spaces with `rclone` or `s3cmd` from a daily cron job.
  Uploaded documents may contain personal data: keep off-site copies encrypted and access-restricted.
* **Restore** (destructive — replaces the live database; asks for confirmation):

```bash
./deploy/restore.sh backups/amcms-20261104T031500Z.dump backups/storage-20261104.tar.gz
```

Test a restore on a scratch Droplet at least quarterly.

## 8. Operations cheat-sheet

| Task | Command |
|---|---|
| Status / health | `docker compose ps` · `curl -s https://YOUR_DOMAIN/api/health` |
| App logs | `docker compose logs -f app` |
| Scheduler (backups/maintenance) logs | `docker compose logs -f scheduler` |
| Database shell | `docker compose exec db psql -U amcms -d amcms` |
| Restart app | `docker compose restart app` |
| Run maintenance now | `docker compose exec scheduler sh -c 'wget -qO- --header="Authorization: Bearer $CRON_SECRET" --post-data="" http://app:3000/api/cron/maintenance'` |
| Disk usage | `docker system df` · `du -sh backups` |
| OS security updates | handled by `unattended-upgrades`; reboot when `/var/run/reboot-required` exists |

## 9. Using DigitalOcean Managed PostgreSQL instead (optional)

Run only `app`, `caddy` and `scheduler`, and point the app at the managed cluster:

1. In the managed cluster, create database `amcms` and user `amcms`, then (as `doadmin`) create the
   three NOLOGIN roles the migrations reference:
   `CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;`
   and make `amcms` the owner: `ALTER DATABASE amcms OWNER TO amcms;`
2. In `.env` set `DATABASE_URL=postgresql://amcms:PASSWORD@HOST:25060/amcms` and `PGSSLMODE=require`,
   and change the `app` service's `DATABASE_URL` in `docker-compose.yml` to `${DATABASE_URL}`.
3. Add the Droplet to the cluster's **trusted sources**. Use the cluster's built-in backups/PITR.

## 10. Security notes

* Only Caddy is exposed; the database has no published port and the backend network is `internal`.
* The app connects as `amcms`, which owns the schema but is **not** a PostgreSQL superuser.
* Containers run as non-root (`amcms` user in the app image).
* Staff sessions are HttpOnly, `Secure`, `SameSite=Lax` cookies; only a SHA-256 of each session token
  is stored. MFA secrets are encrypted (AES-256-GCM) with a key derived from `AUTH_SECRET`.
* Private documents are served only through 60-second HMAC-signed links issued after permission
  checks; public media is served from `/files/media/`.
* `/api/cron/*` is blocked at Caddy; only the internal scheduler can call it.
* See docs/06-SECURITY.md for the full control list and go-live checklist.

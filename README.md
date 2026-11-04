# AM Consulting & Hauling — Website & AMCMS

Public website for **amconsultingllc.net** plus the **AM Consulting Management System (AMCMS)**, a private
operations platform at `/admin` for drivers, fleet, dispatch, projects, CRM, quotes, appointments,
documents, website content, reporting, users, compliance and audit.

| | |
|---|---|
| Framework | TanStack Start (React 19, TanStack Router, SSR) · Vite · Tailwind CSS 4 · shadcn/Radix |
| 3D / motion | Three.js · React Three Fiber · Drei · Motion (framer-motion) |
| Data | PostgreSQL 16 (plain Postgres, RLS, migrations in `db/`) via `pg` |
| Auth | Built in: scrypt passwords, server-side sessions (HttpOnly cookie), TOTP MFA, invites/resets |
| Files | Local disk / Docker volume (public media + HMAC-signed private documents) |
| Hosting | Self-hosted: Docker Compose (Node server + Postgres + Caddy HTTPS) — e.g. a DigitalOcean Droplet |
| Email | Resend (optional; everything is persisted even without it) |

## Deploy (production)

On a Linux server with Docker — full walkthrough in
[docs/12-DEPLOY_DIGITALOCEAN.md](docs/12-DEPLOY_DIGITALOCEAN.md):

```bash
cp .env.example .env        # set domain + random secrets (never commit .env)
docker compose up -d --build
docker compose exec app node scripts/create-admin.mjs you@example.com "Your Name"
```

## Local development

Needs Bun and a PostgreSQL 14+ server you can reach.

```bash
bun install
createdb amcms   # or any empty database
export DATABASE_URL=postgresql://localhost/amcms
node scripts/migrate.mjs
node scripts/create-admin.mjs you@example.com "Your Name"   # prints a one-time link
bun run dev
```

Migrations (`db/migrations/`) are applied by `scripts/migrate.mjs` (also run automatically by the Docker
container on start). Uploads go to `./.storage` unless `STORAGE_DIR` is set.

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Development server |
| `bun run build` | Production build (standalone Node server in `.output/`, run with `node .output/server/index.mjs`) |
| `bun run typecheck` | Strict TypeScript |
| `bun run lint` | ESLint (+ Prettier rules) |
| `bun run test` | Vitest unit + authorization tests |
| `bun run test:db` | Applies all migrations to a throwaway local Postgres and runs RLS/constraint tests |
| `./scripts/test-integration.sh` | After a build: runs the real server against a throwaway Postgres and tests forms, sign-in, MFA, uploads, sign-out (API + browser) |
| `bun run test:e2e` | Playwright end-to-end + axe accessibility tests |

## Documentation

| Doc | Contents |
|---|---|
| [01 Audit report](docs/01-AUDIT_REPORT.md) | What the original ZIP contained, findings, decisions |
| [02 Architecture](docs/02-ARCHITECTURE.md) | Structure, request flow, security model |
| [03 Implementation checklist](docs/03-IMPLEMENTATION_CHECKLIST.md) | Requirement-by-requirement status |
| [04 Database](docs/04-DATABASE.md) | Schema, RLS, migrations, backups |
| [05 Hero video spec](docs/05-HERO_VIDEO_SPEC.md) | Original video status + replacement spec |
| [06 Security](docs/06-SECURITY.md) | Controls, OWASP ASVS mapping, hardening checklist |
| [07 Operations](docs/07-OPERATIONS.md) | Deployment, DNS/SSL, monitoring, backup/restore, rollback, cron |
| [08 Compliance matrix](docs/08-COMPLIANCE_MATRIX.md) | U.S. privacy, accessibility, communications, FMCSA — open legal items |
| [09 Admin guide](docs/09-ADMIN_GUIDE.md) | Onboarding and day-to-day use of AMCMS |
| [10 Test report](docs/10-TEST_REPORT.md) | What was run and the actual results |
| [11 Handover](docs/11-HANDOVER.md) | Final implementation report, blockers and next actions |
| [12 Deploy on DigitalOcean](docs/12-DEPLOY_DIGITALOCEAN.md) | Docker Compose deployment, first admin, updates, backups/restore |

> **Lovable:** this project syncs with Lovable (see `AGENTS.md`). Don't rewrite pushed history. The app now
> needs a Node server and PostgreSQL, so Lovable's built-in preview/hosting (Cloudflare + Supabase) no longer
> runs the back end — deploy with Docker instead.

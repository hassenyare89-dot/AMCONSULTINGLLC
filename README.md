# AM Consulting LLC — Website & AMCMS

Public website for **amconsultingllc.net** plus the **AM Consulting Management System (AMCMS)**, a private
operations platform at `/admin` for drivers, fleet, dispatch, projects, CRM, quotes, appointments,
documents, website content, reporting, users, compliance and audit.

| | |
|---|---|
| Framework | TanStack Start (React 19, TanStack Router, SSR) · Vite · Tailwind CSS 4 · shadcn/Radix |
| 3D / motion | Three.js · React Three Fiber · Drei · Motion (framer-motion) |
| Data / auth | Supabase (Postgres + RLS, Auth with TOTP MFA, Storage) |
| Hosting | Cloudflare Workers via Nitro (Lovable-managed) |
| Email | Resend (optional; everything is persisted even without it) |

## Quick start

```bash
bun install
cp .env.example .env   # fill in Supabase values (never commit .env)
bun run dev
```

Apply database migrations (`supabase/migrations/`) with the Supabase CLI or Lovable Cloud, then bootstrap
the first administrator — see [docs/09-ADMIN_GUIDE.md](docs/09-ADMIN_GUIDE.md).

## Scripts

| Command | What it does |
|---|---|
| `bun run dev` | Development server |
| `bun run build` | Production build (Cloudflare Workers bundle in `.output/`) |
| `bun run typecheck` | Strict TypeScript |
| `bun run lint` | ESLint (+ Prettier rules) |
| `bun run test` | Vitest unit + authorization tests |
| `bun run test:db` | Applies all migrations to a throwaway local Postgres and runs RLS/constraint tests |
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

> **Lovable:** this project syncs with Lovable (see `AGENTS.md`). Don't rewrite pushed history.

# Database

Plain **PostgreSQL 16** (14+ works), self-hosted in Docker. No Supabase.

* `db/platform/roles.sql` — one-time cluster setup run by a superuser (Docker does it on first start):
  the `amcms` application role (owns the database, **not** a superuser), the NOLOGIN roles `anon` /
  `authenticated` / `service_role` that the original migrations' GRANT/REVOKE statements reference, and
  the database.
* `db/platform/000_platform.sql` — idempotent, applied on every migrate: the `auth` schema (`users`,
  `sessions`, `one_time_tokens`, `auth.uid()`), a `storage.buckets` stand-in (files live on disk),
  `public.schema_migrations`.
* `db/migrations/*.sql` — applied in filename order by `scripts/migrate.mjs`, each in its own
  transaction, recorded in `public.schema_migrations`, under an advisory lock. The 7 migrations are the
  original files, **unchanged**.

| Migration | Purpose |
|---|---|
| `20260630…`–`20260705…` (5 files) | **Original** — `app_role`, `user_roles`, `has_role`, `claim_first_admin`, `driver_registrations`, deny policies |
| `20261102000100_rbac_role_values.sql` | Adds 6 roles to `app_role` (separate file: enum values must commit before use) |
| `20261102000200_amcms_schema.sql` | All AMCMS tables, constraints, indexes, triggers, RLS, storage bucket rows, rate limiter |

Both new migrations are **additive and idempotent** (verified by applying the AMCMS migration twice in
`scripts/test-db.sh`). Existing rows are preserved: `driver_registrations` gains columns, `dot_number`
becomes nullable, and the status check is `NOT VALID` (enforced for new writes only).

## Tables by module

| Module | Tables |
|---|---|
| Identity | `auth.users`, `auth.sessions`, `auth.one_time_tokens`, `user_roles` (existing), `staff_profiles`, `login_audit_events` |
| Drivers | `driver_registrations` (existing = applications), `driver_status_history`, `driver_notes`, `driver_status_tokens`, `drivers` |
| Fleet | `trucks`, `truck_assignments` (truck documents live in `documents`) |
| CRM | `customers`, `customer_contacts`, `leads`, `lead_activities`, `contact_submissions`, `follow_up_tasks` |
| Operations | `projects`, `project_resources`, `dispatch_jobs`, `dispatch_status_history`, `dispatch_communications`, `load_records` |
| Quotes | `quote_requests`, `pricing_rules`, `estimates`, `estimate_items`, `quote_status_history` |
| Scheduling | `appointments` |
| CMS | `content_sections`, `content_revisions`, `publishing_events`, `media_assets`, `faq_entries` |
| Documents | `documents` (versioned, private bucket) |
| Notifications | `notifications`, `notification_reads`, `notification_delivery_events` |
| Compliance | `privacy_requests`, `consent_records` |
| System | `audit_logs` (append-only), `system_settings`, `rate_limits` |

Mapping to the brief's suggested names: `driver_applications` → `driver_registrations` (kept to avoid
breaking existing code/data); `truck_documents` → `documents` with `entity_type='truck'`;
`dispatch_assignments` → driver/truck columns on `dispatch_jobs` + `truck_assignments`;
`scheduling_events` → `appointments`; `website_pages` → `content_sections` (`page` column + `legal.*`
sections); `roles/permissions` → `app_role` enum + code-defined matrix (`lib/shared/permissions.ts`,
reviewable in Git and unit-tested).

## Integrity controls

* Foreign keys with explicit `ON DELETE` behaviour; check constraints for every status/enum, VIN format,
  state codes, year range, positive quantities, date ordering.
* **Exclusion constraints** (btree_gist) prevent double-booking a driver or truck on overlapping
  non-cancelled dispatch jobs, and overlapping active appointments — a backstop for the app-level check.
* `audit_logs` rejects `UPDATE`/`DELETE` via trigger.
* `updated_at` triggers; human-readable numbers from sequences (`D-000001`, `P-00001`, `Q-000001`, `QR-…`, `PR-…`).

## Row Level Security

RLS is **enabled on every table**, there are **no policies for `anon`/`authenticated`**, and table
privileges for those roles are **revoked** (the only exception is the original "read own roles" policy
on `user_roles`). All access goes through server code, connected as the schema owner (`amcms`), after
the authorization checks in `server/rpc` and `server/services`. RLS stays enabled as defence in depth
for any other role that is ever granted access. Files: `media` (public website assets, `/files/media/…`)
and `documents` (private; staff receive 60-second HMAC-signed links) live under `STORAGE_DIR`.

Verified by `db/tests/10_authorization.sql` (`bun run test:db`, also in CI) — run against a database
created exactly like production (non-superuser owner).

## Query layer

`server/pg/query.ts` is a small, fully parameterised query builder with the same chainable API the
services already used (`db().from("leads").select(...).eq(...).order(...)`), so the business logic did
not change. Identifiers are validated against `^[a-z_][a-z0-9_]*$`; values are always bound parameters;
unfiltered UPDATE/DELETE is refused. Unit-tested in `tests/unit/selfhosted.test.ts`.

## Backups & restore

* The Docker `scheduler` service runs `pg_dump -Fc` nightly (03:15 UTC) into `./backups`, plus a tarball
  of uploaded files, keeping `BACKUP_KEEP_DAYS` days. `deploy/backup.sh` does the same on demand.
* **Copy backups off the server** (DigitalOcean Spaces, another machine); keep them encrypted —
  documents can contain personal data.
* Restore: `deploy/restore.sh <dump> [files.tar.gz]` (destructive, asks for confirmation).
* Restore drill (quarterly): restore the latest backup on a scratch server and sign in to AMCMS.
* Managed alternative: DigitalOcean Managed PostgreSQL with daily backups + point-in-time recovery
  (docs/12 §9).

## Row types

The query builder is untyped (`any` rows); inputs are validated with Zod. Generating row types from the
schema and typing `db()` is tracked tech debt.

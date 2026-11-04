# Database

PostgreSQL on Supabase. Migrations in `supabase/migrations/` (apply in filename order).

| Migration | Purpose |
|---|---|
| `20260630…`–`20260705…` (5 files) | **Original** — `app_role`, `user_roles`, `has_role`, `claim_first_admin`, `driver_registrations`, deny policies |
| `20261102000100_rbac_role_values.sql` | Adds 6 roles to `app_role` (separate file: enum values must commit before use) |
| `20261102000200_amcms_schema.sql` | All AMCMS tables, constraints, indexes, triggers, RLS, storage buckets, rate limiter |

Both new migrations are **additive and idempotent** (verified by applying the AMCMS migration twice in
`scripts/test-db.sh`). Existing rows are preserved: `driver_registrations` gains columns, `dot_number`
becomes nullable, and the status check is `NOT VALID` (enforced for new writes only).

## Tables by module

| Module | Tables |
|---|---|
| Identity | `user_roles` (existing), `staff_profiles`, `login_audit_events` |
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
on `user_roles`). All access goes through server code using the service role after authorization.
Storage: `media` bucket is public-read (website assets), `documents` bucket is private with no policies
(service role only; staff receive 60-second signed URLs).

Verified by `supabase/tests/10_authorization.sql` (`bun run test:db`).

## Backups & restore

* Enable **daily backups** and, on Pro plans or higher, **Point-in-Time Recovery** in Supabase → Database → Backups.
* Before applying migrations to production: take an on-demand backup (`supabase db dump -f pre-amcms.sql`
  or dashboard backup) and record its timestamp.
* Restore drill (quarterly): restore the latest backup into a staging project, run `bun run test:db`
  style checks and smoke-test AMCMS sign-in. Record the result in the operations log.
* Storage objects are not covered by DB backups — schedule a periodic copy of the `documents` bucket
  (e.g. `supabase storage cp -r ss:///documents ./backup/`) to encrypted offline storage.

## Regenerating types

`src/integrations/supabase/types.ts` is Lovable-generated and predates AMCMS. Regenerate after migrating
(`supabase gen types typescript --project-id <id>`) and tighten `server/db.server.ts` to the typed client
(tracked tech debt).

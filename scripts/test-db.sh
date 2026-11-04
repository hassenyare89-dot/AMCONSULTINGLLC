#!/usr/bin/env bash
# Applies every migration in supabase/migrations to a throwaway local Postgres and runs
# supabase/tests/*.sql. Requires a local PostgreSQL server binary (pg_ctl/initdb).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PGBIN="${PGBIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PGPORT_TEST:-55432}"
RUN=""
if [ "$(id -u)" = "0" ]; then chown -R postgres "$WORK"; RUN="runuser -u postgres --"; fi
cleanup() { $RUN "$PGBIN/pg_ctl" -D "$WORK/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT
$RUN "$PGBIN/initdb" -D "$WORK/data" -A trust -U postgres >/dev/null
$RUN "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK" -l "$WORK/log" start -w >/dev/null
PGOPTIONS="-c client_min_messages=warning" ; export PGOPTIONS
PSQL=(psql -v ON_ERROR_STOP=1 -q -h "$WORK" -p "$PORT" -U postgres -d postgres)
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ applying $(basename "$f")"
  "${PSQL[@]}" -1 -f "$f"
done
# Re-apply the AMCMS migration to prove it is idempotent.
echo "→ re-applying AMCMS schema (idempotency check)"
"${PSQL[@]}" -1 -f "$ROOT/supabase/migrations/20261102000200_amcms_schema.sql"
for t in "$ROOT"/supabase/tests/[1-9]*.sql; do
  echo "→ running $(basename "$t")"
  "${PSQL[@]}" -f "$t"
done

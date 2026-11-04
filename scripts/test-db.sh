#!/usr/bin/env bash
# Creates a throwaway local PostgreSQL cluster, applies the schema with scripts/migrate.mjs
# (exactly as production does), checks idempotency, and runs db/tests/*.sql.
# Requires local PostgreSQL server binaries (initdb/pg_ctl).
#
#   ./scripts/test-db.sh                 run the database tests
#   ./scripts/test-db.sh -- <command>    instead, run <command> with DATABASE_URL pointing at the
#                                        migrated database (used for integration tests)
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
$RUN "$PGBIN/pg_ctl" -D "$WORK/data" -o "-p $PORT -k $WORK -c listen_addresses=''" -l "$WORK/log" start -w >/dev/null
export PGOPTIONS="-c client_min_messages=warning"
PSQL=(psql -v ON_ERROR_STOP=1 -q -h "$WORK" -p "$PORT" -U postgres)
# Same setup as production: the app connects as a non-superuser role that owns the database.
"${PSQL[@]}" -d postgres -v app_user=amcms -v app_password=test-password -v app_db=amcms -f "$ROOT/db/platform/roles.sql" >/dev/null
export DATABASE_URL="postgresql://amcms:test-password@localhost/amcms?host=$WORK&port=$PORT"

echo "→ migrate (fresh database)"
node "$ROOT/scripts/migrate.mjs"
echo "→ migrate again (must be a no-op)"
node "$ROOT/scripts/migrate.mjs"
echo "→ re-applying AMCMS schema directly (idempotency check)"
"${PSQL[@]}" -U amcms -d amcms -1 -f "$ROOT/db/migrations/20261102000200_amcms_schema.sql"

if [ "${1:-}" = "--" ]; then
  shift
  "$@"
  exit $?
fi
for t in "$ROOT"/db/tests/[1-9]*.sql; do
  echo "→ running $(basename "$t")"
  "${PSQL[@]}" -d amcms -f "$t"
done

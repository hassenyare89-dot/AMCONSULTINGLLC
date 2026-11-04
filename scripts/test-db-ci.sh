#!/usr/bin/env bash
# CI variant of test-db.sh: uses an already-running Postgres (PGHOST/PGUSER/PGPASSWORD) and a
# fresh database. Applies the schema with scripts/migrate.mjs exactly as production does.
#   ./scripts/test-db-ci.sh              run db/tests/*.sql
#   ./scripts/test-db-ci.sh -- <cmd>     run <cmd> with DATABASE_URL pointing at the database
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="amcms_test_$$"
export PGOPTIONS="-c client_min_messages=warning"
# Same setup as production: the app connects as a non-superuser role that owns the database.
psql -q -d postgres -v app_user=amcms -v app_password=ci-password -v app_db="$DB" -f "$ROOT/db/platform/roles.sql" >/dev/null
trap 'psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB WITH (FORCE)" >/dev/null' EXIT
export DATABASE_URL="postgresql://amcms:ci-password@${PGHOST:-localhost}:${PGPORT:-5432}/$DB"
PSQL=(psql -v ON_ERROR_STOP=1 -q -d "$DB")
node "$ROOT/scripts/migrate.mjs"
node "$ROOT/scripts/migrate.mjs"   # second run must be a no-op
PGUSER=amcms PGPASSWORD=ci-password "${PSQL[@]}" -1 -f "$ROOT/db/migrations/20261102000200_amcms_schema.sql"
if [ "${1:-}" = "--" ]; then
  shift
  "$@"
  exit $?
fi
for t in "$ROOT"/db/tests/[1-9]*.sql; do echo "→ $(basename "$t")"; "${PSQL[@]}" -f "$t"; done

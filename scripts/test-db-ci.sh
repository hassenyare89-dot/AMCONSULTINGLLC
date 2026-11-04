#!/usr/bin/env bash
# CI variant of test-db.sh: uses an already-running Postgres (PGHOST/PGUSER/PGPASSWORD) and a fresh database.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DB="amcms_test_$$"
export PGOPTIONS="-c client_min_messages=warning"
psql -v ON_ERROR_STOP=1 -q -d postgres -c "CREATE DATABASE $DB"
trap 'psql -q -d postgres -c "DROP DATABASE IF EXISTS $DB" >/dev/null' EXIT
PSQL=(psql -v ON_ERROR_STOP=1 -q -d "$DB")
"${PSQL[@]}" -f "$ROOT/supabase/tests/00_supabase_stubs.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do echo "→ $(basename "$f")"; "${PSQL[@]}" -1 -f "$f"; done
"${PSQL[@]}" -1 -f "$ROOT/supabase/migrations/20261102000200_amcms_schema.sql"
for t in "$ROOT"/supabase/tests/[1-9]*.sql; do echo "→ $(basename "$t")"; "${PSQL[@]}" -f "$t"; done

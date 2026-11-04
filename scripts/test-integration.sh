#!/usr/bin/env bash
# Builds nothing: starts the already-built Node server (.output/) against a throwaway migrated
# database and runs tests/integration/selfhosted-smoke.mjs against it.
#   bun run build && ./scripts/test-integration.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$ROOT/.output/server/index.mjs" ] || { echo "Run 'bun run build' first"; exit 1; }
# In CI (PGHOST set) use the provided Postgres service; locally spin up a throwaway cluster.
DBRUNNER="$ROOT/scripts/test-db.sh"
[ -n "${PGHOST:-}" ] && DBRUNNER="$ROOT/scripts/test-db-ci.sh"
exec "$DBRUNNER" -- bash -c '
  set -euo pipefail
  STORE="$(mktemp -d)"
  PORT="${SMOKE_PORT:-3917}"
  export STORAGE_DIR="$STORE" PORT HOST=127.0.0.1 NODE_ENV=production COOKIE_SECURE=false \
    AUTH_SECRET="integration-test-secret-integration-test-secret" PUBLIC_SITE_URL="http://127.0.0.1:$PORT"
  node "'"$ROOT"'/.output/server/index.mjs" > "$STORE/server.log" 2>&1 &
  PID=$!
  trap "kill $PID 2>/dev/null; rm -rf $STORE" EXIT
  for i in $(seq 1 50); do curl -sf "http://127.0.0.1:$PORT/" >/dev/null && break; sleep 0.2; done
  cd "'"$ROOT"'"
  BASE_URL="http://127.0.0.1:$PORT" node tests/integration/selfhosted-smoke.mjs || { echo "--- server log"; tail -40 "$STORE/server.log"; exit 1; }
'

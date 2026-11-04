#!/bin/sh
# Container entrypoint: refuse to start with unsafe configuration, apply pending database
# migrations (advisory-locked, safe with several replicas), then start the server.
set -eu
if [ -z "${DATABASE_URL:-}" ]; then echo "FATAL: DATABASE_URL is not set" >&2; exit 1; fi
AUTH_SECRET="${AUTH_SECRET:-}"
if [ "${#AUTH_SECRET}" -lt 32 ]; then
  echo "FATAL: AUTH_SECRET must be set to a random value of at least 32 characters" >&2; exit 1
fi
if [ "${SKIP_MIGRATIONS:-false}" != "true" ]; then
  node scripts/migrate.mjs
fi
exec "$@"

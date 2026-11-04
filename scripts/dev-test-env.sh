#!/usr/bin/env bash
# Starts the dev server for UI/E2E tests with no database behind it (connection refused), so
# public pages, validation and security headers are tested in isolation.
export DATABASE_URL=postgresql://amcms@127.0.0.1:59999/amcms IP_HASH_SALT=test-salt
export AUTH_SECRET=e2e-test-secret-e2e-test-secret-e2e-test
exec npx vite dev --port "${PORT:-4173}" --strictPort --host 127.0.0.1

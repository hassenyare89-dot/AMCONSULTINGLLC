#!/usr/bin/env bash
# Starts the dev server with placeholder Supabase settings (no real backend) for UI/E2E tests.
export SUPABASE_URL=http://127.0.0.1:59999 VITE_SUPABASE_URL=http://127.0.0.1:59999
export SUPABASE_PUBLISHABLE_KEY=test-publishable-key VITE_SUPABASE_PUBLISHABLE_KEY=test-publishable-key
export SUPABASE_SERVICE_ROLE_KEY=test-service-role-key IP_HASH_SALT=test-salt
exec npx vite dev --port "${PORT:-4173}" --strictPort --host 127.0.0.1

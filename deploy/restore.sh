#!/usr/bin/env bash
# Restores a database dump (and optionally the uploaded files) made by backup.sh or the scheduler.
#   ./deploy/restore.sh backups/amcms-XXXX.dump [backups/storage-XXXX.tar.gz]
# DESTRUCTIVE: replaces the current database contents. The app is stopped during the restore.
set -euo pipefail
DC_ARGS="${DC_ARGS:-}"  # e.g. "--env-file /path/.env" (optional)
cd "$(dirname "$0")/.."
DUMP="${1:?usage: restore.sh <dump> [storage.tar.gz]}"
FILES="${2:-}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP"; exit 1; }
read -r -p "This REPLACES the live database with $DUMP. Type 'restore' to continue: " ok
[ "$ok" = "restore" ] || { echo "Aborted."; exit 1; }
docker compose $DC_ARGS stop app scheduler
docker compose $DC_ARGS exec -T db psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'amcms' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS amcms" -c "CREATE DATABASE amcms OWNER amcms" \
  -c "REVOKE ALL ON DATABASE amcms FROM PUBLIC" >/dev/null
docker compose $DC_ARGS exec -T db pg_restore -U postgres -d amcms --no-owner --role=amcms --exit-on-error < "$DUMP"
if [ -n "$FILES" ]; then
  docker compose $DC_ARGS run --rm --no-deps -T --entrypoint sh app -c 'rm -rf /data/storage/* && tar -xzf - -C /data' < "$FILES"
fi
docker compose $DC_ARGS start app scheduler
echo "Restore complete."

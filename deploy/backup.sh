#!/usr/bin/env bash
# On-demand backup from the server (run in the project directory):
#   ./deploy/backup.sh            -> backups/amcms-<timestamp>.dump + backups/storage-<timestamp>.tar.gz
# Copy backups OFF the server (e.g. DigitalOcean Spaces, another machine) — a backup on the
# same disk does not survive losing the Droplet.
set -euo pipefail
DC_ARGS="${DC_ARGS:-}"  # e.g. "--env-file /path/.env" (optional)
cd "$(dirname "$0")/.."
mkdir -p backups
TS="$(date -u +%Y%m%dT%H%M%SZ)"
docker compose $DC_ARGS exec -T db pg_dump -U postgres -d amcms -Fc > "backups/amcms-$TS.dump"
docker compose $DC_ARGS exec -T app tar -czf - -C /data storage > "backups/storage-$TS.tar.gz"
echo "Wrote backups/amcms-$TS.dump and backups/storage-$TS.tar.gz"

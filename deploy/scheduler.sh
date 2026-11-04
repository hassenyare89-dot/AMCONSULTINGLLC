#!/bin/sh
# Minimal scheduler (no cron daemon needed):
#   * every day at ~03:15 UTC: pg_dump + uploaded files to /backups, prune old backups
#   * every day at ~06:00 UTC: POST /api/cron/maintenance (publishing, reminders, cleanup)
set -u
last_backup="" last_maint=""
echo "scheduler started"
sleep 120  # let the app apply migrations before the first backup
while true; do
  day=$(date -u +%F); hm=$(date -u +%H%M)
  if [ "$hm" -ge 0315 ] && [ "$last_backup" != "$day" ]; then
    f="/backups/amcms-$(date -u +%Y%m%dT%H%M%SZ).dump"
    if pg_dump -Fc -f "$f.part" && mv "$f.part" "$f"; then
      echo "backup ok: $f"; last_backup="$day"
      tar -czf "/backups/storage-$(date -u +%Y%m%d).tar.gz" -C /data storage && echo "files backup ok"
      find /backups \( -name 'amcms-*.dump' -o -name 'storage-*.tar.gz' \) -mtime +"${BACKUP_KEEP_DAYS:-14}" -delete
    else
      echo "backup FAILED" >&2; rm -f "$f.part"
    fi
  fi
  if [ "$hm" -ge 0600 ] && [ "$last_maint" != "$day" ]; then
    if wget -q -O /dev/null --header="Authorization: Bearer $CRON_SECRET" --post-data="" http://app:3000/api/cron/maintenance; then
      echo "maintenance ok"; last_maint="$day"
    else
      echo "maintenance FAILED (will retry)" >&2
    fi
  fi
  sleep 300
done

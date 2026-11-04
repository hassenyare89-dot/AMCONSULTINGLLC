#!/bin/sh
# Runs once, when the Postgres data volume is first created.
set -eu
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres \
  -v app_user="$APP_DB_USER" -v app_password="$APP_DB_PASSWORD" -v app_db="$APP_DB_NAME" \
  -f /amcms/roles.sql

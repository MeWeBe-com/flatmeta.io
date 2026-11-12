#!/usr/bin/env bash
# Database backup for deploys: one pg_dump (custom format) into $DEPLOY_BACKUP_DIR, then drops backups older than
# DEPLOY_BACKUP_DAYS (default 7). Called by deploy.sh before migrations and by auto-deploy.sh for the daily backup.
#   bash deploy-backup.sh <label>        # needs DATABASE_URL and APP_ENV in the environment (deploy.sh loads .env)
#   bash deploy-backup.sh --if-older 24 <label>   # only when the newest backup is older than 24 hours
# Prints the backup's path on the last line. Exit 1 if pg_dump fails (the partial file is removed).
set -euo pipefail
DIR="${DEPLOY_BACKUP_DIR:-$HOME/backups/flatmeta-${APP_ENV:-production}}"
mkdir -p "$DIR"
chmod 700 "$DIR"
if [ "${1:-}" = "--if-older" ]; then
  hours="$2"
  shift 2
  if [ -n "$(find "$DIR" -maxdepth 1 -name '*.dump' -mmin -"$(( hours * 60 ))" -print -quit)" ]; then exit 0; fi
fi
label="$(printf '%s' "${1:-manual}" | tr -c 'A-Za-z0-9._-' '-')"
[ -n "${DATABASE_URL:-}" ] || { echo "✗ DATABASE_URL is not set" >&2; exit 1; }
command -v pg_dump >/dev/null || { echo "✗ pg_dump not found" >&2; exit 1; }
FILE="$DIR/$(date -u +%Y%m%dT%H%M%SZ)-$label.dump"
umask 077
if ! pg_dump --format=custom --no-owner --file "$FILE" "$DATABASE_URL"; then
  rm -f "$FILE"
  exit 1
fi
find "$DIR" -maxdepth 1 -name '*.dump' -mtime +"${DEPLOY_BACKUP_DAYS:-7}" -delete || true
echo "$FILE"

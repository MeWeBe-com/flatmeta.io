#!/usr/bin/env bash
# Nightly Postgres backup with 14-day retention. Cron (as the deploy user):
#   15 2 * * * /srv/flatmeta/api/scripts/backup.sh >> /var/log/flatmeta-backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
DATABASE_URL="$(sed -nE 's/^DATABASE_URL="?([^" ]+)"?.*/\1/p' .env | tail -1)"
DEST="${BACKUP_DIR:-/var/backups/flatmeta}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DEST"
FILE="$DEST/flatmeta-$(date -u +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --format=plain "$DATABASE_URL" | gzip -9 > "$FILE"
find "$DEST" -name 'flatmeta-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup written: $FILE ($(du -h "$FILE" | cut -f1))"

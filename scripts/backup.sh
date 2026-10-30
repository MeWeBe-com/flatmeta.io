#!/usr/bin/env bash
# Nightly Postgres backup with 14-day retention. Cron (as the app user):
#   15 2 * * * cd ~/flatmeta && bash scripts/backup.sh >> ~/backup.log 2>&1
# Backups go to $BACKUP_DIR (default ~/backups/flatmeta). Copy them off the server as well.
set -euo pipefail
cd "$(dirname "$0")/.."
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" >/dev/null 2>&1
eval "$(node scripts/print-env.mjs)"
DEST="${BACKUP_DIR:-$HOME/backups/flatmeta}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
mkdir -p "$DEST"
FILE="$DEST/flatmeta-$(date -u +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --format=plain "$DATABASE_URL" | gzip -9 > "$FILE"
find "$DEST" -name 'flatmeta-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
echo "$(date -u +%FT%TZ) backup written: $FILE ($(du -h "$FILE" | cut -f1))"

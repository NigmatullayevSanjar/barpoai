#!/bin/sh
# Baza va private fayllar zaxirasi. Cron: 0 3 * * * /opt/barpoai/deploy/backup.sh >> /var/log/barpo-backup.log 2>&1
set -eu
cd "$(dirname "$0")"
. ./.env
DIR=/var/backups/barpo
KEEP_DAYS=14
STAMP=$(date +%Y%m%d-%H%M)
mkdir -p "$DIR"

docker compose -f compose.prod.yaml exec -T db pg_dump -U barpo_owner -d barpo -Fc > "$DIR/db-$STAMP.dump"
docker compose -f compose.prod.yaml exec -T api tar -C /app/storage -czf - . > "$DIR/files-$STAMP.tar.gz"
test -s "$DIR/db-$STAMP.dump"

find "$DIR" -type f -mtime +"$KEEP_DAYS" -delete

if [ -n "${BACKUP_REMOTE:-}" ]; then
  rsync -a --delete -e "ssh -p 23" "$DIR/" "$BACKUP_REMOTE/"
fi
echo "$(date -Is) backup ok: db-$STAMP.dump files-$STAMP.tar.gz"

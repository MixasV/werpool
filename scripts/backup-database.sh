#!/bin/bash

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/forte_backup_$TIMESTAMP.sql"

DATABASE_URL="${DATABASE_URL:-}"
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

mkdir -p "$BACKUP_DIR"

echo "Starting database backup at $(date)"

pg_dump "$DATABASE_URL" > "$BACKUP_FILE"

if [ ! -f "$BACKUP_FILE" ]; then
  echo "Error: Backup file was not created"
  exit 1
fi

gzip "$BACKUP_FILE"

RETENTION_DAYS="${RETENTION_DAYS:-7}"
find "$BACKUP_DIR" -name "forte_backup_*.sql.gz" -mtime +$RETENTION_DAYS -delete

BACKUP_SIZE=$(du -h "${BACKUP_FILE}.gz" | cut -f1)
echo "Backup completed successfully at $(date)"
echo "File: ${BACKUP_FILE}.gz"
echo "Size: $BACKUP_SIZE"
echo "Retention: $RETENTION_DAYS days"

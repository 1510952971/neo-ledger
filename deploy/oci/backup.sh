#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$ROOT_DIR/backup"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/neo-ledger-$STAMP.tar.gz"

umask 077
mkdir -p "$BACKUP_DIR" "$ROOT_DIR/data" "$ROOT_DIR/config" "$ROOT_DIR/secrets"

cd "$ROOT_DIR"
sudo docker compose -f compose.yml --env-file .env stop neo-ledger
trap 'sudo docker compose -f compose.yml --env-file .env start neo-ledger >/dev/null' EXIT

sudo tar -czf "$ARCHIVE" data config secrets .env
sudo sha256sum "$ARCHIVE" | sudo tee "$ARCHIVE.sha256" >/dev/null
sudo chown opc:opc "$ARCHIVE" "$ARCHIVE.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'neo-ledger-*.tar.gz' -mtime +30 -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'neo-ledger-*.tar.gz.sha256' -mtime +30 -delete

echo "Neo Ledger backup created: $ARCHIVE"

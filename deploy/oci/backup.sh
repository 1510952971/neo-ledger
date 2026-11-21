#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="$ROOT_DIR/backup"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$BACKUP_DIR/neo-ledger-$STAMP.tar.gz"
PARTIAL="$ARCHIVE.partial"
LOCK_FILE="$BACKUP_DIR/.backup.lock"

umask 077
mkdir -p "$BACKUP_DIR" "$ROOT_DIR/data" "$ROOT_DIR/config" "$ROOT_DIR/secrets"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "A Neo Ledger backup is already running; leaving it untouched." >&2
  exit 1
fi

cd "$ROOT_DIR"
sudo docker compose -f compose.yml --env-file .env stop neo-ledger
restart_app() {
  sudo docker compose -f compose.yml --env-file .env start neo-ledger >/dev/null || true
  sudo rm -f "$PARTIAL"
}
trap restart_app EXIT

sudo tar -czf "$PARTIAL" data config secrets .env
sudo tar -tzf "$PARTIAL" >/dev/null
sudo mv "$PARTIAL" "$ARCHIVE"
sudo sha256sum "$ARCHIVE" | sudo tee "$ARCHIVE.sha256" >/dev/null
sudo sha256sum --check "$ARCHIVE.sha256"
sudo chown opc:opc "$ARCHIVE" "$ARCHIVE.sha256"

find "$BACKUP_DIR" -maxdepth 1 -type f -name 'neo-ledger-*.tar.gz' -mtime +30 -delete
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'neo-ledger-*.tar.gz.sha256' -mtime +30 -delete

echo "Neo Ledger backup created: $ARCHIVE"

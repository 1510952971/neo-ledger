#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
sudo install -o root -g root -m 0644 \
  "$ROOT_DIR/neo-ledger-backup.service" \
  /etc/systemd/system/neo-ledger-backup.service
sudo install -o root -g root -m 0644 \
  "$ROOT_DIR/neo-ledger-backup.timer" \
  /etc/systemd/system/neo-ledger-backup.timer
sudo systemctl daemon-reload
sudo systemctl enable --now neo-ledger-backup.timer
sudo systemctl list-timers neo-ledger-backup.timer --no-pager

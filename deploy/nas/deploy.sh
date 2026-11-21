#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Upload the committed Neo Ledger source to a NAS over SSH and rebuild its container.

Required:
  NEO_NAS_SSH     SSH config alias or user@host
  NEO_NAS_DIR     Existing NAS project directory containing its .env file

Example:
  NEO_NAS_SSH=peng@192.168.1.50 \
  NEO_NAS_DIR='/SATA-1-4T/Docker/neo-ledger' \
  ./deploy/nas/deploy.sh

The deploy keeps .env, data, backup, config, and secrets in the NAS project
directory and stores each uploaded source version under .releases/.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

: "${NEO_NAS_SSH:?Set NEO_NAS_SSH to the NAS SSH alias or user@host}"
: "${NEO_NAS_DIR:?Set NEO_NAS_DIR to the NAS Neo Ledger project directory}"

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit or stash tracked changes before deployment; this script uploads HEAD." >&2
  exit 1
fi

if ! git rev-parse --verify HEAD >/dev/null 2>&1; then
  echo "No commit is available to deploy." >&2
  exit 1
fi

if [[ "$NEO_NAS_DIR" != /* || "$NEO_NAS_DIR" == "/" ]]; then
  echo "NEO_NAS_DIR must be an absolute NAS project path." >&2
  exit 1
fi

commit="$(git rev-parse --short=12 HEAD)"
upload_name="neo-ledger-${commit}-$(date -u +%Y%m%dT%H%M%SZ).tar.gz"
bundle="$(mktemp "${TMPDIR:-/tmp}/${upload_name}.XXXXXX")"
trap 'rm -f "$bundle"' EXIT
git archive --format=tar.gz --output="$bundle" HEAD

remote_dir_q="$(printf '%q' "$NEO_NAS_DIR")"
remote_file_q="$(printf '%q' "/tmp/$upload_name")"

echo "Preparing NAS project directory..."
ssh "$NEO_NAS_SSH" "mkdir -p $remote_dir_q"
echo "Uploading committed source $commit..."
scp "$bundle" "$NEO_NAS_SSH:/tmp/$upload_name"

echo "Building and starting the NAS release..."
ssh -T "$NEO_NAS_SSH" "bash -s -- $remote_dir_q $remote_file_q" <<'REMOTE'
set -euo pipefail
project_dir="$1"
archive="$2"
releases="$project_dir/.releases"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
release="$releases/$stamp"
backup="$project_dir/backup/pre-update-$stamp.tar.gz"
was_running=0

cleanup() {
  rm -f "$archive"
  if [[ "$was_running" == 1 ]]; then
    docker start neo-ledger-nas >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

if [[ ! -f "$project_dir/.env" ]]; then
  echo "Missing $project_dir/.env; configure the NAS environment before deploying." >&2
  exit 1
fi
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker CLI is unavailable for this SSH account." >&2
  exit 1
fi
docker compose version >/dev/null

mkdir -p "$releases" "$project_dir/data" "$project_dir/backup" \
  "$project_dir/config" "$project_dir/secrets" "$release"
tar -xzf "$archive" -C "$release"
for persistent in .env data backup config secrets; do
  ln -sfn "$project_dir/$persistent" "$release/$persistent"
done

compose=(docker compose -p neo-ledger -f "$release/deploy/nas/compose.yml")
NEO_LEDGER_RELEASE="$stamp" "${compose[@]}" config >/dev/null
NEO_LEDGER_RELEASE="$stamp" "${compose[@]}" build neo-ledger

# Refuse to rebuild an existing container if it is not using this project's
# persistent data directory. A newly initialized empty mount must not silently
# replace the database that held the user's account.
pre_users="unknown"
if docker inspect neo-ledger-nas >/dev/null 2>&1; then
  mount_source="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination \"/app/.wrangler\"}}{{.Source}}{{end}}{{end}}' neo-ledger-nas)"
  expected_data="$(readlink -f "$project_dir/data")"
  actual_data="$(readlink -f "$mount_source" 2>/dev/null || true)"
  if [[ -z "$mount_source" || "$actual_data" != "$expected_data" ]]; then
    echo "Refusing update: current container data mount '$mount_source' does not resolve to '$expected_data'. Preserve and inspect the original database before changing Compose." >&2
    exit 1
  fi
  pre_users="$(docker exec neo-ledger-nas node -e 'fetch("http://127.0.0.1:3000/api/auth").then(async r=>{const x=await r.json();process.stdout.write(x.hasUsers?"yes":"no")}).catch(()=>process.stdout.write("unknown"))' 2>/dev/null || echo unknown)"
  docker stop neo-ledger-nas >/dev/null
  was_running=1
fi

# Snapshot the stopped database directory so SQLite/WAL state is consistent.
tar -czf "$backup" -C "$project_dir" data config secrets .env
tar -tzf "$backup" >/dev/null
sha256sum "$backup" > "$backup.sha256"

NEO_LEDGER_RELEASE="$stamp" "${compose[@]}" up -d --no-build neo-ledger
was_running=0

for attempt in $(seq 1 30); do
  state="$(docker inspect -f '{{.State.Health.Status}}' neo-ledger-nas 2>/dev/null || true)"
  if [[ "$state" == healthy ]]; then
    echo "NAS deployment is healthy: $release"
    break
  fi
  if [[ "$attempt" -eq 30 ]]; then
    docker logs --tail 80 neo-ledger-nas >&2 || true
    echo "NAS container did not become healthy (state: ${state:-unknown})." >&2
    exit 1
  fi
  sleep 2
done

docker exec neo-ledger-nas node -e \
  'fetch("http://127.0.0.1:3000/api/app-update/health").then(async r => { console.log(await r.text()); if (!r.ok) process.exit(1) }).catch(e => { console.error(e); process.exit(1) })'

post_users="$(docker exec neo-ledger-nas node -e 'fetch("http://127.0.0.1:3000/api/auth").then(async r=>{const x=await r.json();process.stdout.write(x.hasUsers?"yes":"no")}).catch(()=>process.stdout.write("unknown"))')"
if [[ "$pre_users" == yes && "$post_users" != yes ]]; then
  docker stop neo-ledger-nas >/dev/null || true
  echo "DATA SAFETY STOP: the prior database had accounts but the updated service does not. The new container has been stopped. Verified pre-update backup: $backup. Do not register a replacement account or write data; restore the expected mount/database first." >&2
  exit 1
fi
echo "Verified pre-update backup: $backup ($(cat "$backup.sha256" | awk '{print $1}'))"

# Keep recent source releases available for manual rollback; persistent data is
# outside these directories and is never removed here.
find "$releases" -mindepth 1 -maxdepth 1 -type d -print0 \
  | xargs -0 ls -1td \
  | tail -n +6 \
  | while IFS= read -r old_release; do
      docker image rm "neo-ledger-nas:$(basename "$old_release")" >/dev/null 2>&1 || true
      rm -rf -- "$old_release"
    done
REMOTE

echo "NAS deployment finished."

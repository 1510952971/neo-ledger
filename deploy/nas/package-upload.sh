#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"

commit="$(git rev-parse --short=12 HEAD)"
if git ls-files --error-unmatch .env >/dev/null 2>&1; then
  echo "Refusing to package: a root .env file is tracked by Git." >&2
  exit 1
fi
if git ls-files | rg '(^|/)(secrets?|credentials?)/|(^|/)\.env$|\.(key|pem)$' >/dev/null; then
  echo "Refusing to package: tracked secret or private-key paths were found." >&2
  exit 1
fi

output_dir="${1:-$repo_root/release-artifacts/nas-upload}"
mkdir -p "$output_dir"
output_dir="$(cd "$output_dir" && pwd)"
output="$output_dir/neo-ledger-nas-$commit.zip"
staging="$(mktemp -d "${TMPDIR:-/tmp}/neo-ledger-nas.XXXXXX")"
trap 'rm -rf "$staging"' EXIT

git archive --format=tar HEAD | tar -xf - -C "$staging"
rm -f "$staging/docker-compose.yml"
if [[ ! -f "$staging/Dockerfile" ]]; then
  echo "The committed source archive does not contain the root Dockerfile." >&2
  exit 1
fi

mkdir -p "$output_dir"
(
  cd "$staging"
  zip -qr "$output" . -x '.DS_Store' '*/.DS_Store'
)

echo "Created NAS upload package for commit $commit: $output"

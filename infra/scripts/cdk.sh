#!/usr/bin/env bash
# Runs cdk with the AWS guard applied. Always use this (via npm scripts) instead of bare `cdk`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
# .env supplies defaults; a value already in the environment wins (IMAGE_TAG=... npm run deploy:web).
if [[ -f "$ROOT/.env" ]]; then
  keep=()
  for k in $(grep -oE '^[A-Za-z_][A-Za-z0-9_]*' "$ROOT/.env"); do
    if [[ -n "${!k+x}" ]]; then keep+=("$k=${!k}"); fi
  done
  set -a; source "$ROOT/.env"; set +a
  for kv in "${keep[@]+"${keep[@]}"}"; do export "$kv"; done
fi
source "$ROOT/scripts/lib/aws-guard.sh"
# Workers bundle the workspace packages through their exports, which point at dist. Always
# rebuild: after a git pull or checkout a stale dist would be bundled into the Lambdas silently.
(cd "$ROOT" && npm run build:packages)
cd "$HERE/.."
exec npx cdk "$@"

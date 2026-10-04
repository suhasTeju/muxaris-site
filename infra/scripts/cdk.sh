#!/usr/bin/env bash
# Runs cdk with the AWS guard applied. Always use this (via npm scripts) instead of bare `cdk`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
source "$ROOT/scripts/lib/aws-guard.sh"
cd "$HERE/.."
exec npx cdk "$@"

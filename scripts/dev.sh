#!/usr/bin/env bash
# Start Postgres, run migrations + seed, then run web, api and voice-gateway together.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[[ -f .env ]] || { echo "copy .env.example to .env first"; exit 1; }
set -a; source .env; set +a
# AUTH_MODE=dev accepts "dev:<sub>:<email>" tokens and is for API/gateway tests only
# (refused when NODE_ENV=production). The web app needs real Cognito tokens, so default to cognito.
export AUTH_MODE="${AUTH_MODE:-cognito}"
if [[ "$AUTH_MODE" == "cognito" ]]; then
  [[ -n "${COGNITO_USER_POOL_ID:-}" && -n "${COGNITO_CLIENT_ID:-}" ]] || {
    echo "AUTH_MODE=cognito requires COGNITO_USER_POOL_ID and COGNITO_CLIENT_ID in .env (see scripts/bootstrap-aws.sh)"; exit 1; }
fi
export AWS_PROFILE="aws-secondary-account" AWS_REGION="ap-south-1"
docker compose up -d postgres
until docker exec muxaris-postgres pg_isready -U muxaris >/dev/null 2>&1; do sleep 1; done
npm run build:packages
npm run db:migrate && npm run db:seed
trap 'kill 0' EXIT
npm run dev -w @muxaris/api &
npm run dev -w @muxaris/voice-gateway &
npm run dev -w @muxaris/web &
if [[ -n "${POST_CALL_QUEUE_URL:-}" ]]; then
  npm run dev -w @muxaris/worker-post-call &
else
  echo "POST_CALL_QUEUE_URL is empty: post-call worker skipped"
fi
npm run dev -w @muxaris/worker-notifier &
wait

#!/usr/bin/env bash
# Start Postgres, run migrations + seed, then run web, api and voice-gateway together.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[[ -f .env ]] || { echo "copy .env.example to .env first"; exit 1; }
set -a; source .env; set +a
export AWS_PROFILE="aws-secondary-account" AWS_REGION="ap-south-1"
docker compose up -d postgres
until docker exec muxaris-postgres pg_isready -U muxaris >/dev/null 2>&1; do sleep 1; done
npm run db:migrate && npm run db:seed
trap 'kill 0' EXIT
npm run dev -w @muxaris/api &
npm run dev -w @muxaris/voice-gateway &
npm run dev -w @muxaris/web &
wait

#!/usr/bin/env bash
# Runs the migration runner from the API image against a brand-new database on the dev Postgres,
# then starts both images and checks /healthz. Usage: scripts/test-fresh-db.sh [tag]
set -euo pipefail
TAG="${1:-latest}"
DBNAME="fresh_$(date +%s)"
docker exec muxaris-postgres psql -U muxaris -d muxaris -c "CREATE DATABASE $DBNAME" >/dev/null
cleanup() {
  docker rm -f fresh-api fresh-gw >/dev/null 2>&1 || true
  docker exec muxaris-postgres psql -U muxaris -d muxaris -c "DROP DATABASE IF EXISTS $DBNAME" >/dev/null || true
}
trap cleanup EXIT
# host.docker.internal reaches the dev Postgres from inside a container on Docker Desktop
URL="postgres://muxaris:muxaris@host.docker.internal:5433/$DBNAME"
# Migration runs exactly as deployed (NODE_ENV=production, from the API image).
docker run --rm -e NODE_ENV=production -e DATABASE_URL="$URL" "muxaris-api:$TAG" node packages/db/dist/migrate.js
docker exec muxaris-postgres psql -U muxaris -d "$DBNAME" -tAc "SELECT count(*) FROM plans" | grep -qx 2
docker run -d --name fresh-api -p 4900:4000 -e NODE_ENV=production -e DATABASE_URL="$URL" -e AUTH_MODE=cognito \
  -e COGNITO_USER_POOL_ID=ap-south-1_x -e COGNITO_CLIENT_ID=x "muxaris-api:$TAG" >/dev/null
docker run -d --name fresh-gw -p 4901:4100 -e NODE_ENV=production -e DATABASE_URL="$URL" -e AUTH_MODE=cognito \
  -e COGNITO_USER_POOL_ID=ap-south-1_x -e COGNITO_CLIENT_ID=x -e SARVAM_TTS_API_KEY=x -e VOICE_PROVIDER=sarvam \
  "muxaris-voice-gateway:$TAG" >/dev/null
for _ in $(seq 1 20); do
  if curl -fsS localhost:4900/healthz >/dev/null && curl -fsS localhost:4901/healthz >/dev/null; then
    echo "fresh-db OK ($DBNAME)"
    exit 0
  fi
  sleep 1
done
echo "healthz never came up"
docker logs fresh-api | tail -20
docker logs fresh-gw | tail -20
exit 1

#!/usr/bin/env bash
# Builds the three images for linux/arm64 (Fargate Graviton). Usage: scripts/build-images.sh [tag]
# The web image inlines its NEXT_PUBLIC_* values at build time; they come from the environment
# (.env is sourced when present): NEXT_PUBLIC_COGNITO_DOMAIN and NEXT_PUBLIC_GOOGLE_ENABLED as is,
# the Cognito ids from COGNITO_USER_POOL_ID / COGNITO_CLIENT_ID, the API and voice URLs fixed.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
TAG="${1:-$(git -C "$ROOT" rev-parse --short HEAD)}"
PLATFORM="${IMAGE_PLATFORM:-linux/arm64}"
for app in api voice-gateway; do
  echo "→ build muxaris-$app:$TAG ($PLATFORM)"
  docker build --platform "$PLATFORM" --build-arg "GIT_SHA=$TAG" \
    -f "$ROOT/apps/$app/Dockerfile" -t "muxaris-$app:$TAG" -t "muxaris-$app:latest" "$ROOT"
done
echo "→ build muxaris-web:$TAG ($PLATFORM)"
docker build --platform "$PLATFORM" --build-arg "GIT_SHA=$TAG" \
  --build-arg "NEXT_PUBLIC_API_URL=https://api.muxaris.com" \
  --build-arg "NEXT_PUBLIC_VOICE_WS_URL=wss://voice.muxaris.com" \
  --build-arg "NEXT_PUBLIC_COGNITO_USER_POOL_ID=${COGNITO_USER_POOL_ID:-}" \
  --build-arg "NEXT_PUBLIC_COGNITO_CLIENT_ID=${COGNITO_CLIENT_ID:-}" \
  --build-arg "NEXT_PUBLIC_COGNITO_DOMAIN=${NEXT_PUBLIC_COGNITO_DOMAIN:-}" \
  --build-arg "NEXT_PUBLIC_GOOGLE_ENABLED=${NEXT_PUBLIC_GOOGLE_ENABLED:-}" \
  -f "$ROOT/apps/web/Dockerfile" -t "muxaris-web:$TAG" -t "muxaris-web:latest" "$ROOT"
echo "built muxaris-api:$TAG muxaris-voice-gateway:$TAG muxaris-web:$TAG"

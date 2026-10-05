#!/usr/bin/env bash
# Builds both service images for linux/arm64 (Fargate Graviton). Usage: scripts/build-images.sh [tag]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TAG="${1:-$(git -C "$ROOT" rev-parse --short HEAD)}"
PLATFORM="${IMAGE_PLATFORM:-linux/arm64}"
for app in api voice-gateway; do
  echo "→ build muxaris-$app:$TAG ($PLATFORM)"
  docker build --platform "$PLATFORM" --build-arg "GIT_SHA=$TAG" \
    -f "$ROOT/apps/$app/Dockerfile" -t "muxaris-$app:$TAG" -t "muxaris-$app:latest" "$ROOT"
done
echo "built muxaris-api:$TAG muxaris-voice-gateway:$TAG"

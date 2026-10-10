#!/usr/bin/env bash
# scripts/push-images.sh — build and push the three images to ECR. Usage: scripts/push-images.sh [tag]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/aws-guard.sh"

TAG="${1:-$(git -C "$ROOT" rev-parse --short HEAD)}"
REGISTRY="005533348545.dkr.ecr.ap-south-1.amazonaws.com"

echo "→ ecr login"
aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY" >/dev/null

bash "$ROOT/scripts/build-images.sh" "$TAG"

# Tags are immutable and never retagged: a repo that already has this tag is skipped, so a failed
# deploy can be re-run with the same tag.
for repo in muxaris-api muxaris-voice-gateway muxaris-web; do
  if aws ecr describe-images --repository-name "$repo" --image-ids "imageTag=$TAG" >/dev/null 2>&1; then
    echo "→ skip $repo:$TAG (already in ECR; tags are immutable)"
    continue
  fi
  echo "→ push $repo:$TAG"
  docker tag "$repo:$TAG" "$REGISTRY/$repo:$TAG"
  if ! docker push "$REGISTRY/$repo:$TAG"; then
    echo "ERROR: push of $repo:$TAG failed." >&2
    exit 1
  fi
done

echo "IMAGE_TAG=$TAG"

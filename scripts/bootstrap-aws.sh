#!/usr/bin/env bash
# scripts/bootstrap-aws.sh — one-time (idempotent) setup of the secondary account.
# Usage: scripts/bootstrap-aws.sh            # bootstrap CDK + deploy MuxarisAuth, print env lines
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
source "$ROOT/scripts/lib/aws-guard.sh"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
# .env may override AWS_PROFILE; re-assert the guard values.
export AWS_PROFILE="aws-secondary-account" AWS_REGION="ap-south-1"

cd "$ROOT/infra"
echo "→ cdk bootstrap"
npx cdk bootstrap "aws://005533348545/ap-south-1" --require-approval never
echo "→ deploy MuxarisAuth"
npx cdk deploy MuxarisAuth --require-approval never --outputs-file /tmp/muxaris-auth-outputs.json

POOL=$(jq -r '.MuxarisAuth.UserPoolId' /tmp/muxaris-auth-outputs.json)
CLIENT=$(jq -r '.MuxarisAuth.UserPoolClientId' /tmp/muxaris-auth-outputs.json)
DOMAIN=$(jq -r '.MuxarisAuth.UserPoolDomain' /tmp/muxaris-auth-outputs.json)
cat <<EOT

Add these to .env and to Netlify environment variables:
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$POOL
NEXT_PUBLIC_COGNITO_CLIENT_ID=$CLIENT
NEXT_PUBLIC_COGNITO_DOMAIN=$DOMAIN
COGNITO_USER_POOL_ID=$POOL
COGNITO_CLIENT_ID=$CLIENT
EOT

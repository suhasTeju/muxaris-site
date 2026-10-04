#!/usr/bin/env bash
# scripts/bootstrap-aws.sh — one-time (idempotent) setup of the secondary account.
# Usage: scripts/bootstrap-aws.sh            # bootstrap CDK + deploy MuxarisAuth, print env lines
set -euo pipefail
command -v jq >/dev/null || { echo "jq required"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
# Guard runs after .env so its exports and account check have the final say.
source "$ROOT/scripts/lib/aws-guard.sh"

if [[ -n "${GOOGLE_OAUTH_CLIENT_SECRET:-}" ]]; then
  echo "→ upsert Google OAuth secret in Secrets Manager"
  SECRET_JSON="$(jq -cn --arg s "$GOOGLE_OAUTH_CLIENT_SECRET" '{clientSecret:$s}')"
  if ! aws secretsmanager create-secret --name muxaris/google-oauth --secret-string "$SECRET_JSON" >/dev/null 2>&1; then
    aws secretsmanager put-secret-value --secret-id muxaris/google-oauth --secret-string "$SECRET_JSON" >/dev/null
  fi
fi

OUT="$(mktemp)"
cd "$ROOT/infra"
echo "→ cdk bootstrap"
npx cdk bootstrap "aws://005533348545/ap-south-1"
echo "→ deploy MuxarisAuth"
npx cdk deploy MuxarisAuth --require-approval never --outputs-file "$OUT"

POOL=$(jq -r '.MuxarisAuth.UserPoolId' "$OUT")
CLIENT=$(jq -r '.MuxarisAuth.UserPoolClientId' "$OUT")
DOMAIN=$(jq -r '.MuxarisAuth.UserPoolDomain' "$OUT")
cat <<EOT

Add these to .env and to Netlify environment variables:
NEXT_PUBLIC_COGNITO_USER_POOL_ID=$POOL
NEXT_PUBLIC_COGNITO_CLIENT_ID=$CLIENT
NEXT_PUBLIC_COGNITO_DOMAIN=$DOMAIN
COGNITO_USER_POOL_ID=$POOL
COGNITO_CLIENT_ID=$CLIENT
EOT

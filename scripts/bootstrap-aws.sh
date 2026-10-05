#!/usr/bin/env bash
# scripts/bootstrap-aws.sh — one-time (idempotent) setup of the secondary account.
# Usage: scripts/bootstrap-aws.sh            # bootstrap CDK + deploy MuxarisAuth, print env lines
#        scripts/bootstrap-aws.sh --secrets  # merge keys from .env into muxaris/app (prints key names only)
#        scripts/bootstrap-aws.sh --outputs  # print stack outputs as KEY=value lines
set -euo pipefail
command -v jq >/dev/null || { echo "jq required"; exit 1; }
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$ROOT/.env" ]]; then set -a; source "$ROOT/.env"; set +a; fi
# Guard runs after .env so its exports and account check have the final say.
source "$ROOT/scripts/lib/aws-guard.sh"

stack_output() { # stack key -> value, empty when the stack or output is missing
  local v
  v="$(aws cloudformation describe-stacks --stack-name "$1" \
    --query "Stacks[0].Outputs[?OutputKey=='$2'].OutputValue | [0]" --output text 2>/dev/null || true)"
  [[ "$v" == "None" ]] && v=""
  echo "$v"
}

if [[ "${1:-}" == "--outputs" ]]; then
  for entry in "MuxarisData:DbSecretArn:DB_SECRET_ARN" "MuxarisData:AppSecretArn:APP_SECRET_ARN" \
    "MuxarisServices:AlbDnsName:ALB_DNS_NAME" "MuxarisCicd:DeployRoleArn:DEPLOY_ROLE_ARN" \
    "MuxarisObservability:DashboardUrl:DASHBOARD_URL" "MuxarisData:ApiRepoUri:API_REPO_URI" \
    "MuxarisData:GatewayRepoUri:GATEWAY_REPO_URI"; do
    IFS=: read -r stack key name <<<"$entry"
    val="$(stack_output "$stack" "$key")"
    if [[ -n "$val" ]]; then echo "$name=$val"; else echo "# $name skipped: stack $stack or output $key not found yet"; fi
  done
  exit 0
fi

if [[ "${1:-}" == "--secrets" ]]; then
  # Values are read from the environment (exported by sourcing .env), never from argv.
  APP_JSON="$(jq -cn '[
      "SARVAM_TTS_API_KEY", "RAZORPAY_KEY_ID", "RAZORPAY_KEY_SECRET", "RAZORPAY_WEBHOOK_SECRET",
      "RAZORPAY_PLAN_ID_STANDARD", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_ID", "TWILIO_AUTH_TOKEN",
      "TELEPHONY_STREAM_SECRET"
    ] | map({key: ., value: (env[.] // "")}) | from_entries
    | with_entries(select(.value != ""))')"
  KEYS="$(jq -r 'keys | join(", ")' <<<"$APP_JSON")"
  if [[ "$APP_JSON" == "{}" ]]; then echo "no app secret keys set in .env; nothing written"; exit 0; fi
  # Merge into the existing JSON so keys not in .env (set earlier, or by hand) survive. A
  # non-JSON current value (the generated placeholder) counts as {}. Secret values travel through
  # a 0600 temp file, never the command line.
  TMP="$(mktemp)"
  trap 'rm -f "$TMP"' EXIT
  chmod 600 "$TMP"
  CURRENT="$(aws secretsmanager get-secret-value --secret-id muxaris/app --query SecretString \
    --output text 2>/dev/null || true)"
  if jq -e 'type == "object"' >/dev/null 2>&1 <<<"$CURRENT"; then BASE="$CURRENT"; else BASE="{}"; fi
  jq -cs '.[0] + .[1]' <(printf '%s' "$BASE") <(printf '%s' "$APP_JSON") >"$TMP"
  # The Data stack creates muxaris/app; fall back to create-secret if it does not exist yet.
  if ! aws secretsmanager put-secret-value --secret-id muxaris/app --secret-string "file://$TMP" >/dev/null 2>&1; then
    aws secretsmanager create-secret --name muxaris/app --secret-string "file://$TMP" >/dev/null
  fi
  echo "muxaris/app updated with keys: $KEYS"
  exit 0
fi

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

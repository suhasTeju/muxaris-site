#!/usr/bin/env bash
# Create (or reset) a confirmed Cognito user for local/demo sign-in.
# Usage: bash scripts/create-demo-user.sh <email>
# The password is read from the terminal (never echoed, never logged) and set as permanent,
# so no verification email is needed. Uses the secondary AWS account only (aws-guard).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
[[ -f "$ROOT/.env" ]] || { echo "copy .env.example to .env first" >&2; exit 1; }
# shellcheck disable=SC1091
source "$ROOT/scripts/lib/aws-guard.sh"
POOL="$(grep -E '^COGNITO_USER_POOL_ID=' "$ROOT/.env" | cut -d= -f2-)"
[[ -n "$POOL" ]] || { echo "COGNITO_USER_POOL_ID is empty in .env" >&2; exit 1; }
EMAIL="${1:-}"
[[ "$EMAIL" == *@* ]] || { echo "usage: $0 <email>" >&2; exit 1; }
read -r -s -p "Password for $EMAIL (min 8 chars, upper, lower, number): " PASSWORD; echo
[[ ${#PASSWORD} -ge 8 ]] || { echo "password too short" >&2; exit 1; }
if ! aws cognito-idp admin-get-user --user-pool-id "$POOL" --username "$EMAIL" >/dev/null 2>&1; then
  aws cognito-idp admin-create-user --user-pool-id "$POOL" --username "$EMAIL" \
    --user-attributes Name=email,Value="$EMAIL" Name=email_verified,Value=true \
    --message-action SUPPRESS >/dev/null
  echo "created $EMAIL"
else
  echo "user exists; resetting password"
fi
aws cognito-idp admin-set-user-password --user-pool-id "$POOL" --username "$EMAIL" \
  --password "$PASSWORD" --permanent
unset PASSWORD
echo "done. Sign in at http://localhost:3000/sign-in and use 'Load demo clinic' in onboarding."

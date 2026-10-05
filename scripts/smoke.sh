#!/usr/bin/env bash
# scripts/smoke.sh <base-url> — post-deploy checks through the ALB (plain curl, no AWS access needed).
set -euo pipefail
BASE="${1:?usage: scripts/smoke.sh <base-url>}"
BASE="${BASE%/}"

fail() { echo "FAIL $1" >&2; exit 1; }

body="$(curl -fsS --max-time 15 "$BASE/healthz")" || fail "api /healthz unreachable"
[[ "$body" == *'"service":"api"'* ]] || fail "api /healthz did not report service api"
echo "ok   api /healthz"

code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$BASE/v1/me")" || code=000
[[ "$code" == "401" ]] || fail "/v1/me without a token returned $code, expected 401"
echo "ok   /v1/me without token -> 401"

# The upgrade request is rejected on the evil origin; a 403 proves the gateway answered via the path rule.
code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
  -H "Origin: https://evil.example" -H "Connection: Upgrade" -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: $(openssl rand -base64 16)" \
  "$BASE/v1/session")" || code=000
[[ "$code" == "403" ]] || fail "gateway /v1/session with a bad origin returned $code, expected 403"
echo "ok   gateway /v1/session bad origin -> 403"

if [[ -n "${SMOKE_TOKEN:-}" ]]; then
  if [[ "$BASE" != https://* ]]; then
    echo "SMOKE_TOKEN ignored: refusing to send a bearer token over http"
  else
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 \
      -H "Authorization: Bearer $SMOKE_TOKEN" "$BASE/v1/me")" || code=000
    [[ "$code" == "200" ]] || fail "/v1/me with token returned $code, expected 200"
    echo "ok   /v1/me with token -> 200"
  fi
fi

echo "smoke OK"

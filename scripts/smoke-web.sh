#!/usr/bin/env bash
# scripts/smoke-web.sh <base-url> [connect-to-host]
# Post-deploy checks for the web app (plain curl). With a second argument the TLS connection goes to
# that host instead of DNS (the CloudFront domain before the cutover): the request still carries the
# real hostname, which the ALB rule and CloudFront's alias both need.
set -euo pipefail
BASE="${1:?usage: scripts/smoke-web.sh <base-url> [connect-to-host]}"
BASE="${BASE%/}"
HOST="${BASE#https://}"; HOST="${HOST#http://}"; HOST="${HOST%%/*}"
CURL=(curl -s --max-time 20)
if [[ -n "${2:-}" ]]; then CURL+=(--connect-to "$HOST:443:$2:443"); fi

fail() { echo "FAIL $1" >&2; exit 1; }

body="$("${CURL[@]}" -f "$BASE/healthz")" || fail "web /healthz unreachable"
[[ "$body" == *'"service":"web"'* ]] || fail "web /healthz did not report service web"
echo "ok   web /healthz"

page="$("${CURL[@]}" -D /tmp/smoke-web-headers.$$ "$BASE/")" || fail "GET / failed"
grep -q "<title>Muxaris" <<<"$page" || fail "/ did not render the landing page title"
grep -qi "^permissions-policy: .*microphone=(self)" /tmp/smoke-web-headers.$$ \
  || fail "/ is missing the Permissions-Policy header (microphone)"
grep -qi "^x-frame-options: DENY" /tmp/smoke-web-headers.$$ || fail "/ is missing X-Frame-Options"
rm -f /tmp/smoke-web-headers.$$
echo "ok   / renders with security headers"

asset="$(grep -o '/_next/static/[^"]*\.js' <<<"$page" | head -1)"
[[ -n "$asset" ]] || fail "no /_next/static asset referenced by /"
code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE$asset")" || code=000
[[ "$code" == "200" ]] || fail "static asset $asset returned $code"
echo "ok   /_next/static asset -> 200"

code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/pricing")" || code=000
[[ "$code" == "200" ]] || fail "/pricing returned $code"
echo "ok   /pricing -> 200"

loc="$("${CURL[@]}" -o /dev/null -w '%{http_code} %{redirect_url}' "$BASE/app")" || loc=000
[[ "$loc" == 307\ *"/sign-in?next=%2Fapp"* ]] || fail "/app without a session returned '$loc', expected 307 to /sign-in"
[[ "$loc" == *"$HOST/sign-in"* ]] || fail "/app redirected to another host: $loc"
echo "ok   /app -> 307 /sign-in on $HOST"

code="$("${CURL[@]}" -o /dev/null -w '%{http_code}' "$BASE/dev/shell")" || code=000
[[ "$code" == "404" ]] || fail "/dev/shell returned $code, expected 404 in production"
echo "ok   /dev/shell -> 404"

if [[ "$HOST" == "muxaris.com" && -z "${2:-}" ]]; then
  loc="$(curl -s --max-time 20 -o /dev/null -w '%{http_code} %{redirect_url}' "https://www.muxaris.com/pricing")" || loc=000
  [[ "$loc" == "301 https://muxaris.com/pricing" ]] || fail "www did not redirect to the apex: $loc"
  echo "ok   www -> 301 apex"
fi

echo "web smoke OK"

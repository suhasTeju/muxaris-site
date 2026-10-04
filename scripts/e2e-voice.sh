#!/usr/bin/env bash
# Scripted voice smoke test against real providers. Starts a SECOND api (4001) and gateway (4101)
# in AUTH_MODE=dev, runs scripts/e2e-voice.ts, then stops them. Leaves 3000/4000/4100 alone.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; cd "$ROOT"
[[ -f .env ]] || { echo "copy .env.example to .env first"; exit 1; }
set -a; source .env; set +a
source scripts/lib/aws-guard.sh
export AUTH_MODE=dev API_PORT=4001 VOICE_PORT=4101 CORS_ORIGINS=http://localhost:3000
export E2E_API_URL="http://localhost:4001" E2E_WS_URL="ws://localhost:4101"
OUT="${E2E_OUT_DIR:-${TMPDIR:-/tmp}/muxaris-e2e}"; export E2E_OUT_DIR="$OUT"; mkdir -p "$OUT"
npm run build:packages >/dev/null
PIDS=()
cleanup() { for p in "${PIDS[@]:-}"; do [[ -n "$p" ]] && kill "$p" 2>/dev/null || true; done; wait 2>/dev/null || true; }
trap cleanup EXIT
(cd apps/api && exec npx tsx src/index.ts) >"$OUT/api.log" 2>&1 & PIDS+=($!)
(cd apps/voice-gateway && exec npx tsx src/index.ts) >"$OUT/gateway.log" 2>&1 & PIDS+=($!)
if [[ "${E2E_WITH_WORKER:-0}" == "1" ]]; then
  (cd workers/post-call && exec npx tsx src/dev.ts) >"$OUT/worker.log" 2>&1 & PIDS+=($!)
fi
for url in http://localhost:4001/healthz http://localhost:4101/healthz; do
  for _ in $(seq 1 60); do curl -fs "$url" >/dev/null 2>&1 && continue 2; sleep 1; done
  echo "timeout waiting for $url (see $OUT/*.log)"; exit 1
done
rc=0
npx tsx scripts/e2e-voice.ts || rc=$?
echo "logs: $OUT"
exit "$rc"

#!/usr/bin/env bash
# Usage: scripts/gen-image.sh "<prompt>" <size: 1024x1024|1536x1024|1024x1536> <outfile.png>
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; set -a; source "$ROOT/.env"; set +a
[[ $# -ge 3 ]] || { echo "usage: $0 \"<prompt>\" <size> <out.png>" >&2; exit 2; }
PROMPT="$1"; SIZE="${2:-1024x1024}"; OUT="$3"
BODY=$(jq -n --arg p "$PROMPT" --arg s "$SIZE" '{model:"gpt-image-2", prompt:$p, size:$s, n:1, quality:"high"}')
RESP=$(curl -sS --max-time 300 -X POST "$GPT_IMAGE_ENDPOINT" -H "Content-Type: application/json" -H "api-key: $GPT_IMAGE_API_KEY" -d "$BODY")
ERR=$(echo "$RESP" | jq -r '.error.message // empty' 2>/dev/null || echo "unparseable response")
[[ -n "$ERR" ]] && { echo "ERROR [$OUT]: $ERR" >&2; exit 1; }
B64=$(echo "$RESP" | jq -r '.data[0].b64_json // empty')
[[ -n "$B64" ]] || { echo "ERROR [$OUT]: no image in response" >&2; exit 1; }
mkdir -p "$(dirname "$OUT")"
echo "$B64" | base64 -d > "$OUT"
echo "OK $OUT"

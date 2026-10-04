#!/usr/bin/env bash
# Generates the Phase 1 image set into apps/web/public/img/*.webp (idempotent: skips existing files).
# FORCE=1 regenerates everything; or pass asset names to regenerate only those: scripts/gen-assets.sh hero-clinic
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUTDIR="$ROOT/apps/web/public/img"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUTDIR"

STYLE="Editorial photography, warm natural light, real Indian setting, muted palette (warm off-white, soft greens, natural wood) that sits on an off-white paper background, 35mm film grain, shallow depth of field, candid and unposed, no stock-photo smiles. Absolutely no text, letters, numbers, logos or signage anywhere in the image."

# name|size|prompt
ASSETS=(
"hero-clinic|1536x1024|A small modern dental clinic reception in Bengaluru in morning light, an empty front desk with a phone whose handset is slightly lifted as if a call is ringing, indoor plants, warm wood, calm and uncluttered."
"step-call|1024x1024|Close-up of an Indian woman in her 30s on a phone call outdoors, looking relieved, city street background softly blurred."
"step-calendar|1024x1024|Over-the-shoulder view of a dentist's appointment calendar on a tablet in a clinic, calendar blocks shown only as abstract colored shapes with no readable text."
"step-confirm|1024x1024|A hand holding a phone showing a blurred message confirmation, a clinic waiting area softly out of focus behind."
"spec-dental|1024x1024|Interior detail of a dental clinic: dental chair, overhead light and instrument tray, quiet and clean."
"spec-skin|1024x1024|Interior detail of a dermatology clinic: treatment room with soft light, skincare tray and neatly folded towels."
"spec-eye|1024x1024|Interior detail of an eye clinic: an eye examination chair with a phoropter and a trial lens set."
"spec-physio|1024x1024|Interior detail of a physiotherapy clinic: treatment bed, resistance bands and exercise balls in soft daylight."
"spec-diagnostic|1024x1024|Interior detail of a diagnostic lab: sample collection counter, rows of test tubes in a rack, clean surfaces."
"og-card|1536x1024|Abstract warm paper texture in off-white with a soft green sound-wave arc sweeping across it, minimal and calm, large empty space."
)

SEL=("$@")
selected() { [[ ${#SEL[@]} -eq 0 ]] && return 0; local n; for n in "${SEL[@]}"; do [[ "$n" == "$1" ]] && return 0; done; return 1; }

to_webp() { # in.png out.webp : max 1600px wide, shrink quality until <250KB
  local in="$1" out="$2" q
  for q in 82 74 66 58; do
    cwebp -quiet -q "$q" -resize 1600 0 "$in" -o "$out" 2>/dev/null || cwebp -quiet -q "$q" "$in" -o "$out"
    [[ $(stat -f%z "$out" 2>/dev/null || stat -c%s "$out") -lt 256000 ]] && return 0
  done
}

FAILED=()
for row in "${ASSETS[@]}"; do
  IFS='|' read -r name size prompt <<<"$row"
  selected "$name" || continue
  out="$OUTDIR/$name.webp"
  if [[ -f "$out" && "${FORCE:-0}" != "1" && ${#SEL[@]} -eq 0 ]]; then echo "SKIP $name (exists)"; continue; fi
  png="$TMP/$name.png"
  if ! "$ROOT/scripts/gen-image.sh" "$prompt $STYLE" "$size" "$png" >/dev/null 2>"$TMP/err"; then
    echo "retry $name: $(head -c 200 "$TMP/err")" >&2
    # one retry with a softened wording
    if ! "$ROOT/scripts/gen-image.sh" "A calm documentary-style photograph. ${prompt} Natural light, no text of any kind." "$size" "$png" >/dev/null 2>"$TMP/err"; then
      echo "FAIL $name: $(head -c 200 "$TMP/err")" >&2; FAILED+=("$name"); continue
    fi
  fi
  to_webp "$png" "$out"
  echo "OK $name.webp $(( $(stat -f%z "$out" 2>/dev/null || stat -c%s "$out") / 1024 )) KB"
done
[[ ${#FAILED[@]} -eq 0 ]] || { echo "Failed: ${FAILED[*]}" >&2; exit 1; }

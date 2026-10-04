#!/usr/bin/env bash
# Generates greeting clips (5 languages) and a stitched sample call into apps/web/public/audio/*.m4a.
# Idempotent: skips existing outputs. FORCE=1 regenerates.
# Sarvam bulbul:v3. Receptionist = shubh, caller = priya (both valid v3 speakers; anushka/vidya are v2-only).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"; set -a; source "$ROOT/.env"; set +a
OUTDIR="$ROOT/apps/web/public/audio"; TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUTDIR"
RECEPTIONIST="shubh"; CALLER="priya"

tts() { # text lang speaker out.wav
  local body resp
  body=$(jq -n --arg t "$1" --arg l "$2" --arg s "$3" '{text:$t, target_language_code:$l, speaker:$s, model:"bulbul:v3", pace:1.0, speech_sample_rate:24000}')
  resp=$(curl -sS --max-time 60 -X POST https://api.sarvam.ai/text-to-speech -H "Content-Type: application/json" -H "api-subscription-key: $SARVAM_TTS_API_KEY" -d "$body")
  local err; err=$(echo "$resp" | jq -r '.error.message // empty')
  [[ -z "$err" ]] || { echo "ERROR tts [$2/$3]: $err" >&2; return 1; }
  echo "$resp" | jq -r '.audios[0] // empty' | base64 -d > "$4"
  [[ -s "$4" ]] || { echo "ERROR tts [$2/$3]: empty audio" >&2; return 1; }
}
encode() { afconvert -f m4af -d aac -b 64000 "$1" "$2"; } # wav -> m4a, 64 kbps
report() { echo "OK $(basename "$1") $(( $(stat -f%z "$1") / 1024 )) KB"; }
needed() { [[ ! -f "$1" || "${FORCE:-0}" == "1" ]] || { echo "SKIP $(basename "$1") (exists)"; return 1; }; }

# Greetings: from the demo seed greeting map (packages/db/src/seed-data.ts)
GREET=(
"en|en-IN|Hello, Sunrise Dental Care. How may I help you today?"
"hi|hi-IN|नमस्ते, सनराइज़ डेंटल केयर में आपका स्वागत है। बताइए, हम आपकी कैसे मदद कर सकते हैं?"
"kn|kn-IN|ನಮಸ್ಕಾರ, ಸನ್‌ರೈಸ್ ಡೆಂಟಲ್ ಕೇರ್. ನಾನು ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?"
"ta|ta-IN|வணக்கம், சன்ரைஸ் டென்டல் கேர். நான் உங்களுக்கு எப்படி உதவலாம்?"
"te|te-IN|నమస్కారం, సన్‌రైజ్ డెంటల్ కేర్. నేను మీకు ఎలా సహాయం చేయగలను?"
)
for row in "${GREET[@]}"; do
  IFS='|' read -r code lang text <<<"$row"
  out="$OUTDIR/greet-$code.m4a"
  needed "$out" || continue
  tts "$text" "$lang" "$RECEPTIONIST" "$TMP/greet-$code.wav"
  encode "$TMP/greet-$code.wav" "$out"; report "$out"
done

# Sample call: four lines, caller and receptionist (the receptionist speaks as the clinic)
out="$OUTDIR/sample-call.m4a"
if needed "$out"; then
  LINES=(
  "$CALLER|Hi, I have a bad toothache since last night. Can I see the doctor tomorrow?"
  "$RECEPTIONIST|I'm sorry to hear that. Doctor Rao has a slot tomorrow at four thirty in the afternoon. Shall I book it for you?"
  "$CALLER|Yes please, four thirty works. My name is Ananya."
  "$RECEPTIONIST|Done, Ananya. You're booked at Sunrise Dental Care for tomorrow at four thirty. You'll get a confirmation message shortly."
  )
  i=0; WAVS=()
  for row in "${LINES[@]}"; do
    IFS='|' read -r spk text <<<"$row"
    tts "$text" "en-IN" "$spk" "$TMP/line$i.wav"; WAVS+=("$TMP/line$i.wav"); i=$((i+1))
  done
  python3 - "$TMP/sample.wav" "${WAVS[@]}" <<'PY'
import sys, wave
out, parts = sys.argv[1], sys.argv[2:]
with wave.open(parts[0], "rb") as w0:
    params = w0.getparams()
with wave.open(out, "wb") as o:
    o.setparams(params)
    gap = b"\x00" * (int(params.framerate * 0.35) * params.nchannels * params.sampwidth)
    for i, p in enumerate(parts):
        with wave.open(p, "rb") as w:
            assert w.getframerate() == params.framerate and w.getnchannels() == params.nchannels
            o.writeframes(w.readframes(w.getnframes()))
        if i < len(parts) - 1:
            o.writeframes(gap)
PY
  encode "$TMP/sample.wav" "$out"; report "$out"
fi

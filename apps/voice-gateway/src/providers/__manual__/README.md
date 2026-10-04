# Manual vendor checks

Real network, real keys; never run in CI and excluded from vitest.

**Use synthetic input only** (generated speech, made-up names and numbers). These scripts print
transcripts and model output, so never feed them real caller audio or patient data.

    SARVAM_TTS_API_KEY=... npx tsx apps/voice-gateway/src/providers/__manual__/tts.ts
    SARVAM_TTS_API_KEY=... npx tsx apps/voice-gateway/src/providers/__manual__/stt.ts file.pcm
    source scripts/lib/aws-guard.sh && npx tsx apps/voice-gateway/src/providers/__manual__/llm.ts

Manual vendor checks (real network, real keys). Not part of vitest. Run with tsx, e.g.
  SARVAM_TTS_API_KEY=... npx tsx apps/voice-gateway/src/providers/__manual__/tts.ts
  source scripts/lib/aws-guard.sh && npx tsx apps/voice-gateway/src/providers/__manual__/llm.ts

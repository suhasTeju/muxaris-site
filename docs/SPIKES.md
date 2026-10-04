# Phase 0 Spikes: Sarvam TTS, Sarvam STT, Bedrock tool calling

Run on 2026-10-04 from `scripts/spike/` (standalone npm project; `sarvamai@1.1.10`, `ws`, `@aws-sdk/client-bedrock-runtime`). All AWS calls used profile `aws-secondary-account` (005533348545, ap-south-1) via `scripts/lib/aws-guard.sh`. Audio conversion used `ffmpeg` (`-ar 16000 -ac 1 -f s16le`).

## 1. Sarvam TTS

### REST (works)

`POST https://api.sarvam.ai/text-to-speech`, header `api-subscription-key`.

Body used: `{text, target_language_code:"en-IN", speaker:"shubh", model:"bulbul:v3", pace:1.0, speech_sample_rate:24000}`.

- Response keys: `request_id`, `audios` (array of base64 WAV, `RIFF` header). Played back audibly with `afplay`.
- Latency (74-char sentence set, ~4.7 s of audio): 1195 ms and 1446 ms total (two runs). Output ~190-220 KB WAV at 24 kHz.
- **`anushka` is rejected with `bulbul:v3`** (HTTP 400): `Speaker 'anushka' is not compatible with model bulbul:v3. Available speakers for bulbul:v3 are: aditya, ritu, ashutosh, priya, neha, rahul, pooja, rohan, simran, kavya, amit, dev, ishita, shreya, ratan, varun, manan, sumit, roopa, kabir, aayan, shubh, advait, anand, tanya, tarun ...` (list truncated at 300 chars by the spike). `anushka` is a bulbul:v2 speaker. Used `shubh` on `bulbul:v3` (no fallback to v2 needed).
- Bogus key (`SARVAM_TTS_API_KEY=bogus`): `tts-rest failed: status=403 body={"error":{"message":"Invalid or missing authentication credentials","code":"invalid_api_key_error","request_id":"..."}}`, exit 1.

### WebSocket streaming (works): decision = use WS

Found in `sarvamai` SDK (`dist/cjs/api/resources/textToSpeechStreaming`):

- URL: `wss://api.sarvam.ai/text-to-speech/ws?model=bulbul:v3&send_completion_event=true`
- Auth: header `Api-Subscription-Key: <key>` (SDK also passes WS subprotocol `api-subscription-key.<key>`; the spike sent both and it worked, header-only was not tested separately). Open took ~209 ms.
- Client messages (SDK wire format; the config field is `language_code`, not `target_language_code`):

```json
{"type":"config","data":{"language_code":"en-IN","speaker":"shubh","pace":1,"speech_sample_rate":24000,"output_audio_codec":"wav","min_buffer_size":30,"max_chunk_length":150}}
{"type":"text","data":{"text":"Namaskara. Doctor Rao is available tomorrow at 4:30 PM. Should I book it?"}}
{"type":"flush"}
```
  `{"type":"ping"}` also exists (keep-alive). Other SDK config fields: `pitch`, `loudness` (v2 only), `enable_preprocessing`, `output_audio_bitrate`, `dict_id`. SDK defaults: sample rate 22050, codec `mp3`.
- Server messages observed (audio payload elided here):

```json
{"type":"audio","data":{"request_id":"20261004_b746a44a-7109-4ad3-93b9-7eca8deebbb2","content_type":"audio/wav","audio":"<base64>"}}
{"type":"event","data":{"event_type":"final"}}
```
  With codec `wav` the first audio message is just the 44-byte WAV header (60 base64 chars), followed by 12 chunks of ~16 KB (21848 base64 chars) and a last smaller one; the `final` event arrives after the last chunk (needs `send_completion_event=true`). The socket then closed with code 1005 (we closed it).
- With `output_audio_codec:"linear16"` the messages have `content_type:"audio/pcm"` and no header message (raw PCM16 at the configured rate).
- Latency (clock starts before the handshake; open itself took ~209 ms): the first message (WAV header only) arrived at 240 ms; the first real audio chunk at 337 ms (second run), i.e. roughly 130 ms after the socket opened. Total 1.08-1.22 s for the whole sentence. REST needed 1.2-1.4 s before any audio.
- **Multiple text+flush cycles on one socket work** (`scripts/spike/sarvam-tts-multi.ts`, linear16): config once, then `text`+`flush` for sentence 1; after its `final` event, `text`+`flush` for sentence 2 on the same socket. Observed: sentence 1 -> 5 audio msgs and `{"type":"event","data":{"event_type":"final"}}` at +774 ms (sent at +301 ms); sentence 2 sent at +774 ms -> 7 more audio msgs and a second `final` at +1398 ms. Each flush produced its own audio and its own `final`, so one socket per call can serve every sentence of the conversation. Not tested: sending sentence 2 before sentence 1's `final` (pipelined) and long idle gaps (use `ping`).
- Bogus key on the REST path gives 403 (see above); the WS path for a bad key was not run separately.

## 2. Sarvam STT streaming (works)

- URL: `wss://api.sarvam.ai/speech-to-text/ws?model=saaras:v4&language-code=unknown&mode=codemix&sample_rate=16000&input_audio_codec=pcm_s16le&vad_signals=true`, header `Api-Subscription-Key`. All params accepted, including `mode=codemix` and `language-code=unknown` (no fallback needed).
- Input: the TTS WAV converted to 16 kHz mono s16le PCM, sent as 100 ms frames paced in real time:
  `{"audio":{"data":"<base64 pcm>","sample_rate":"16000","encoding":"audio/wav"}}`, then `{"type":"flush"}`.
- Socket open: 222 ms.
- Server messages, verbatim:

```json
{"type":"events","data":{"signal_type":"START_SPEECH","occured_at":1791106485.8072073}}
{"type":"events","data":{"signal_type":"END_SPEECH","occured_at":1791106489.7754269}}
{"type":"data","data":{"request_id":"20261004_74759006-93a5-40fa-9415-ef1169dd6ca4","transcript":"Namaskara. Dr. Rao is available tomorrow at 4:30 PM. Should I book it?","timestamps":null,"diarized_transcript":null,"language_code":"en-IN","language_probability":0.995,"audio_hash":null,"audio_mime":null,"metrics":{"audio_duration":4.736,"processing_latency":0.12970685958862305}}}
```
  (`occured_at` is the server's spelling, unix seconds.)
- Timing: START_SPEECH ~426 ms after open (648 ms since start); the audio ended at ~4577 ms; END_SPEECH at 4615 ms; the `data` transcript came at 4815 ms, i.e. ~240 ms after our last audio frame / ~200 ms after END_SPEECH. `processing_latency` reported 0.13 s. There were no partial transcripts: one final `data` message per VAD-delimited utterance, delivered after END_SPEECH.
- Transcript quality: accurate ("Dr. Rao" for "Doctor Rao", numerals normalised "4:30 PM"). Input was clean synthetic speech, so real telephony audio (8 kHz, noise) is untested.
- Oddity: the frame says `"encoding":"audio/wav"` while the payload is raw PCM s16le with no WAV header; the server accepted it (the codec is declared by the `input_audio_codec=pcm_s16le` query param), so keep both consistent and do not wrap frames in WAV.
- Close: after our client-side `ws.close()` (4 s after flush) the observed close was code `1005`, empty reason (no server-initiated close or error occurred). The spike now exits non-zero if no `data` transcript arrives.
- Second run: socket open 122 ms, transcript 209 ms after the last audio frame.
- Bogus key: `stt-ws failed: status=403 body=Forbidden`, exit 1 (HTTP upgrade rejected).

## 3. Bedrock tool calling (Nova verified; Anthropic blocked by payment instrument)

- `aws bedrock list-inference-profiles --query ... haiku-4-5` returned: `global.anthropic.claude-haiku-4-5-20251001-v1:0` and `in.anthropic.claude-haiku-4-5-20251001-v1:0`. There is **no `apac.` profile** for Haiku 4.5 in ap-south-1 (`apac.anthropic...` -> `ValidationException: The provided model identifier is invalid`).
- Bare `anthropic.claude-haiku-4-5-20251001-v1:0` -> `ValidationException: Invocation of model ID ... with on-demand throughput isn't supported. Retry your request with the ID or ARN of an inference profile`.
- **Root cause of the earlier 404s:** the account had not submitted the Anthropic use-case form (`aws bedrock get-use-case-for-model-access` -> `ResourceNotFoundException: You have not filled out the request form`), giving `ResourceNotFoundException: Model use case details have not been submitted for this account`. Submitting it with `put-use-case-for-model-access` fixed that, with propagation taking under 40 minutes. During propagation, calls flipped between success and 404; the single early success is explained by that.
- **One successful call** (before the form was fixed, prompt had no date) on `global.anthropic.claude-haiku-4-5-20251001-v1:0`: `first-token=860 ms total=1102 ms stopReason=end_turn`; no tool call, the model asked: "I'd be happy to help you book a teeth cleaning tomorrow afternoon! Could you please provide tomorrow's date in YYYY-MM-DD format so I can check our available slots?" The system prompt must therefore carry the current date (the script now derives it from `new Date()` in Asia/Kolkata).
- **Current blocker (Anthropic only):** with the use-case form already submitted, Anthropic models on this account return HTTP 403 `AccessDeniedException: Model access is denied due to INVALID_PAYMENT_INSTRUMENT:A valid payment instrument must be provided.. Your AWS Marketplace subscription for this model cannot be completed at this time.` until a valid payment method is added to account 005533348545 (Marketplace subscription). Haiku 4.5 tool calling is therefore unverified; Amazon Nova works without it (below).

### Observed Converse tool-call stream on Amazon Nova

Prompt: system "You are Muxaris, the receptionist for Sunrise Dental Care. Use tools to check availability before offering times. Today is 2026-10-04 (Asia/Kolkata). ...", user "Hi, I need a teeth cleaning tomorrow afternoon.", all nine `ASSISTANT_TOOLS` in `toolConfig`.

`global.amazon.nova-2-lite-v1:0` (ConverseStream): `first-token=1107 ms total=1113 ms stopReason=tool_use`; `find_slots` fired, no text, no `<thinking>` block. Events verbatim:

```json
{"messageStart":{"role":"assistant"}}
{"contentBlockStart":{"start":{"toolUse":{"toolUseId":"tooluse_RFSTw0vUEJBYPxBU3kfgmi","name":"find_slots"}},"contentBlockIndex":0}}
{"contentBlockDelta":{"delta":{"toolUse":{"input":"{\"date\":\"2026-10-05\",\"part_of_day\":\"afternoon\",\"service_id\":\"teeth_cleaning\"}"}},"contentBlockIndex":0}}
{"contentBlockStop":{"contentBlockIndex":0}}
{"messageStop":{"stopReason":"tool_use"}}
{"metadata":{"usage":{"inputTokens":2040,"outputTokens":57,"totalTokens":2097},"metrics":{"latencyMs":926}}}
```

Parsed input: `{"date":"2026-10-05","part_of_day":"afternoon","service_id":"teeth_cleaning"}` (valid JSON; date correctly derived as tomorrow). Note the whole input arrived in one delta fragment, and `first-token` here is the time to `messageStart`-adjacent `contentBlockStart`, so effective time-to-tool-call is about 1.1 s (the 1105 ms before `messageStart` is model latency; `metadata.metrics.latencyMs`=926). A second run with the clarified utterance ("I want a teeth cleaning tomorrow afternoon, please check what times are free.") gave the same `find_slots` call, first-token 914 ms, total 919 ms. `service_id:"teeth_cleaning"` is a guessed id: the model did not look it up, so the prompt/tool descriptions should steer it to call `get_clinic_info` or list services for real ids.

`apac.amazon.nova-pro-v1:0`: `first-token=505 ms total=841 ms stopReason=tool_use`. It emitted a text block first: deltas `"<thinking"`, `">"`, ` I`, ` need`, ... streamed token by token (`contentBlockIndex":0`), total text `"<thinking> I need to check the availability for teeth cleaning appointments tomorrow afternoon. </thinking>\n"`, then `contentBlockStop` (index 0), then the tool block at `contentBlockIndex":1`:

```json
{"contentBlockStart":{"start":{"toolUse":{"toolUseId":"tooluse_UvUJyCxbRx0BwbVkSiJMqR","name":"find_slots"}},"contentBlockIndex":1}}
{"contentBlockDelta":{"delta":{"toolUse":{"input":"{\"date\":\"2026-10-05\",\"part_of_day\":\"afternoon\"}"}},"contentBlockIndex":1}}
{"contentBlockStop":{"contentBlockIndex":1}}
{"messageStop":{"stopReason":"tool_use"}}
{"metadata":{"usage":{"inputTokens":1704,"outputTokens":52,"totalTokens":1756},"metrics":{"latencyMs":695}}}
```

Parsed input: `{"date":"2026-10-05","part_of_day":"afternoon"}`. So Nova Pro emits `<thinking>...</thinking>` text before the tool call, and its `first-token` (505 ms) is a thinking token, not speakable content. The script's built-in candidate order is `BEDROCK_MODEL_ID`, `apac.anthropic...`, bare `anthropic...`, `global.anthropic...`, then `global.amazon.nova-2-lite-v1:0` (and logs every stream event).

- Re-run for Anthropic when fixed: `source scripts/lib/aws-guard.sh && npx tsx scripts/spike/bedrock-tools.ts` (optionally `USER_TEXT="..."`, `BEDROCK_MODEL_ID=...`). Failures print `bedrock-converse failed: status=... body=...` and exit 1.

## Decisions for Phase 1

- **TTS: use the WebSocket** (`wss://api.sarvam.ai/text-to-speech/ws`) per call, config once, send each LLM sentence as a `text` message plus `flush`; use `output_audio_codec:"linear16"` to skip WAV headers (set the sample rate to what the telephony leg needs). First audio ~130 ms after the handshake vs 1.2 s+ for REST. Keep REST as fallback.
- **TTS speaker/model:** `bulbul:v3` + `shubh` (or another v3 speaker); `anushka` only works on bulbul:v2. Make speaker a per-clinic config validated against the v3 list.
- **STT: use `wss://api.sarvam.ai/speech-to-text/ws`** with `saaras:v4`, `mode=codemix`, `language-code=unknown`, `vad_signals=true`, 16 kHz PCM16 in 100 ms frames. Treat `END_SPEECH` as the end-of-turn cue: the final `data` transcript arrives ~200 ms later (no partials), so barge-in must key off `START_SPEECH`, not transcripts. Resample 8 kHz telephony audio to 16 kHz first.
- **LLM adapter:** reads `BEDROCK_MODEL_ID`; default `global.amazon.nova-2-lite-v1:0` for now, switching to `global.anthropic.claude-haiku-4-5-20251001-v1:0` once the account payment instrument is fixed. The adapter must strip `<thinking>...</thinking>` blocks from streamed text before sending it to TTS (Nova Pro emits them; 2-lite did not). The tool-call stream shape (`contentBlockStart.toolUse{toolUseId,name}` -> `contentBlockDelta.toolUse.input` fragments -> `contentBlockStop` -> `messageStop.stopReason="tool_use"`) is the Converse API's and identical across models, so the fallback is safe; accumulate input fragments per `contentBlockIndex` and parse at `contentBlockStop`.
- **Bedrock ids:** inference profile ids only (no on-demand bare ids; no `apac.` profile for Haiku 4.5). Inject current date/time/timezone into the system prompt. Nova 2 Lite measured ~0.9-1.1 s to the tool call; Haiku ~0.9 s first token (one early observation). Budget the voice turn: STT ~0.2 s + LLM ~0.9 s + TTS ~0.15 s.
- **Prerequisite:** the Anthropic use-case form must be submitted (done) and the AWS account needs a valid payment instrument for the Marketplace subscription; tool-calling must still be verified once that is fixed.
- Error handling: all Sarvam auth failures surface as 403 (REST body JSON `invalid_api_key_error`; WS upgrade `Forbidden`).

# Telephony

Phone calls reach the same voice session as browser calls. Everything here is off unless
`TELEPHONY_PROVIDER=twilio` (API and voice gateway); with it unset the webhook returns 404 and the
gateway refuses `/v1/telephony/twilio` upgrades.

## Flow (Twilio)

1. A caller dials a Twilio number. Twilio POSTs the voice webhook
   `https://api.muxaris.com/webhooks/telephony/twilio` (form-encoded `From`, `To`, `CallSid`).
2. The API verifies `X-Twilio-Signature` (HMAC-SHA1 over the full URL plus the sorted POST
   parameters, keyed by the auth token) before touching the database. A mismatch is a 403.
3. The API looks up `To` in `phone_numbers`. An unknown number gets TwiML that says
   "This number is not configured." and hangs up. A known one gets TwiML that opens a media stream
   to `VOICE_WSS_URL/v1/telephony/twilio`, carrying one parameter, `token`: a 5-minute HMAC token
   binding `CallSid`, the clinic and the caller's number (`From`, as signed by Twilio).
4. The gateway accepts the WebSocket, waits for Twilio's `start` event (5 s), verifies the token
   (invalid, expired or minted for another call: close `4001`, no call row is written), then runs the
   usual plan-quota and concurrency checks and creates the call with `channel = "phone"` and
   `callerPhone` taken from the token (the stream's own parameters are ignored).
5. Audio: Twilio sends base64 μ-law 8 kHz, which is decoded and upsampled to PCM16 16 kHz for STT.
   TTS PCM16 24 kHz is downsampled to 8 kHz, μ-law encoded and sent in 160-byte (20 ms) frames.
   Barge-in sends Twilio a `clear` event. Other gateway events have nothing to render on a phone.

Phone numbers and tokens are never logged; the webhook logs only `{ callSid, clinicId }`.

## Caller identity

The caller ID is spoofable. It is an unverified binding only: the assistant can act on bookings for
that number and does lookups with minimal PII, and `verifiedPhone` stays unset on phone sessions.
OTP verification (`verifiedPhone`, the Phase 3 hook in `apps/voice-gateway/src/session/tools.ts`)
is the precondition before serving the public. The number is never logged.

## Setup

1. Buy a voice-capable number in the Twilio console.
2. Set its "A call comes in" webhook to `POST https://api.muxaris.com/webhooks/telephony/twilio`.
   `PUBLIC_API_URL` must equal exactly the origin Twilio calls (it is part of the signed string).
3. Configure both the API and the voice gateway:

   | Variable                  | Where        | Value                                              |
   | ------------------------- | ------------ | -------------------------------------------------- |
   | `TELEPHONY_PROVIDER`      | API, gateway | `twilio`                                           |
   | `TWILIO_AUTH_TOKEN`       | API          | the account auth token                             |
   | `TELEPHONY_STREAM_SECRET` | API, gateway | the same random secret on both (for example `openssl rand -hex 32`) |
   | `PUBLIC_API_URL`          | API          | `https://api.muxaris.com`                          |
   | `VOICE_WSS_URL`           | API          | `wss://voice.muxaris.com`                          |

   **On AWS** the task definitions carry `TELEPHONY_PROVIDER`, `PUBLIC_API_URL` (derived as
   `https://api.muxaris.com`, never read from `.env`) and `VOICE_WSS_URL`; the two secrets come
   from `muxaris/app`. Put `TWILIO_AUTH_TOKEN` and `TELEPHONY_STREAM_SECRET` in `.env` and run
   `scripts/bootstrap-aws.sh --secrets` (it merges into the existing secret, so other keys
   survive), set `TELEPHONY_PROVIDER=twilio` (the `TELEPHONY_PROVIDER` repository variable in CI,
   or `.env` for a laptop deploy), then redeploy `MuxarisServices`.

4. Map the number to a clinic (E.164, exactly as Twilio sends `To`):

   ```sql
   INSERT INTO phone_numbers (id, clinic_id, e164, provider)
   VALUES ('pn_' || substr(md5(random()::text), 1, 16), 'cl_xxxxxxxx', '+14155550123', 'twilio');
   ```

   The call's language is the clinic's first configured language.

The gateway counts concurrent calls per process, as for browser sessions, so the plan's concurrency
limit applies per instance.

## Exotel (not implemented)

`apps/voice-gateway/src/telephony/exotel-transport.ts` is a stub whose constructor throws. Expected
mapping onto `MediaTransport`, from Exotel's Voicebot Applet (verify each point against the current
Exotel documentation before building):

| MediaTransport               | Exotel Voicebot (expected)                                   |
| ---------------------------- | ------------------------------------------------------------ |
| `onInboundAudio` (16 kHz)    | media frames, 8 kHz PCM16 (to upsample 2x, as for Twilio)    |
| `sendAudio` (24 kHz)         | downsample to 8 kHz PCM16, send as media frames              |
| `sendEvent(flush_playback)`  | Exotel's equivalent of `clear` (unknown)                     |
| `onClose` / `close`          | stop event / WebSocket close                                 |

Unknowns to verify: the codec and sample rate (the 8 kHz PCM claim above), the JSON envelope (event
names, base64 versus binary frames, chunk size), how the call identifiers and caller number arrive,
and authentication. Twilio's signed webhook plus stream token does not carry over: Exotel's applet
fetches a WebSocket URL, so the stream token would have to ride in that URL or an equivalent header.
There is also no inbound-webhook route for Exotel yet; the same `phone_numbers` table
(`provider = 'exotel'`) is the intended mapping.

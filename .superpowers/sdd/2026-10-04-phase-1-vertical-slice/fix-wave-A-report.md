# Fix wave A report

- A1 (slot validation): `assertBookable` in packages/core/src/services/scheduling.ts reuses `findSlots` in stages (hours, grain, holiday, time off, horizon, lead) to name the failing rule; runs after the doctor lock in book and reschedule. `CoreError` gained `reason` and code `slot_unavailable` (conflict/full overlaps now reason `conflict`/`full`). `allowOutsideRules` (also accepted on POST /appointments and PATCH reschedule) bypasses hours/lead/grain only. API: 409 `{ error: { code, message, reason }, reason }`. Tests: slot-validation.test.ts (each reason, voice path, bypass, reschedule).
- A2 (verifier): JWKS FetchError/NonRetryableFetchError/JwksNotAvailableInCacheError/JwksValidationError/Abort/Timeout -> AuthUnavailableError (503); JWT claim/signature errors stay 401; Cognito UserNotFoundException -> 401 (parked D).
- A3 (bounds): shared/api.ts bounds on every body; bodyLimit 64 KiB (/v1) and 16 KiB (demo-requests), 413 `payload_too_large`.
- A4: MAX_CLINICS_PER_USER = 5, `clinic_limit` (409), per-user row lock; comment notes no write limiter until Phase 5 WAF.
- Minors: 6 resolved by A1; 7 done (clinic-tz default window, 62-day cap, limit/offset default 500); 9 documented (403 kept); 10 finishCall only updates in_progress calls, a second finish returns the first result; 12 via H.
- Skipped: 5 (maxPerSlot inert) because making it meaningful needs concurrency semantics in the engine, beyond the rulings; 8 and 11 are Phase 5 / acceptable per the review.
- Parked C: GET /doctors has workingHours; appointment responses carry patient { name, phoneMasked } (maskPhone in shared). Parked H: .env.example AUTH_MODE=cognito.
- Existing tests changed: booking conflicts now expect code slot_unavailable/reason conflict (core + api); two tests used an off-grid 13:10 and now use 13:15; clinics tests use fresh users where they exceeded the 5-clinic cap.

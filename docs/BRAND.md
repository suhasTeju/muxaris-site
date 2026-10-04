# Muxaris Brand: imagery and audio

Visual system: Fraunces (display) + Inter (text) on paper `#fafaf7`, accent green `#16a34a`.

## Art direction

Editorial photography feel, warm natural light, real Indian clinic interiors and people, a muted palette that sits on `#fafaf7` paper, no text in images, no stock-photo smiles, 35 mm film grain, shallow depth of field.

Every prompt is sent as `<prompt> <style suffix>`, where the style suffix is:

> Editorial photography, warm natural light, real Indian setting, muted palette (warm off-white, soft greens, natural wood) that sits on an off-white paper background, 35mm film grain, shallow depth of field, candid and unposed, no stock-photo smiles. Absolutely no text, letters, numbers, logos or signage anywhere in the image.

Images are generated with `gpt-image-2` (`scripts/gen-image.sh`), converted to WebP (`cwebp`, quality 82, max 1600 px wide, under 250 KB) by `scripts/gen-assets.sh`. Re-run is idempotent (`FORCE=1` regenerates; pass asset names to regenerate specific ones).

## Prompts

| File | Size | Prompt |
|---|---|---|
| `hero-clinic.webp` | 1536x1024 | A small modern dental clinic reception in Bengaluru in morning light, an empty front desk with a phone whose handset is slightly lifted as if a call is ringing, indoor plants, warm wood, calm and uncluttered. |
| `step-call.webp` | 1024x1024 | Close-up of an Indian woman in her 30s on a phone call outdoors, looking relieved, city street background softly blurred. |
| `step-calendar.webp` | 1024x1024 | Over-the-shoulder view of a dentist's appointment calendar on a tablet in a clinic, calendar blocks shown only as abstract colored shapes with no readable text. |
| `step-confirm.webp` | 1024x1024 | A hand holding a phone showing a blurred message confirmation, a clinic waiting area softly out of focus behind. |
| `spec-dental.webp` | 1024x1024 | Interior detail of a dental clinic: dental chair, overhead light and instrument tray, quiet and clean. |
| `spec-skin.webp` | 1024x1024 | Interior detail of a dermatology clinic: treatment room with soft light, skincare tray and neatly folded towels. |
| `spec-eye.webp` | 1024x1024 | Interior detail of an eye clinic: an eye examination chair with a phoropter and a trial lens set. |
| `spec-physio.webp` | 1024x1024 | Interior detail of a physiotherapy clinic: treatment bed, resistance bands and exercise balls in soft daylight. |
| `spec-diagnostic.webp` | 1024x1024 | Interior detail of a diagnostic lab: sample collection counter, rows of test tubes in a rack, clean surfaces. |
| `og-card.webp` | 1536x1024 | Abstract warm paper texture in off-white with a soft green sound-wave arc sweeping across it, minimal and calm, large empty space. |

## Usage

| File | Landing section |
|---|---|
| `/img/hero-clinic.webp` | Hero |
| `/img/step-call.webp` | How it works, step 1 (call comes in) |
| `/img/step-calendar.webp` | How it works, step 2 (booking) |
| `/img/step-confirm.webp` | How it works, step 3 (confirmation) |
| `/img/spec-dental.webp` | Specialties: dental |
| `/img/spec-skin.webp` | Specialties: dermatology |
| `/img/spec-eye.webp` | Specialties: eye care |
| `/img/spec-physio.webp` | Specialties: physiotherapy |
| `/img/spec-diagnostic.webp` | Specialties: diagnostics |
| `/img/og-card.webp` | Open Graph / social share card |

## Audio

`scripts/gen-audio.sh` uses Sarvam `bulbul:v3` (REST), 24 kHz WAV encoded to AAC `.m4a` at 64 kbps with `afconvert`. Receptionist speaker `shubh`, caller speaker `priya` (`anushka` and `vidya` are bulbul:v2 only). The receptionist speaks as the clinic ("Sunrise Dental Care").

| File | Content | Landing use |
|---|---|---|
| `/audio/greet-{en,hi,kn,ta,te}.m4a` | Clinic greeting in each language (from the demo seed) | Language picker previews |
| `/audio/sample-call.m4a` | Four-line sample call, 350 ms gaps | Hero / demo player |

## Pending regeneration

`apps/web/public/audio/greet-hi.m4a` must be regenerated with `scripts/gen-audio.sh` (`FORCE=1`) because the Hindi greeting text changed to the gender-neutral plural form.

# Muxaris UI kit (`components/ui`)

This folder is the contract between the design system (T0) and the page implementers. It holds every
shared primitive, encoded with the exact values from the Claude Design prototypes in
`/Users/suhas/Downloads/application-redesign-project/project/` (the HTML source is the spec, the PNGs in
`.superpowers/sdd/redesign/design-ref/` are reference renders).

```tsx
import { Button, Card, Badge, badgeFor, useToast, Modal } from "@/components/ui";
import { PhoneCall } from "lucide-react";
```

## Rules for page implementers

1. **Use the primitives.** If the prototype draws a button, input, badge, card, tab bar, modal, toast,
   KPI tile, empty state or table head, use the component here. Do not restyle a raw `<button>`.
2. **Take every value from the prototype source**, not from taste. Where a value has a token, use the
   token class (`bg-teal`, `text-ink-3`, `rounded-9`, `shadow-rest`). Where it has none, an arbitrary
   Tailwind value is correct and expected: `text-[13.5px]`, `tracking-[-0.03em]`, `gap-[14px]`,
   `bg-[#f0faf3]`, `grid-cols-[170px_minmax(0,1fr)_130px]`.
3. **Never edit `app/globals.css` or anything in `components/ui/*`.** Five areas are being built in
   parallel on top of this commit. If you need a variant that is not here, build it next to your page
   (compose a primitive and pass `className`) and mention it in your report.
4. **Page-specific pieces live next to the page**, e.g. `components/app/overview/*` or a file beside
   the route. Shared-looking but single-use pieces still go next to the page.
5. **`className` always wins.** Every primitive merges classes through `cn()` (tailwind-merge with the
   custom radius, shadow and animation scales), so `<Button className="px-[16px]">` replaces the size's
   padding instead of fighting it.
6. Keep existing data wiring, roles, loading and error states; restyle, do not rewrite behaviour.

## The app shell already provides

- Sidebar (244px), 60px header, toast stack, and `<main id="content">` with
  `max-width:1280px; padding:28px 32px 72px` at ≥1024px (16px/24px sides, 24px top, 56px bottom
  below that). **Drop the old `px-4 py-8 sm:px-8` and `max-w-*` wrappers** from the page views; they
  now double the padding. Use a `max-w-[…px]` only if the prototype's page root sets one.
- A `ToastProvider`, so `useToast()` works in any page under `app/(app)`.
- Page background (paper `#f4f6f9` with a radial teal bloom). Pages do not paint a background.
- Each prototype page root animates in with `animation:mxIn .25s ease both`: put `animate-mx-in` on
  your page root.
- Below 1024px the sidebar is an off-canvas menu. The design has no mobile layout; keep pages usable
  at small widths (stack grids, let tables scroll) but never invent a different desktop layout.

## Fonts

Loaded in `app/layout.tsx` with `next/font/google`. Use the Tailwind families, not font names
(next/font hashes the family names).

| Variable / class                   | Stack                                                                                        | Use                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `--font-sans` / `font-sans`        | Schibsted Grotesk (variable, italic), Noto Sans Devanagari/Kannada/Tamil/Telugu, system-ui | Everything: headings, UI, body. Indic text falls back to Noto automatically |
| `--font-mono` / `font-mono`        | Geist Mono 400/500/600, ui-monospace                                                         | See below                                                                   |
| `--font-wordmark` / `font-wordmark` | Fraunces 600, Georgia                                                                        | Only inside `<Wordmark>`. Never for headings                                |

**When to use mono** (wherever the prototype says `font-family:'Geist Mono'`): times and dates
(`4:30 pm`, `Today, 1:52 pm`), phone numbers, durations (`2:14`), counts in pills, table heads,
eyebrows and labels (`MonoLabel`, `Chip`), IDs and codes, timestamps in transcripts. Mono text
sizes in the design are usually 10.5–13px; copy the exact one.

Base styles (in `@layer base`, so utilities override them): `body` is paper `#f4f6f9`, ink
`#0c1220`, 16px, line-height 1.5, antialiased. The app shell sets 14px on its root, so app pages
inherit 14px like the prototype's `body` there. Links are `#0b6b70`, hover `#0c1220`, no
underline. Selection is `#bfe9e5`. `:focus-visible` is a 2px teal outline, offset 2px.

## Colour tokens

Every token is a Tailwind colour: `bg-*`, `text-*`, `border-*`, `fill-*`, `ring-*`, and so on.
Hex values are also available as CSS variables (`var(--color-teal)`) for inline styles.

### Palette (from the swatches)

| Token       | Hex       | Typical use                                                        |
| ----------- | --------- | ------------------------------------------------------------------ |
| `ink`       | `#0c1220` | Primary text, primary buttons, active tab underline, count pills   |
| `ink-2`     | `#2c3646` | Secondary text, field labels                                       |
| `muted`     | `#5f6b7c` | Captions, hints, mono labels, table heads                          |
| `line`      | `#e2e7ee` | Card and panel borders, dividers                                   |
| `paper`     | `#f4f6f9` | Page background, secondary-button hover                            |
| `teal`      | `#0e9a96` | Accent: focus border, checked controls, active nav icon, meters    |
| `teal-ink`  | `#0b6b70` | Links, teal text on light backgrounds                              |
| `teal-soft` | `#e3f4f3` | Teal tint backgrounds, info badges                                 |
| `signal`    | `#16a34a` | "Assistant live" dot, the wordmark dot                             |
| `rose`      | `#b4234a` | Errors, danger buttons                                             |

### Neutrals

| Token         | Hex       | Use                                                       |
| ------------- | --------- | --------------------------------------------------------- |
| `surface`     | `#ffffff` | Cards, fields, modals                                     |
| `ink-hover`   | `#1d2638` | Primary button hover                                      |
| `ink-3`       | `#4a5566` | The brief's "text-2": ghost buttons, idle nav, chip text  |
| `muted-2`     | `#8a95a5` | Placeholder-grey icons, counters, tertiary text           |
| `field`       | `#d3dae3` | Input, select and secondary-button borders                |
| `chip`        | `#eef2f6` | Chip and muted-pill background, light dividers in modals  |
| `line-soft`   | `#f1f4f7` | Row dividers inside cards                                 |
| `line-strong` | `#c3ccd7` | Checkbox border, switch off, dashed buttons               |
| `track`       | `#e9eef3` | Segmented control track                                   |
| `subtle`      | `#f8fafc` | Soft fields, row hover, grouped-table headers             |
| `surface-2`   | `#fbfcfd` | Table heads, modal footers                                |

### Teal family

| Token         | Hex       | Use                                    |
| ------------- | --------- | -------------------------------------- |
| `teal-tint`   | `#e9f6f5` | Very light teal panels                 |
| `teal-line`   | `#c6e8e5` | Teal borders, spinner track            |
| `teal-border` | `#9fd8d3` | Selected-card border                   |
| `teal-hover`  | `#b9e3e0` | Linked KPI card hover border           |
| `teal-deep`   | `#0b5459` | Text on teal tints                     |
| `teal-bright` | `#5ee0d6` | Bright accent on dark backgrounds      |
| `selection`   | `#bfe9e5` | Text selection                         |

### Status tones (the design's `TONES` map)

Use them through `Badge`, `Chip` and `badgeFor()`; the classes exist for one-offs (`bg-good-bg`).

| Tone    | `-bg`     | `-fg`     | `-dot`    |
| ------- | --------- | --------- | --------- |
| `good`  | `#e7f6ec` | `#15803d` | `#16a34a` |
| `warn`  | `#fdf1dc` | `#8a4b00` | `#d98a14` |
| `bad`   | `#fdecef` | `#b4234a` | `#e04870` |
| `muted` | `#eef2f6` | `#4a5566` | `#8a95a5` |
| `info`  | `#e3f4f3` | `#0b6b70` | `#0e9a96` |

### Rose, amber, green, glass

| Token          | Hex                     | Use                                             |
| -------------- | ----------------------- | ----------------------------------------------- |
| `rose-soft`    | `#fdecef`               | Error notice background, danger hover           |
| `rose-dot`     | `#e04870`               | Usage meter when ≥90%, urgent dots              |
| `rose-line`    | `#f5c6d1`               | Error notice border, danger-outline border      |
| `rose-deep`    | `#8f1c3b`               | Error notice text, danger hover                 |
| `rose-invalid` | `#e48aa0`               | Invalid field border                            |
| `amber`        | `#d98a14`               | Warning dots                                    |
| `amber-ink`    | `#8a4b00`               | Warning text                                    |
| `amber-soft`   | `#fdf1dc`               | Warning backgrounds                             |
| `amber-deep`   | `#6d3c00`               | Text on amber-soft notices                      |
| `amber-bright` | `#f0b44c`               | Amber accents on dark backgrounds               |
| `green-soft`   | `#e7f6ec`               | Success backgrounds                             |
| `green-ink`    | `#15803d`               | Success text                                    |
| `glass`        | `rgba(12,18,32,0.92)`   | Toast background (dark glass)                   |
| `glass-text`   | `#eef0f4`               | Text on glass / dark panels                     |
| `glass-muted`  | `#aeb6c4`               | Muted text on glass, toast dismiss              |
| `toast-bad`    | `#f7a8bb`               | Toast icon tile, bad                            |
| `toast-info`   | `#cfe9ff`               | Toast icon tile, info                           |
| `accent-bright`| `#7fe6dc`               | Toast good tile, toast action link, dark accents|

### Legacy aliases (for unmigrated pages only)

These keep the old pages compiling and coherent. **Do not use them in new code**; use the real
token. `accent`/`accent-deep`/`accent-soft`/`accent-ink` → teal / teal-ink / teal-soft / teal-ink;
`accent-btn` `#0c1220`, `accent-btn-hover` `#1d2638`, `on-accent` `#fff`; `danger` → rose,
`danger-soft` → rose-soft; `ink-deep` `#080d18`, `ink-raised` `#151e35`; `dark-text` `#eef0f4`,
`dark-muted` `#aeb6c4`, `dark-line` `rgb(255 255 255/.1)`; `rounded-card` 16px, `rounded-inner`
12px; `shadow-lift`, `shadow-card`; `font-display`, `font-body` → the sans stack. The `.mx-*`
classes in globals.css (`.mx-btn-primary`, `.mx-card`, `.mx-dark`, …) are retargeted to the new
colours for the marketing pages and are not for app pages.

## Radii, shadows, animation

Radii: `rounded-5` `-6` `-7` `-8` `-9` `-10` `-11` `-12` `-14` `-16` `-18` `-20` (px as named) and
`rounded-pill` (999px). Prefer these over `rounded-lg`/`rounded-xl` (Tailwind's defaults are not the
design's values).

| Shadow             | Value                                                                  | Use                                |
| ------------------ | ---------------------------------------------------------------------- | ---------------------------------- |
| `shadow-rest`      | `0 1px 2px rgba(12,18,32,0.04)`                                        | Cards at rest                      |
| `shadow-nav`       | `0 1px 2px rgba(12,18,32,0.05)`                                        | Active sidebar item                |
| `shadow-seg`       | `0 1px 2px rgba(12,18,32,0.1)`                                         | Selected segment                   |
| `shadow-hover`     | `0 12px 28px -18px rgba(12,18,32,0.3)`                                 | Card hover lift                    |
| `shadow-drawer`    | `0 30px 80px -30px rgba(12,18,32,0.45)`                                | Drawers                            |
| `shadow-dialog`    | `0 40px 100px -30px rgba(12,18,32,0.55)`                               | Dialogs, bottom sheets             |
| `shadow-toast`     | `0 20px 40px -16px rgba(12,18,32,0.5)`                                 | Toasts                             |
| `shadow-knob`      | `0 1px 3px rgba(12,18,32,0.25)`                                        | Switch knob                        |
| `shadow-highlight` | `inset 0 1px 0 rgba(255,255,255,0.14)`                                 | Primary (ink) buttons              |
| `shadow-cta`       | highlight + `0 10px 24px -10px rgba(12,18,32,0.5)`                     | Big ink call-to-action buttons     |
| `shadow-focus`     | `0 0 0 4px rgba(14,154,150,0.14)`                                      | Focus ring on fields               |

Animation utilities: `animate-mx-in` (mxIn .25s), `animate-mx-toast` (.25s), `animate-mx-sheet`
(.25s), `animate-mx-fade` (.2s), `animate-mx-spin` (.8s linear infinite), `animate-mx-pulse` (2.4s
infinite), `animate-mx-caret` (1s step-end infinite). For other durations or keyframes use an
arbitrary value: `animate-[mxIn_.3s_ease_both]`, `animate-[mxBar_1s_ease-in-out_infinite]`.

Keyframes defined globally: `mxIn`, `mxToast`, `mxPulse`, `mxPulseAmber`, `mxSpin`, `mxBar`,
`mxSheet`, `mxFade`, `mxCaret`, `mxMarquee`, `mxFloat`. Some names mean different things in different
prototypes; the canonical name has the **App** values, and the variants carry a suffix:

| Name         | Values                    | Used by                           |
| ------------ | ------------------------- | --------------------------------- |
| `mxIn`       | translateY 6px → 0        | App pages                         |
| `mxIn8`      | translateY 8px → 0        | Site (landing, pricing, …)        |
| `mxPulse`    | 8px green ring            | App ("Assistant live")            |
| `mxPulse10`  | 10px green ring           | Site, Auth                        |
| `mxBar`      | scaleY .3 ↔ 1             | App (voice bars)                  |
| `mxBar35`    | scaleY .35 ↔ 1            | Site, Onboarding                  |

## Icons

`lucide-react` is installed. The prototypes reference lucide-static files, `IC('phone-call')` or
`<mx-icon name="phone-call">`. Map the kebab-case name to the PascalCase export: split on `-`,
capitalise each part, join. Digits stay attached.

| Prototype name    | Import                                          |
| ----------------- | ----------------------------------------------- |
| `phone-call`      | `import { PhoneCall } from "lucide-react"`      |
| `chart-column`    | `ChartColumn`                                   |
| `settings-2`      | `Settings2`                                     |
| `layout-dashboard`| `LayoutDashboard`                               |
| `audio-lines`     | `AudioLines`                                    |
| `circle-alert`    | `CircleAlert`                                   |

Size with the `size` prop to the prototype's `width/height` (`<PhoneCall size={14} />`); colour comes
from `currentColor`, so set `text-*` on the icon or its parent. Keep lucide's default stroke width (2)
unless the prototype changes it. Icons beside text are decorative; add `aria-hidden` where a screen
reader would read noise, and an `aria-label` on icon-only buttons.

## Primitives

All accept `className` (merged last). Sizes are the pixel heights the design uses; each size carries
the radius, padding and type size the design pairs with it.

### `Button`, `ButtonLink`, `buttonClass()`

```tsx
<Button icon={Plus} onClick={…}>New appointment</Button>
<Button variant="secondary" size={34}>Export</Button>
<Button variant="ghost" iconOnly icon={X} aria-label="Close" size={32} />
<ButtonLink href="/app/assistant/try" icon={PhoneCall} block>Try your assistant</ButtonLink>
```

Props: `variant`, `size` (default 38), `icon` / `iconRight` (Lucide component), `iconSize` (override),
`block` (full width), `iconOnly` (square), plus native button props. `type` defaults to `"button"`;
pass `type="submit"` in forms. Disabled is 70% opacity, no pointer. `ButtonLink` takes `href` and
`prefetch` and renders a `next/link`. `buttonClass({variant,size,block,iconOnly,className})` returns
the class string for the rare element that must be something else.

| Variant          | Look                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------ |
| `primary`        | ink `#0c1220`, white 600, inset highlight; hover `#1d2638`                            |
| `secondary`      | white, 1px `#d3dae3`, ink 500; hover `#f4f6f9`                                       |
| `ghost`          | transparent, `#4a5566` 500; hover paper + ink                                        |
| `ghost-teal`     | transparent, teal-ink 500; hover teal-soft                                           |
| `danger`         | rose `#b4234a`, white 600; hover `#8f1c3b` (the design gives no hover; chosen)       |
| `danger-outline` | white, 1px `#f5c6d1`, rose 600; hover rose-soft                                      |
| `danger-ghost`   | transparent, rose 500; hover rose-soft                                               |
| `dashed`         | 1px dashed `#c3ccd7`, ink 500; hover teal border + teal-ink                          |

| Size | Radius | Pad x | Font  | Gap | Icon |
| ---- | ------ | ----- | ----- | --- | ---- |
| 26   | 7      | 8     | 12.5  | 6   | 13   |
| 28   | 7      | 8     | 12.5  | 6   | 13   |
| 30   | 8      | 9     | 12.5  | 6   | 13   |
| 32   | 8      | 10    | 13    | 6   | 13   |
| 34   | 9      | 12    | 13.5  | 6   | 14   |
| 36   | 9      | 12    | 13.5  | 8   | 14   |
| 38   | 10     | 14    | 14    | 8   | 15   |
| 40   | 10     | 16    | 14    | 8   | 15   |
| 44   | 12     | 18    | 14.5  | 8   | 16   |
| 48   | 12     | 20    | 15    | 10  | 18   |
| 52   | 14     | 24    | 16    | 10  | 18   |
| 56   | 16     | 24    | 16    | 10  | 18   |

If the prototype's padding or font differs from the table for that height, override with
`className` (e.g. `className="px-[16px]"`).

### `Input`, `Select`, `Textarea`

```tsx
<Input type="tel" size={40} placeholder="+91 98765 43210" />
<Input icon={Search} placeholder="Name, phone or email" soft />
<Select size={42} value={v} onChange={…}><option>…</option></Select>
<Textarea size="lg" rows={4} />
```

Common: white, 1px `#d3dae3`, ink text (placeholder is the browser default, as in the design); focus border teal + `shadow-focus`
(4px teal ring at 14%) and no outline; `aria-invalid` or `invalid` → border `#e48aa0`; disabled 70%.
`soft` gives the `#f8fafc` field that turns white on focus (filters, search bars).

`Input` props: `size` (34 | 36 | 38 | 40 default | 42 | 44 | 48), `mono` (Geist Mono at the size's
mono font), `soft`, `invalid`, `icon` (16px `#8a95a5` icon 12px from the left; text starts at 38px),
plus native props. `Select` takes `size`, `soft`, `invalid` (native select, slightly tighter padding).
`Textarea` takes `size` `"sm" | "md" (default) | "lg"`, `invalid`; resizes vertically.

| Field size | Radius | Pad x | Font | Mono font |
| ---------- | ------ | ----- | ---- | --------- |
| 34         | 8      | 9     | 13.5 | 13        |
| 36         | 9      | 8     | 13.5 | 12.5      |
| 38         | 9      | 10    | 14   | 13.5      |
| 40         | 9      | 10    | 14   | 13.5      |
| 42         | 10     | 12    | 14.5 | 13.5      |
| 44         | 10     | 12    | 15   | 14        |
| 48         | 12     | 14    | 15   | 15        |

Textarea: `sm` r8, 8/10 padding, 13.5px; `md` r9, 8/10, 14px; `lg` r10, 10/12, 14.5px, line-height 1.55.
`fieldBox(size,{mono,soft})` and `controlBase` export the class strings for custom controls.

### `Field`

```tsx
<Field label="Patient phone" hint="Ten digits" error={errors.phone}>
  <Input type="tel" />
</Field>
```

Wraps one control: renders the `<label>`, injects `id`, `aria-describedby` (hint + error) and
`aria-invalid` into the child. Props: `label`, `children` (one element), `hint` (12.5px muted),
`error` (12px rose; shown under the hint, both can show), `counter` (11px mono `#8a95a5`,
right-aligned under the control, e.g. `"42/160"`), `variant`, `id`.

| Variant   | Label                       | Gap |
| --------- | --------------------------- | --- |
| `default` | 13px 500 `#2c3646`          | 6   |
| `lg`      | 13.5px 500 `#2c3646`        | 7   |
| `muted`   | 12.5px 500 `#5f6b7c`        | 6   |
| `filter`  | 12px 500 `#5f6b7c`          | 5   |

### `Checkbox`, `Switch`

`<Checkbox label="Mon" checked={…} onChange={…} />`: native checkbox, 16px, radius 5, 1px `#c3ccd7`;
checked is teal fill with a white check (11px). The label is 13.5px with an 8px gap. Omit `label`
and pass `aria-label` for a bare box.

`<Switch checked={on} onCheckedChange={setOn} aria-label="Record calls" />`: `role="switch"`.
Sizes 22 (38×22, knob 16), 26 (44×26, knob 20, default), 28 (48×28, knob 22). Teal when on,
`#c3ccd7` when off, white knob 3px inset with `shadow-knob`. Also takes `disabled`, `id`,
`aria-labelledby`.

### `Card`

`<Card as="section" radius={16}>…</Card>`: white, 1px `#e2e7ee`, `shadow-rest`, radius 16 (or 18,
20). **No padding**: add the prototype's (`p-[18px]`, `p-[20px]`). Add `overflow-hidden` when a
table head or tinted header must clip to the corners. `as` is `div | section | article | aside | li`.

### `PageHeader`, `BackLink`, `SectionHeader`

`<PageHeader title="Calls" subtitle="Every call your assistant answered." actions={<Button…/>} />`:
h1 26px, line-height 1.15, -0.03em, 600; subtitle 14px muted; actions bottom-aligned on the right.
`maxWidth` caps the title block. `<BackLink href="/app/calls">All calls</BackLink>`: 13.5px 500
`#4a5566` with a 14px arrow.

`<SectionHeader title="Today's appointments" link={{href:"/app/appointments",label:"All appointments"}} />`:
card header row. `size="md"` (16px 18px padding, 15px title) or `"lg"` (16px 20px, 15.5px); `divider`
adds a `#eef2f6` bottom rule; `action` for a button instead of the link; `as` h2 (default) or h3. The
link is 13px teal-ink 500 with a 12px arrow.

### `Badge`, `Chip`, `MonoLabel`, `badgeFor()`

```tsx
const b = badgeFor("outcome", call.outcome); // { label: "Booked", tone: "good" }
<Badge tone={b.tone}>{b.label}</Badge>
```

`Badge`: tone pill with a dot. Props: `tone` (good | warn | bad | muted | info), `size`, `dot`
(default true), `variant` `"soft"` (default, tone bg) or `"outline"` (1px tone-bg border, no dot).
Weight 500.

| Size | Radius | Pad x | Font | Dot |
| ---- | ------ | ----- | ---- | --- |
| 18   | 5      | 6     | 11   | 5   |
| 20   | 6      | 7     | 11.5 | 6   |
| 22   | 6      | 8     | 12   | 6   |
| 24   | 7      | 9     | 12.5 | 6   |

`badgeFor(kind, value)` reads the design's `BADGES` map: kinds `appt`, `outcome`, `status`, `notif`,
`priority`, `sentiment`, `cb`. Unknown or empty values give `"Not set"` (or the raw value) in muted.

`Chip`: mono 10.5px, 0.06em, uppercase, 2px 8px, radius 6; `tone` muted (default: `#eef2f6` bg,
`#4a5566` text) or any tone. The header role label is a Chip.

`MonoLabel`: eyebrow text, Geist Mono 11px, 0.12em, uppercase, muted. `as` span (default) | p | div |
h2 | h3 | dt.

### `KpiCard`, `UsageMeter`

```tsx
<KpiCard icon={Phone} label="Calls today" value="9" hint="Average 84s" />
<KpiCard label="Minutes used this month" value="1,842" unit="/ 3,000" meter={{used:1842,included:3000}} hint="Standard plan" />
<KpiCard label="Open callbacks" value="3" href="/app/callbacks" hint="View the callback queue" hintTone="link" badge={<Badge tone="bad" size={20}>1 urgent</Badge>} />
```

Card radius 16, padding 18 (16 at the bottom with a hint). Label 13px muted with a 14px icon; value
32px 600 -0.03em; `unit` 14px muted; `hint` 12.5px (`muted` | `bad` rose | `link` teal-ink 500 with an
arrow); `meter` draws a 6px UsageMeter. With `href` the card is a link and hovers to a `#b9e3e0`
border with `shadow-hover`.

`<UsageMeter used={…} included={…} height={6} />`: `role="meter"`, track `#eef2f6`, fill teal, rose
`#e04870` at or above `USAGE_HOT_PCT` (90). `usagePct(used, included)` and `usageColors(pct)`
(`{fill, hint, hot}`; hint is `#b4234a` when hot, else `#5f6b7c`) are exported for custom layouts.

### `EmptyState`, `Notice`, `Spinner`

`<EmptyState action={<Button>Place a test call</Button>}>No calls yet.</EmptyState>`: 1.5px dashed
`#d3dae3`, radius 16, white at 60%, 15px italic muted, centred; `size` md (48px vertical) or sm (44px).

`<Notice tone="bad" title="Couldn't save">…</Notice>`: inline message box, radius 10, 10px 12px,
13.5px. Tones: `bad` (rose-soft, `#f5c6d1` border, `#8f1c3b` text, `role="alert"`), `warn` (amber-soft,
`#6d3c00`), `muted` (chip bg, ink-2, lock icon: "owner only" notes), `info` (teal-soft, teal-ink).
`icon` overrides or `null` hides the icon.

`<Spinner size={14} />`: 2px ring, `#c6e8e5` track, teal head, 0.8s.

### `TableHead`, `TableRow`, `TableGroup`

The design's tables are CSS grids, not `<table>`s:

```tsx
<Card className="overflow-hidden">
  <TableHead columns="170px minmax(0,1fr) 130px"><span>When</span><span>Caller</span><span>Outcome</span></TableHead>
  {rows.map((r) => (
    <TableRow key={r.id} columns="170px minmax(0,1fr) 130px" href={`/app/calls/${r.id}`}>…</TableRow>
  ))}
</Card>
```

`columns` is the prototype's `grid-template-columns`; `gap` (default 14); `inset` 18 (11px 18px
head padding) or 20 (10px 20px). Head: `#fbfcfd`, bottom rule, mono 10.5px 0.08em uppercase muted.
Row: `#f1f4f7` top rule, 14px; with `href` (a Link) or `onClick` it hovers to `#f8fafc`. Copy the
prototype's row padding with `className` when it differs. `TableGroup` is the day/group header row
(`#f8fafc`, 8px 18px, 12px 600 `#4a5566`).

### `Tabs`, `Segmented`

`<Tabs aria-label="Status" value={tab} onChange={setTab} items={[{id:"open",label:"Open",count:3}, …]} />`:
underline tabs. 40px tall, 0 14px, 2px bottom border; on = ink border, ink 600; off = muted 500. Count
pill is h19 mono 11px (ink/white on, chip/`#4a5566` off). Items may have `icon` or `href` (renders
Links for URL-driven tabs). Arrow keys move between tabs. Render the panel yourself.

`<Segmented aria-label="Range" value={range} onChange={setRange} items={[{id:"7d",label:"7 days"}, …]} />`:
pill switcher. Track 3px padding, radius 11; `track="bordered"` (default, `#e9eef3` + line border) or
`"plain"` (`#eef2f6`). Segments `size` 30 or 34 (default), 14px padding, radius 8, 13.5px 500; selected
is white with `shadow-seg`. `role` tablist (default) or radiogroup; items with `href` render as links.

### `Modal`

```tsx
{open ? (
  <Modal
    title="New appointment"
    width={560}
    onClose={() => setOpen(false)}
    footer={<><Button variant="secondary" size={40} onClick={…}>Cancel</Button><Button size={40} type="submit" form="new-appt">Book appointment</Button></>}
  >
    <form id="new-appt" onSubmit={…}>…</form>
  </Modal>
) : null}
```

- **Render it conditionally from client state.** It portals into `document.body` and must not render
  during the server pass.
- Behaviour: focuses the first field (or button, or `[autofocus]`), traps Tab, Escape closes, locks page
  scroll, restores focus to the trigger on close. `aria-modal`, labelled by its heading.
- `variant="dialog"` (default): centred card, overlay `rgba(12,18,32,0.32)` with 3px blur, radius 20,
  `shadow-dialog`, max height `100vh − 48px`, `mxSheet` in. Header 20/22/14 padding, 19px 600 title;
  body 0 22px 20px with 16px gap; footer `#fbfcfd`, `#eef2f6` top rule, 14px 22px, right-aligned, 8px
  gap. `width` from the prototype: **440, 520 (default) or 560**.
- `variant="drawer"`: right-hand panel 12px from the top, right and bottom edges, radius 20, 1px line,
  `shadow-drawer`; backdrop `rgba(12,18,32,0.18)` closes on click. Header 18px 20px with a bottom rule,
  18px title; body 18px 20px, 14px gap. `width` **400 (default) or 460**. The Appointments drawer is
  frosted (`rgba(255,255,255,0.96)` + 20px blur): pass
  `className="bg-[rgba(255,255,255,0.96)] backdrop-blur-[20px]"`.
- Under 640px both become a bottom sheet: full width, top corners 20, max height 92vh.
- `header` replaces the title row's left side (e.g. a badge + title + time stack); `title` is still
  required and becomes the hidden accessible name. The close button (32px, radius 9) always stays.
- In tests, query modal content through `screen` (it is not inside your render container).

The old `components/app/Modal` path re-exports this `Modal`, plus the legacy `fieldClass`,
`primaryBtn` and `ghostBtn` class strings (retargeted to the new values) that unmigrated forms import.
Migrate those forms to `Input`/`Select`/`Button` as you touch them.

### Toasts: `useToast()`

```tsx
const { toast } = useToast();
toast("Booking rules saved");
toast("Couldn't reach the server", { tone: "bad" });
toast("Appointment booked", { action: { label: "View", href: `/app/appointments?id=${id}` } });
```

Tones `good` (default), `bad`, `info`. Toasts sit bottom-right (24px; 16px on mobile), stack with a
10px gap, keep the newest three, and auto-dismiss after 4.2s (`TOAST_MS`). Look: dark glass
`rgba(12,18,32,0.92)` with 12px blur, radius 14, 280–420px wide, `shadow-toast`, 14px text; 22px icon
tile (good `#7fe6dc` check, bad `#f7a8bb` alert, info `#cfe9ff` info); action link 13.5px 600
`#7fe6dc`; 26px dismiss button. The stack is `aria-live="polite"`, each toast `role="status"`.

The app shell mounts the provider. Pages outside `app/(app)` (onboarding, auth, the public site) must
wrap themselves in `<ToastProvider>` to show toasts; without a provider `toast()` is a silent no-op.
Use toasts for confirmations of actions; keep inline `Notice`/field errors for validation.

### `Wordmark`

`<Wordmark width={108} />`: the exact SVG from the design (viewBox 180×48, Fraunces 600 40px,
letter-spacing -1, "muxarıs" with the dotless ı, green `#16a34a` dot at 160.5/12.5 r4). Height is
`width × 48/180`. `light` sets the text to `#fafaf7` for dark backgrounds; `title` sets the
accessible name (default "Muxaris"). The design's sizes: 108 (sidebar), 150 (index), others per page.

### `cn()`, `TONES`, `BADGES`

`cn(...classes)` joins truthy class strings and resolves Tailwind conflicts (last wins), aware of the
custom radius/shadow/animation scales. `TONES` and `BADGES` are the raw maps from the design script,
for charts or inline styles that need hex values.

## Dev preview (screens without sign-in)

`next dev` serves preview routes under `/dev` that render real screens with the design's fixture
data, without Cognito or the API, so they can be screenshotted and compared with the prototypes.
Start the dev server and open `/dev` for the index.

| Route                                           | Shows                                              |
| ----------------------------------------------- | -------------------------------------------------- |
| `/dev/shell?role=front_desk&plan=pilot&clinics=2` | The app shell around a placeholder page          |
| `/dev/ui?m=dialog\|drawer&t=1`                   | Every primitive inside the shell; `m` opens a modal, `t=1` fires toasts |
| `/dev/site`, `/dev/auth`, `/dev/onboarding`, `/dev/core`, `/dev/ops`, `/dev/assistant` | One folder per page area; each implementer adds their own |

**`DevAppFrame`** (`@/components/dev/DevAppFrame`) is the real `AppShell` around fixture clinic
context: Sunrise Dental Care (Bengaluru), owner@sunrisedental.in, Callbacks badge 3, minutes
1,842 / 3,000. It makes no network calls: it passes fixture values through the same props the
`(app)` layout passes and turns off the sidebar's API refresh. Props: `role` (`"owner"` default or
`"front_desk"`, which also switches the email to frontdesk@sunrisedental.in), `plan` (`"standard"`
default or `"pilot"`: 462 / 500, "Pilot ends 25 Oct 2026", meter in its hot state), `multiClinic`
(shows the "Switch clinic" select), `openCallbacks`, `usage` (`null` shows the load-error state).

**Fixtures** (`@/components/dev/fixtures`) are `seedDb()` from `Muxaris App.dc.html` typed as the
API returns it (`@muxaris/shared` types): `clinic`, `secondClinic`, `doctors`, `services`,
`slotRules`, `assistantProfile`, `patients`, `patientPhones` (raw numbers, for reveal-phone
previews), `appointments`, `calls`, `callTurns` (by call id), `callbacks`, `notifications`,
`usageStandard` / `usagePilot` / `usageFor(plan)`, and `FIXTURE_TODAY` (`2026-10-09`) /
`FIXTURE_NOW` (2:10 pm IST, the prototype's "now"). They follow the API shapes, not the prototype's:
UTC ISO instants (use `ist(date, time)` to build one), `xx-IN` language codes, E.164 or masked phones,
masked emails, skip-reason codes in `notification.error`. Ids keep the prototype's (`p1`, `a7`,
`c5`, `cb1`) so `/dev/core/calls/c5` lines up with `#calls/c5`.

A preview page is a server component under `app/dev/<area>/…` that renders the production view
with fixture props. Signed-in screens wrap it in `DevAppFrame`; site, auth and onboarding previews
render their components directly (`app/dev/layout.tsx` already mounts a `ToastProvider`).

```tsx
// app/dev/core/calls/page.tsx
import { DevAppFrame } from "@/components/dev/DevAppFrame";
import { calls, clinic } from "@/components/dev/fixtures";
import { CallsBrowser } from "@/components/app/CallsBrowser";

export default function Preview() {
  return (
    <DevAppFrame role="front_desk">
      <CallsBrowser initial={calls} tz={clinic.timezone} />
    </DevAppFrame>
  );
}
```

Rules:

- **Preview pages pass fixture data as props. Never add fixture branches to production code**
  (no `if (preview)`, no importing fixtures from a view, no `?fixture=` switches). If a view only
  loads its data from the API, split it so the loaded data arrives as props (a server page or a
  thin client loader does the fetching and the view renders it) and preview the view.
- Production code must not import `app/dev` or `components/dev`; eslint enforces this. Tests may use
  the fixtures.
- A view that fetches more on interaction will still call the API from a preview; that is fine for
  screenshots of the initial state, but do not add mocks for it in production code.
- Outside `next dev` every `/dev` path is a 404: the proxy answers it before anything renders,
  `app/dev/layout.tsx` calls `notFound()` as a backstop, and the segment is never prerendered.
  Nothing extra is needed in your area's pages.

## Testing notes

- Vitest + Testing Library, jsdom via the `// @vitest-environment jsdom` comment at the top of a test.
- Components that call `useToast()` work without a provider (no-op); wrap in `<ToastProvider>` to
  assert on toasts (`screen.getByRole("status")`).
- `Modal` content is portalled to `document.body`: use `screen`, not `container`.
- Tests that assert on old class names (`bg-accent`, `rounded-card`) should move to roles and text.

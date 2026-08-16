# muxaris-site

Marketing site for **Muxaris** — an open-source, role-based LLM gateway.

Static Astro + Tailwind v4. No JS framework, no client-side runtime, no external
requests at page load beyond Google Fonts.

## Local

```bash
npm install
npm run dev      # http://localhost:4321
npm run build    # -> dist/
npm run preview
```

## Deploy (Netlify)

`netlify.toml` is committed, so Netlify needs no dashboard configuration:

- build command `npm run build`
- publish directory `dist`
- Node 22

Either connect the repo in the Netlify UI, or:

```bash
npx netlify-cli deploy --prod
```

Point `muxaris.com` at the site once the domain is registered, and update
`site:` in `astro.config.mjs` if the final domain differs.

## Structure

| Path | Purpose |
| --- | --- |
| `src/layouts/Base.astro` | Document shell, fonts, meta, background field |
| `src/styles/global.css` | Design tokens (`@theme`), grid/grain, motion |
| `src/components/` | One file per page section |
| `src/pages/index.astro` | Section order |

## Design notes

Network-operations console aesthetic. Two accent colours do the explaining:
**amber** is the primary route, **teal** is the fallback route. They appear
together in the logo, the hero status strip, the registry table and the usage
log, so the product's core idea is legible before any copy is read.

Type: Bricolage Grotesque (display), Instrument Sans (body), JetBrains Mono
(code and all technical labels).

## Copy

All copy is original. The page structure follows the conventions of developer
infrastructure sites generally — hero, provider strip, concept, features, code
diff, accounting, install — which is a common layout, not anyone's asset. No
third-party text, screenshots, logos or design files are used.

The sample rows in the usage-log and registry tables are illustrative of the
schema and are labelled as such. They are not benchmark results and must not be
relabelled as measurements without real data behind them.

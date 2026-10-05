# Portfolio v3

Astro rebuild of the portfolio. Static output, deployed to GitHub Pages from the
`v3` branch. Replaces the v2 Bootstrap/fetch-injection site on `main`.

## Design goals

- **Interaction-first.** Particle field background, scroll-triggered reveals,
  a searchable and filterable project grid, view transitions between pages, and
  parallax card imagery. All of it degrades to a plain readable page without
  JavaScript.
- **Strictly monochrome.** Black, white, and alpha-derived greys only. Depth
  comes from hairlines, opacity, and gradients rather than hue. This is enforced
  by a build check (`npm run verify`).
- **Subtle motion.** The background is a light canvas particle field, not 3D.
  Particle count scales with viewport area and is capped at 110. Everything
  respects `prefers-reduced-motion`, and the particle loop pauses when the tab
  is hidden.
- **Deep project write-ups.** Every project gets a page with architecture,
  the role you played, challenges, and key features.

## Getting started

```bash
npm install
npm run dev          # http://localhost:4321
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with HMR |
| `npm run build` | Static build to `dist/` |
| `npm run preview` | Serve `dist/` locally |
| `npm run check` | `astro check` — types across `.astro` and `.ts` |
| `npm run verify` | Build, then assert links/headings/alt-text/monochrome |
| `npm run smoke` | Headless browser test against a running `preview` |
| `npm run data:sync` | Refresh the data snapshot from the Google Sheet |
| `npm run data:sync:check` | Fail if the snapshot is stale |

## Structure

```
src/
├── components/         Nav, Footer, ProjectCard, AdSlot
├── layouts/            BaseLayout — document shell, transitions, background
├── lib/
│   ├── sheet.ts            Google Sheets gviz reader
│   ├── project-schema.ts   Zod schema: what a project is
│   ├── project-mapper.ts   sheet row -> validated Project
│   └── projects-loader.ts  content loader with snapshot fallback
├── pages/
│   ├── index.astro         home
│   ├── projects/           index (filter+search) + [slug] (deep dive)
│   ├── about.astro
│   ├── contact.astro
│   └── 404.astro
├── scripts/            particles, ui (reveal/nav), runs in the browser
├── styles/             tokens.css + global.css
└── data/
    ├── profile.ts       name, bio, socials, stack
    └── projects.snapshot.json   committed fallback
```

`scripts/` at the repo root are Node scripts (build/verify/smoke/data). They are
separate from `src/scripts/`, which ships to the browser.

## Adding content

See **[docs/PROJECT_DATA.md](docs/PROJECT_DATA.md)** for the Google Sheet column
reference. To regenerate the import template:

```bash
node scripts/make-sheet-template.mjs
```

## Verification

```bash
npm run check    # 0 errors, 0 warnings, 0 hints
npm run verify   # link integrity, heading order, alt text, monochrome
npm run preview  # in one terminal
npm run smoke    # 34 browser assertions: canvas, filters, nav, a11y, reduced motion
```

`npm run smoke` uses the Chrome already installed on the machine via
`playwright-core`, so nothing is downloaded. It expects `preview` on port 4322.

## Deployment

`.github/workflows/deploy.yml` builds on push to `v3` and publishes to GitHub
Pages via the official Pages actions.

One-time setup in the repo:

1. **Settings > Pages > Build and deployment > Source: GitHub Actions**
2. Optionally add the `PUBLIC_ADSENSE_CLIENT` variable (see
   [docs/PROJECT_DATA.md](docs/PROJECT_DATA.md#adding-the-adsense-config))

This is a user site (`mhdalfaz.github.io`), so `base` is `/`. If the site ever
moves to a project path, change `base` in `astro.config.mjs`.

### Why build-time fetching

Project data is fetched from the Sheet at build time, not in the browser. That
means no request to Google on every page view, no dependency on the Sheet being
reachable from visitors, and the 22 project pages are real static HTML. The cost
is that editing the Sheet requires a rebuild — which GitHub Actions does
automatically on push.

## Notes on the previous version

`main` still holds v2 and is untouched. The old Bootstrap CSS, `js/` scripts,
and HTML partials were removed from `v3` only; `main` remains the fallback if
this needs rolling back.
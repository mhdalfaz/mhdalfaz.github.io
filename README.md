# Portfolio v3

Astro rebuild of the portfolio. Static output, deployed to GitHub Pages from the
`main` branch. `v3` is the working branch: merging it into `main` publishes the
site. Replaces the v2 Bootstrap/fetch-injection site.

## Design goals

- **Interaction-first.** Particle field background, scroll-triggered reveals,
  a searchable and filterable project grid, view transitions between pages, and
  a zoom-out on card imagery. All of it degrades to a plain readable page without
  JavaScript.
- **Strictly monochrome.** Black, white, and alpha-derived greys only. Depth
  comes from hairlines, opacity, and gradients rather than hue. This is enforced
  by a build check (`npm run verify`). Cards, panels, tags, and inputs use the
  opaque `--surface-*` tokens instead of alpha fills, so the background never
  drifts under text sitting on a surface.
- **Subtle motion.** The background is a light canvas neuron network, not 3D.
  Two node populations (neurons and surrounding tissue nodes), persistent
  synapses that rewire over time, and impulses that travel down axons, light up
  the node they reach, and are relayed onward. Axons are capped at a fixed length
  and dropped in the same frame a node wraps, so no edge is ever drawn across the
  viewport. Node count scales with viewport area and is capped at 96, which
  measures a steady 60fps. Everything respects `prefers-reduced-motion`, and the
  loop pauses when the tab is hidden.
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
| `npm run check` | `astro check`, types across `.astro` and `.ts` |
| `npm run verify` | Build, then assert links/headings/alt-text/monochrome |
| `npm run smoke` | Headless browser test against a running `preview` |
| `npm run dev:example` | Dev server with sample deep-dive copy overlaid |
| `npm run data:sync` | Refresh the data snapshot from the Google Sheet |
| `npm run data:sync:check` | Fail if the snapshot is stale |

## Structure

```
src/
├── components/         Nav, Footer, ProjectCard, AdSlot
├── layouts/            BaseLayout: document shell, transitions, background
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
npm run smoke    # 40+ browser assertions: network, filters, nav, a11y, motion, perf
```

`npm run smoke` uses a Chrome already installed on the machine via
`playwright-core`, so nothing is downloaded. It looks in the usual per-platform
locations and honours `CHROME_PATH`. It expects `preview` on port 4322.

## Previewing before the content is written

The Sheet only has the original 10 columns, so the deep-dive sections of each
project page have nothing to render yet. To review the layout with realistic
prose:

```bash
npm run dev:example
```

This overlays sample copy onto `library-app`, `rekam-medis`, and `pnp-scm`
from `src/data/example-content.ts`. Real sheet values always win, so it never
overrides anything you have written. A banner appears at the top of every page
while it is on, and the build logs a warning.

It is off by default and never set in CI, so placeholder copy cannot ship.

## Deployment

`.github/workflows/deploy.yml` builds on push to `main` and publishes to GitHub
Pages via the official Pages actions. Work happens on `v3`; merging `v3` into
`main` is what publishes it.

One-time setup in the repo:

1. **Settings > Pages > Build and deployment > Source: GitHub Actions**. If this
   is set to "Deploy from a branch" the workflow publishes nothing and GitHub
   serves the raw files of that branch, which is not a built site.
2. **Settings > Environments > github-pages > Deployment branches and tags**:
   either pick **All branches**, or add `main` as a branch rule. GitHub creates
   this environment automatically with a rule that only allows the default
   branch, and a rule that does not list the deploying branch rejects the deploy
   job with `Branch "main" is not allowed to deploy to github-pages due to
   environment protection rules`. That error is a repository setting, so no
   change to `deploy.yml` can fix it.
3. Optionally add the `PUBLIC_ADSENSE_CLIENT` variable (see
   [docs/PROJECT_DATA.md](docs/PROJECT_DATA.md#adding-the-adsense-config))

Because the trigger is `main`, a push to `main` runs the full pipeline. Until
`v3` is merged, `main` has no `package.json`, so those runs fail at
`npm ci`. That is expected until the first merge.

This is a user site (`mhdalfaz.github.io`), so `base` is `/`. If the site ever
moves to a project path, change `base` in `astro.config.mjs`.

### Why build-time fetching

Project data is fetched from the Sheet at build time, not in the browser. That
means no request to Google on every page view, no dependency on the Sheet being
reachable from visitors, and the 22 project pages are real static HTML. The cost
is that editing the Sheet requires a rebuild, which GitHub Actions does
automatically on push to `main`.

## Notes on the previous version

v2 was the Bootstrap/fetch-injection site that used to live on `main`. It is kept
in git history and on the `update-2.1.5` branch, so it can be restored from
either if this needs rolling back.
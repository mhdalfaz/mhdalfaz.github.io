## Development

This is the Astro 7 portfolio. Static output, deployed to GitHub Pages from the
`main` branch, with `v3` as the working branch. See `README.md` for the overview
and `docs/PROJECT_DATA.md` for the Google Sheet column reference.

### Commands

```bash
npm run dev            # dev server on :4321
npm run build          # static build to dist/
npm run preview        # serve dist/ on :4322
npm run check          # astro check (types across .astro and .ts)
npm run verify         # build + link/heading/alt/monochrome assertions
npm run smoke          # headless browser tests, needs `preview` running
npm run dev:example    # dev server with sample deep-dive copy overlaid
npm run data:sync      # refresh the project snapshot from the Google Sheet
```

Run `npm run data:sync` after editing the Google Sheet. The committed
`src/data/projects.snapshot.json` is a fallback so a deploy cannot fail when
the Sheet is unreachable; a stale snapshot means edits are not showing up.

### Background dev server

When starting the dev server, use background mode:

```
astro dev --background
```

Manage it with `astro dev stop`, `astro dev status`, and `astro dev logs`.

### Adding a project field

The data layer is deliberately label-driven: columns are matched by their sheet
header text, not position, so columns can be inserted or reordered freely.

1. Add the header to the Google Sheet (exact spelling matters).
2. Add the field to `projectSchema` in `src/lib/project-schema.ts`.
3. Map it in `mapRecord` in `src/lib/project-mapper.ts`.
4. Render it in `src/pages/projects/[slug].astro`.
5. `npm run data:sync`

### Conventions

- **Monochrome only.** Black, white, and alpha-derived greys. No hue anywhere.
  `npm run verify` fails the build on any non-grey colour value, so this is
  enforced rather than remembered. Use the `--grey-*` and `--ink-*` tokens in
  `src/styles/tokens.css` rather than raw hex values.
- **All new fields optional.** The Sheet only has the original 10 columns today.
  Every v3 field must resolve to `undefined`/empty so the build keeps succeeding
  while content is filled in gradually.
- **Motion is progressive.** Anything animated needs a
  `prefers-reduced-motion` fallback, and interactive elements need a usable
  non-JS state. The canvas background must keep 60fps, so cap node counts and
  avoid per-frame allocation in `src/scripts/particles.ts`.
- **EXAMPLE_CONTENT is preview-only.** It overlays placeholder copy from
  `src/data/example-content.ts`. Never set it in CI; `npm run smoke` and the
  build warning guard against it shipping by accident.
- **Astro 7 specifics.** The compiler is the Rust one and is strict about
  unclosed tags and invalid HTML nesting. `compressHTML` defaults to `'jsx'`,
  so inline elements need an explicit `{' '}` where whitespace matters.

### Verification before finishing

```bash
npm run check && npm run verify
```

Then, with `npm run preview` running in another terminal, `npm run smoke`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Content collections](https://docs.astro.build/en/guides/content-collections/)
- [Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/)
- [Adding styles](https://docs.astro.build/en/guides/styling/)
- [Client-side scripts](https://docs.astro.build/en/guides/client-side-scripts/)
- [View transitions](https://docs.astro.build/en/guides/view-transitions/)
- [Deploying to GitHub Pages](https://docs.astro.build/en/guides/deploy/github/)
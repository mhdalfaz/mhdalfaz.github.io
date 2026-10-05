# Project data (Google Sheet)

All project content comes from one published Google Sheet. Nothing is stored in
the repository except a fallback snapshot.

## How it flows

```
Google Sheet  ──gviz fetch──►  projects-loader.ts  ──►  content collection
                              (with snapshot            "projects"
                               fallback)                     │
                                                    getCollection('projects')
                                                              │
                                       ┌──────────────────────┴────┐
                                    /projects index          /projects/[slug]
```

## The sheet

Existing sheet (v2 columns A–J):

| Column | Header | Required | Notes |
| --- | --- | --- | --- |
| A | ID | yes | Any stable id. Kept for backwards compatibility. |
| B | Name | yes | Project title. |
| C | Description | recommended | Multi-line. Rendered as paragraphs. |
| D | Homepage URL | no | Must be a valid URL or the build fails. |
| E | Image URL | no | Screenshot. Falls back to a monogram tile. |
| F | Repo URL | no | |
| G | Tools | no | Comma separated. |
| H | Visibility | yes | `public` or `private`. Anything else falls back to `public`. |
| I | Android Download | no | |
| J | IOS Download | no | |

New v3 columns (K–Y). Every one is **optional** — the site builds and ships
today without them, and each section of the project page fills in as you add
data.

| Column | Header | Type | Renders as |
| --- | --- | --- | --- |
| K | Slug | text | URL segment. Auto-generated from Name if blank. **Set this explicitly** — it keeps URLs stable when you rename a project. |
| L | Tagline | text | One line on cards and under the title. Falls back to the first line of Description. |
| M | Domain | text | Creates a filter chip on /projects automatically. e.g. Healthcare, Government, Education. |
| N | Year | number | Badge. Accepts `2024` or `2024-2025`. |
| O | Status | text | Badge. e.g. Production, Prototype, Archived. |
| P | Featured | boolean | `TRUE` shows on the home page. Takes the first 3. |
| Q | Role | text | "My role" in the facts sidebar and the Contribution block. Be specific about what you owned. |
| R | Team | text | e.g. "2 backend devs, 1 designer". |
| S | Timeline | text | e.g. "3 months (2024)". |
| T | Architecture | multi-line | The main prose section. Blank line = new paragraph. |
| U | Architecture Notes | list | Comma separated, rendered as bullets. |
| V | Challenges | list | Comma separated, numbered cards. One problem per item. |
| W | Key Features | list | Comma separated, checkbox list. |
| X | Demo Credentials | multi-line | Shown in a code block. |
| Y | Gallery | list | Image URLs, comma separated. |

### List vs. prose

- **List columns** (U, V, W, Y) split on `,` `;` or newline. Each item becomes
  one bullet or card.
- **Prose columns** (T, X) split on blank lines into paragraphs.
- `Tools` is special-cased: if a value looks like `Label: value`, everything
  after that label stays attached to it. So `Backend: Laravel, MySQL,
  Front End: Nuxt, Vue` becomes `["Backend: Laravel, MySQL", "Front End: Nuxt, Vue"]`
  rather than four loose chips.

### A note on commas

Google Sheets has no native arrays, so list fields are comma separated. If an
item itself needs a comma, the naive split will break it. The parser handles
the common case above; for genuinely comma-heavy items, rephrase or use a
semicolon as the separator (both are accepted).

## Adding a column

1. Add the header to the sheet. **Header text must match exactly** — the reader
   keys off labels, not column positions, so column order does not matter but
   spelling does.
2. Add the field to `projectSchema` in `src/lib/project-schema.ts`.
3. Map it in `mapRecord` in `src/lib/project-mapper.ts`.
4. Render it in `src/pages/projects/[slug].astro`.
5. Run `npm run data:sync` to refresh the snapshot.

Because the reader keys off header labels, you can insert columns anywhere in
the sheet without breaking anything — you cannot reorder values by accident.

## The snapshot

`src/data/projects.snapshot.json` is a committed copy of the last successful
fetch. It exists so a deploy cannot fail because the sheet was momentarily
unreachable, rate limited, or offline.

```bash
npm run data:sync          # refresh after editing the sheet
npm run data:sync:check    # exit 1 if the snapshot is stale (used in CI)
```

Run `data:sync` after every sheet edit. If you forget, the site keeps serving
the old snapshot — the build still succeeds, so nothing fails loudly. CI warns
you via the `data:sync:check` step.

To build without touching the network at all:

```bash
OFFLINE_DATA=true npm run build
```

## Regenerating the template

```bash
node scripts/make-sheet-template.mjs   # writes docs/sheet-template.csv
```

`docs/sheet-template.csv` has the full 25-column header, one completely filled
example row, one partially filled row, and one blank row. Import it into Google
Sheets, then copy columns K onwards into your live sheet.

## Adding the AdSense config

Ads are off by default so local and PR builds stay clean. To enable, set a
repository variable in GitHub:

```
Settings > Secrets and variables > Actions > Variables
PUBLIC_ADSENSE_CLIENT = ca-pub-...
PUBLIC_ADSENSE_SLOT   = your-slot-id
```

Then place `<AdSlot />` in a layout or page.
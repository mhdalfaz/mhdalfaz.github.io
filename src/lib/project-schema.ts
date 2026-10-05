/**
 * The project data model.
 *
 * Original v2 sheet columns (all still supported):
 *   ID, Name, Description, Homepage URL, Image URL, Repo URL, Tools,
 *   Visibility, Android Download, IOS Download
 *
 * New v3 columns added for the deep-dive project pages:
 *   Slug, Tagline, Domain, Year, Role, Team, Timeline, Architecture,
 *   Architecture Notes, Challenges, Key Features, Demo Credentials,
 *   Gallery, Featured, Status
 *
 * Every new field is optional on purpose. The sheet in the wild today only has
 * the original 10 columns, and the build must keep succeeding while the extra
 * columns are filled in gradually. See docs/PROJECT_DATA.md.
 */

import { z } from 'astro/zod';

/** Split a comma / semicolon separated cell into a clean list. */
export function splitList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(/[,;\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Google Sheets boolean-ish cells: TRUE/FALSE, Yes/No, 1/0. */
export function parseBoolean(value: string | undefined): boolean {
  if (!value) return false;
  return /^(true|yes|y|1|✓)$/i.test(value.trim());
}

/**
 * Turn a project name into a URL slug.
 * "uji-validitas-dan-reliabilitas" stays as-is; "Library App" -> "library-app".
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

/** Strip the trailing slash so link comparisons stay stable. */
export function normalizeUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  return trimmed.replace(/\/+$/, '');
}

/**
 * "Backend: Laravel, Front End: Nuxt" -> ["Backend: Laravel", "Front End: Nuxt"]
 * but only when the cell is clearly a labelled list. Otherwise split on commas.
 * This keeps values like "Laravel (8.83.27), MySQL" intact enough to read well.
 */
export function parseTools(value: string | undefined): string[] {
  if (!value) return [];
  const parts = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  // Re-join fragments that are clearly continuations of a labelled entry,
  // e.g. "Frontend: Nuxt, Vue" should not become "Nuxt" and "Vue" separately.
  const labelled = parts.length > 0 && parts.some((part) => /^[A-Za-z ]+:\s/.test(part));
  if (!labelled) return parts;

  const grouped: string[] = [];
  for (const part of parts) {
    const startsNewGroup = /^[A-Za-z ]+:\s/.test(part);
    if (startsNewGroup || grouped.length === 0) {
      grouped.push(part);
    } else {
      grouped[grouped.length - 1] = `${grouped[grouped.length - 1]}, ${part}`;
    }
  }
  return grouped;
}

export const projectSchema = z.object({
  // --- identity -----------------------------------------------------------
  /** Sheet row id. Kept for backwards compatibility with the v2 sheet. */
  id: z.string(),
  /** URL segment for /projects/[slug]. */
  slug: z.string(),
  name: z.string(),
  /** One-line summary used on cards. Falls back to the first description line. */
  tagline: z.string().optional(),
  /** Long description. Newlines are preserved and rendered as paragraphs. */
  description: z.string().default(''),

  // --- classification -----------------------------------------------------
  visibility: z.enum(['public', 'private']).catch('public'),
  /** Free-form area, e.g. "Healthcare", "Government", "Accounting". */
  domain: z.string().optional(),
  year: z.number().int().optional(),
  status: z.string().optional(),
  featured: z.boolean().default(false),

  // --- stack & links ------------------------------------------------------
  tools: z.array(z.string()).default([]),
  // Validated as real URLs so a typo'd link fails the build instead of shipping
  // a dead button. normalizeUrl() has already stripped trailing slashes.
  homepage: z.url().optional(),
  repo: z.url().optional(),
  androidDownload: z.url().optional(),
  iosDownload: z.url().optional(),
  image: z.string().optional(),
  gallery: z.array(z.string()).default([]),

  // --- the deep-dive fields ----------------------------------------------
  /** What I actually did on this project. */
  role: z.string().optional(),
  /** Team shape, e.g. "4 devs, 1 PM, 1 QA". */
  team: z.string().optional(),
  /** Duration, e.g. "4 months (2024)". */
  timeline: z.string().optional(),
  /** Architecture in prose: layers, data flow, notable decisions. */
  architecture: z.string().optional(),
  /** Bullet-ish notes on the architecture, rendered as a list. */
  architectureNotes: z.array(z.string()).default([]),
  /** Hard problems hit and how they were solved. */
  challenges: z.array(z.string()).default([]),
  /** Notable capabilities worth calling out. */
  keyFeatures: z.array(z.string()).default([]),
  /** Demo login, when the live demo needs credentials. */
  demoCredentials: z.string().optional(),
});

export type Project = z.infer<typeof projectSchema>;
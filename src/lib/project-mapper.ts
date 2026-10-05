/**
 * Map a flat sheet record into a validated Project.
 *
 * The sheet is edited by hand, so this function is deliberately forgiving:
 * unknown values are dropped rather than throwing, and missing optional
 * columns resolve to sensible defaults. `projectSchema` is the single place
 * that decides what a Project must look like.
 */

import {
  normalizeUrl,
  parseBoolean,
  parseTools,
  projectSchema,
  slugify,
  splitList,
  type Project,
} from './project-schema.ts';
import type { SheetRecord } from './sheet.ts';

/** Convert "2024" / "2024-2025" to a leading year number. */
export function parseYear(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const match = value.match(/\d{4}/);
  if (!match) return undefined;
  const year = Number.parseInt(match[0], 10);
  return Number.isFinite(year) ? year : undefined;
}

/** Keep only values that parse as absolute http(s) URLs. */
export function parseUrlList(value: string | undefined): string[] {
  return splitList(value).filter((item) => /^https?:\/\//i.test(item));
}

export function mapRecord(record: SheetRecord, index: number): Project {
  const name = record['Name']?.trim() || `Project ${index + 1}`;
  const description = (record['Description'] ?? '').trim();

  // Tagline: explicit column, else the first non-empty description line.
  const tagline =
    record['Tagline']?.trim() ||
    description
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ||
    undefined;

  const visibilityRaw = record['Visibility']?.trim().toLowerCase();
  const visibility = visibilityRaw === 'private' ? 'private' : 'public';

  return projectSchema.parse({
    id: record['ID'] ?? String(index + 1),
    // Explicit Slug wins so URLs stay stable if a project is renamed.
    slug: slugify(record['Slug']?.trim() || name),
    name,
    tagline,
    description,

    visibility,
    domain: record['Domain']?.trim() || undefined,
    year: parseYear(record['Year']),
    status: record['Status']?.trim() || undefined,
    featured: parseBoolean(record['Featured']),

    tools: parseTools(record['Tools']),
    homepage: normalizeUrl(record['Homepage URL']),
    repo: normalizeUrl(record['Repo URL']),
    androidDownload: normalizeUrl(record['Android Download']),
    iosDownload: normalizeUrl(record['IOS Download']),
    image: record['Image URL']?.trim() || undefined,
    gallery: parseUrlList(record['Gallery']),

    role: record['Role']?.trim() || undefined,
    team: record['Team']?.trim() || undefined,
    timeline: record['Timeline']?.trim() || undefined,
    architecture: record['Architecture']?.trim() || undefined,
    architectureNotes: splitList(record['Architecture Notes']),
    challenges: splitList(record['Challenges']),
    keyFeatures: splitList(record['Key Features']),
    demoCredentials: record['Demo Credentials']?.trim() || undefined,
  });
}

export function mapRecords(records: SheetRecord[]): Project[] {
  return records.map(mapRecord).filter((project) => project.name.trim() !== '');
}

/**
 * Deduplicate by slug, keeping the first occurrence.
 *
 * Guards against a copy-pasted row in the sheet producing two routes for the
 * same URL, which `getStaticPaths` would reject with a confusing error.
 */
export function dedupeBySlug(projects: Project[]): Project[] {
  const seen = new Set<string>();
  return projects.filter((project) => {
    if (seen.has(project.slug)) return false;
    seen.add(project.slug);
    return true;
  });
}
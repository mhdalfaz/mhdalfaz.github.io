/**
 * Refreshes src/data/projects.snapshot.json from the live Google Sheet.
 *
 * The snapshot is what lets `astro build` succeed when the sheet is
 * unreachable, so it needs refreshing whenever the sheet is edited.
 *
 *   npm run data:sync          # refresh the snapshot
 *   npm run data:sync -- --check   # fail if the snapshot is stale (CI)
 */

import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fetchSheetRecords } from '../src/lib/sheet.ts';
import { dedupeBySlug, mapRecords } from '../src/lib/project-mapper.ts';
import { projectSchema } from '../src/lib/project-schema.ts';

const OUTPUT = resolve(process.cwd(), 'src/data/projects.snapshot.json');
const checkOnly = process.argv.includes('--check');

const rows = await fetchSheetRecords();
const projects = dedupeBySlug(mapRecords(rows));

// Fail loudly here rather than writing a broken snapshot that breaks builds.
const validated = projects.map((project, index) => {
  try {
    return projectSchema.parse(project);
  } catch (error) {
    throw new Error(`Row ${index + 1} (${project.name}) failed validation:\n${String(error)}`);
  }
});

const next = `${JSON.stringify(validated, null, 2)}\n`;

if (checkOnly) {
  const { readFile } = await import('node:fs/promises');
  let current = '';
  try {
    current = await readFile(OUTPUT, 'utf8');
  } catch {
    console.error('Snapshot is missing. Run: npm run data:sync');
    process.exit(1);
  }
  if (current !== next) {
    console.error('Snapshot is stale. Run: npm run data:sync');
    process.exit(1);
  }
  console.log(`Snapshot is up to date (${validated.length} projects).`);
} else {
  await writeFile(OUTPUT, next, 'utf8');
  console.log(`Wrote ${validated.length} project(s) to src/data/projects.snapshot.json`);
}

console.log('Columns found in the sheet:');
const keys = new Set(rows.flatMap((row) => Object.keys(row)));
console.log(`  ${[...keys].sort().join(', ')}`);
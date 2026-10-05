#!/usr/bin/env node
/**
 * Sanity-check the built site in dist/.
 *
 * Verifies the things that silently break during a redesign and that a
 * successful `astro build` will not catch:
 *   - every internal link resolves to a real file
 *   - exactly one <h1> per page
 *   - no non-monochrome colour in the compiled CSS
 *   - every project page has a title and description
 *
 * Run with: node scripts/verify-build.mjs
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';

const DIST = 'dist';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(full)));
    else files.push(full);
  }
  return files;
}

const problems = [];
const note = (page, message) => problems.push(`${page}: ${message}`);

const all = await walk(DIST);
const htmlFiles = all.filter((file) => file.endsWith('.html'));

// --- asset + link resolution -----------------------------------------------

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const page = relative(DIST, file);
  const refs = new Set(
    [...html.matchAll(/(?:href|src)="(\/[^"#?]*)"/g)].map((match) => match[1]),
  );

  for (const ref of refs) {
    const clean = ref.split('?')[0];
    let target;
    if (clean === '/') {
      target = join(DIST, 'index.html');
    } else if (/\.[a-z0-9]+$/.test(clean)) {
      target = join(DIST, clean);
    } else {
      target = join(DIST, clean.replace(/\/$/, ''), 'index.html');
    }
    try {
      await stat(target);
    } catch {
      note(page, `unresolved reference ${ref}`);
    }
  }
}

// --- document structure -----------------------------------------------------

for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const page = relative(DIST, file);

  const h1Count = (html.match(/<h1[\s>]/g) ?? []).length;
  if (h1Count !== 1) note(page, `expected 1 <h1>, found ${h1Count}`);

  if (!/<title>[^<]+<\/title>/.test(html)) note(page, 'missing <title>');
  if (!/name="description" content="[^"]+"/.test(html)) {
    note(page, 'missing meta description');
  }
  if (!/rel="canonical"/.test(html)) note(page, 'missing canonical link');
  if (!/property="og:title"/.test(html)) note(page, 'missing og:title');

  // Images need alt attributes. Decorative ones must be alt="".
  for (const img of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = img[0];
    if (!/\balt=/.test(tag)) note(page, `<img> without alt: ${tag.slice(0, 80)}`);
  }

  // Buttons and links that look interactive need an accessible name.
  for (const el of html.matchAll(/<button\b[^>]*>\s*<\/button>/g)) {
    note(page, `empty <button> has no accessible name: ${el[0].slice(0, 80)}`);
  }
}

// --- monochrome guarantee ---------------------------------------------------

for (const file of all.filter((f) => f.endsWith('.css'))) {
  const css = await readFile(file, 'utf8');
  const page = relative(DIST, file);
  for (const match of css.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)) {
    const hex = match[1];
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    if (r !== g || g !== b) note(page, `non-monochrome colour #${hex}`);
  }
}

// --- project page content ---------------------------------------------------

// Project *detail* pages live at dist/projects/<slug>/index.html. The
// collection index (dist/projects/index.html) is a different shape.
for (const file of htmlFiles) {
  const page = relative(DIST, file).split('\\').join('/');
  const isDetailPage = /^projects\/[^/]+\/index\.html$/.test(page);
  if (!isDetailPage) continue;

  const html = await readFile(file, 'utf8');
  // A detail page with no facts sidebar means the schema mapping broke.
  if (!/facts__row/.test(html)) {
    note(page, 'no facts sidebar rendered — check the project schema mapping');
  }
}

// --- report -----------------------------------------------------------------

console.log(`Checked ${htmlFiles.length} HTML files, ${all.length} files total.`);

if (problems.length === 0) {
  console.log('All checks passed.');
  process.exit(0);
}

console.error(`\n${problems.length} problem(s) found:`);
for (const problem of problems) console.error(`  - ${problem}`);
process.exit(1);
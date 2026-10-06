#!/usr/bin/env node
/**
 * Generates docs/sheet-template.csv: a ready-to-import Google Sheet template
 * with the full v3 column set, one completely filled example row, and two
 * blank rows to copy.
 *
 * CSV (not TSV) because several fields are legitimately multi-line
 * (Architecture, Challenges, Demo Credentials) and only CSV can represent
 * embedded newlines safely.
 *
 *   node scripts/make-sheet-template.mjs
 *   then: File > Import in Google Sheets, or upload to a new sheet.
 */

import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

/** Column order in the generated sheet. Keep in sync with project-schema.ts. */
export const COLUMNS = [
  'ID',
  'Name',
  'Slug',
  'Description',
  'Tagline',
  'Homepage URL',
  'Image URL',
  'Repo URL',
  'Tools',
  'Visibility',
  'Android Download',
  'IOS Download',
  'Domain',
  'Year',
  'Status',
  'Featured',
  'Role',
  'Team',
  'Timeline',
  'Architecture',
  'Architecture Notes',
  'Challenges',
  'Key Features',
  'Demo Credentials',
  'Gallery',
];

/** RFC 4180 quoting: wrap in double quotes, double any inner quotes. */
function cell(value) {
  const text = value === undefined || value === null ? '' : String(value);
  // Quote when the value contains a delimiter, quote, or newline.
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const example = {
  ID: '562151659',
  Name: 'Library App',
  Slug: 'library-app',
  Description:
    'Sistem pengelolaan peminjaman buku di perpustakaan. Covers catalogue, member management, and the borrowing rules engine.\n\nDemo user:\nemail: admin@example.com\npassword: password',
  Tagline: 'Sistem peminjaman buku perpustakaan dengan modul katalog, anggota, dan aturan peminjaman.',
  'Homepage URL': 'https://library-sxxgvt.laravel.cloud/',
  'Image URL':
    'https://drive.google.com/thumbnail?id=1rjn6uQwh9ItAC33EvEPWa7xL_Mn_Af9q&sz=w4000',
  'Repo URL': 'https://github.com/mhdalfaz/library',
  Tools: 'Laravel 12, Filament, PostgreSQL',
  Visibility: 'public',
  'Android Download': '',
  'IOS Download': '',
  Domain: 'Education',
  Year: '2024',
  Status: 'Production',
  Featured: 'TRUE',
  Role:
    'Backend developer. I designed the borrowing-rules engine and built the member and catalogue CRUD, then owned the Filament admin panel.',
  Team: '2 backend devs, 1 designer',
  Timeline: '3 months (2024)',
  Architecture:
    'Laravel monolith with a Filament admin layer on top of a service layer. PostgreSQL stores catalogue, members, and loan records.\n\nBorrowing rules (loan period, renew limit, overdue blocking) are enforced server-side in a single domain service rather than being duplicated across controllers, so the rule set has one place to change and one place to test.',
  'Architecture Notes':
    'Business rules isolated in a domain service so they can be tested without the UI, Filament gives the admin team a working UI without hand-built pages, PostgreSQL for relational integrity on loan records, Server-side validation on every write path, Read-optimised queries for the catalogue listing',
  Challenges:
    'Overdue books had to block a new borrowing automatically; staff previously checked by hand, Member fines are stored aggregates so reports stay consistent with the ledger, Catalogue search was slow (~2s); indexing brought it under 200ms',
  'Key Features':
    'Catalogue with author and category filters, Member management with borrowing history, Borrowing rules engine with configurable loan periods, Overdue tracking and automatic blocking, Admin dashboard with usage stats',
  'Demo Credentials': 'email: admin@example.com\npassword: password',
  Gallery: '',
};

/** A second, partially-filled row showing that blank cells are fine. */
const partial = {
  ID: '674556381',
  Name: 'PNP SCM',
  Description: 'Sistem Supply Chain Management Parkland World Indonesia',
  Tools: 'Backend: Laravel, Sqlsrv, Front End: Nuxt',
  Visibility: 'private',
  Domain: 'Supply Chain',
  Year: '2023',
  Featured: 'FALSE',
  Role: '',
};

const blank = { ID: '', Name: '', Description: '', Visibility: 'public' };

const rows = [example, partial, blank];

const csv = [COLUMNS, ...rows.map((row) => COLUMNS.map((column) => cell(row[column])))]
  .map((row) => row.join(','))
  .join('\n');

const target = resolve(process.cwd(), 'docs/sheet-template.csv');
await mkdir(resolve(process.cwd(), 'docs'), { recursive: true });
await writeFile(target, `${csv}\n`, 'utf8');

console.log(`Wrote ${target}`);
console.log(`${COLUMNS.length} columns, ${rows.length} example rows.`);
console.log('\nNext: open Google Sheets -> File -> Import -> Upload -> docs/sheet-template.csv');
console.log('Then copy the new columns K onwards into your existing projects sheet.');
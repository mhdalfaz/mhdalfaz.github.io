/**
 * Example deep-dive content for previewing the UI.
 *
 * Your Google Sheet only has the original 10 columns today, so every project
 * page currently renders with an empty deep-dive body. That makes it impossible
 * to judge whether the layout holds up with real prose.
 *
 * This file supplies plausible sample copy for a few projects so you can see the
 * sections populated. It is ONLY merged in when EXAMPLE_CONTENT=true, so it can
 * never ship by accident.
 *
 *   EXAMPLE_CONTENT=true npm run dev
 *
 * Once you fill in the real columns in the sheet, drop this file and turn the
 * flag off. It is scaffolding for design review, not a content source.
 */

import type { Project } from '../lib/project-schema.ts';

/** Projects to enrich, keyed by slug. */
const SAMPLES: Record<string, Partial<Project>> = {
  'library-app': {
    domain: 'Education',
    year: 2024,
    status: 'Production',
    featured: true,
    role: 'Backend developer',
    team: '2 backend developers, 1 designer',
    timeline: '3 months (2024)',
    architecture:
      'A Laravel monolith with a Filament admin layer sitting on top of a service layer. PostgreSQL holds catalogue, members, and loan records in a single schema with foreign keys throughout, so referential integrity is enforced by the database rather than by application code.\n\nBorrowing rules (loan period, renew limit, and overdue blocking) live in a single domain service rather than being duplicated across controllers. That was the main architectural decision: the rules are the part most likely to change as the library adjusts policy, and keeping them in one place means there is one place to change and one place to test.',
    architectureNotes: [
      'Business rules isolated in a domain service so they can be unit tested without the UI',
      'Filament gives the admin team a working interface without hand-built CRUD pages',
      'PostgreSQL for referential integrity on loan records',
      'Server-side validation on every write path, not just the form',
      'Read-optimised queries with explicit selects for the catalogue listing',
    ],
    challenges: [
      'Overdue books had to block a new borrowing automatically. The staff previously checked by hand, which meant the rule lived in their heads rather than the system. Moving it into the service layer meant it applied consistently no matter which entry point triggered the loan.',
      'Member fines drifted out of sync with the ledger because they were computed on the fly. Storing them as an aggregate updated on the relevant transaction made the reports agree with the books.',
      'Catalogue search took around two seconds once the collection grew. Indexing the title and author columns, and dropping a select-star on the listing query, brought it under 200ms.',
    ],
    keyFeatures: [
      'Catalogue with author and category filters',
      'Member management with full borrowing history',
      'Borrowing rules engine with configurable loan periods',
      'Overdue tracking with automatic borrowing blocks',
      'Admin dashboard with collection and circulation stats',
    ],
    demoCredentials: 'email: admin@example.com\npassword: password',
  },

  'rekam-medis': {
    domain: 'Healthcare',
    year: 2024,
    status: 'Production',
    role: 'Full-stack developer',
    team: 'Solo, with a clinic stakeholder',
    timeline: '2 months (2024)',
    architecture:
      'Laravel with Filament for the administrative side and MySQL for storage. The schema is centred on patient and visit records: a patient has many visits, and each visit owns its own diagnoses and prescriptions. Keeping visit data under the visit rather than on the patient row means historical records stay immutable once a visit is closed.\n\nAccess is role-based. Reception staff can register patients and book appointments but cannot see clinical notes; clinical staff see everything for their assigned patients. The distinction is enforced in policies rather than hidden in the UI, so it holds regardless of which screen the request comes from.',
    architectureNotes: [
      'Visit-scoped clinical data so closed records are never mutated',
      'Role-based access via Laravel policies, not UI-level hiding',
      'Filament resources for fast CRUD over patient and visit data',
      'Soft deletes on patient records to satisfy clinic retention rules',
      'Soft document constraints instead of hard date validation, so clinical staff are not blocked mid-entry',
    ],
    challenges: [
      'Clinicians needed to record partial data and come back to it, so strict validation on every field was rejected. The compromise was to validate on save but allow incomplete records, with a separate "finalise" step for closed visits.',
      'Patient identity collisions were a real risk: two people with the same name and similar dates of birth. Added a national ID field with a unique constraint to prevent duplicate registrations.',
      'Search needed to be forgiving because staff typed partial names and inconsistent spellings. A normalised search column plus a LIKE query was more useful than a strict index that returned nothing.',
    ],
    keyFeatures: [
      'Patient registry with duplicate prevention',
      'Appointment scheduling by day and doctor',
      'Visit records with diagnoses and prescriptions',
      'Role-based access for reception versus clinical staff',
      'Patient history view with visit timeline',
    ],
  },

  'pnp-scm': {
    domain: 'Supply Chain',
    year: 2023,
    status: 'Production',
    featured: true,
    role: 'Backend developer',
    team: '4 developers, 1 PM, 1 QA',
    timeline: '8 months (2023)',
    architecture:
      'Laravel backend with a Nuxt frontend, split as two deployable applications communicating over a JSON API. PostgreSQL was not an option here: the client already ran their warehouse on SQL Server, so the backend talks to that directly and stores only its own state in MySQL.\n\nThe split was driven by the client having an existing Nuxt team. It meant two deploy pipelines and a CORS surface to maintain, which is real overhead, but it let the frontend move at the frontend team\'s pace instead of waiting on our release train.',
    architectureNotes: [
      'JSON API between a Laravel backend and a Nuxt frontend, each deployed independently',
      'SQL Server integration for the client\'s existing warehouse systems',
      'MySQL holds only the application\'s own state',
      'Role and permission matrix managed in the admin panel',
      'Inventory movements recorded as append-only entries, never updates in place',
    ],
    challenges: [
      'The warehouse system exposed no usable API, so product data was synced by reading their SQL Server nightly. The first version was brittle and silently dropped rows; adding a reconciliation report made the failure visible instead of quiet.',
      'Two teams on one codebase meant unclear ownership of a module. We agreed module ownership explicitly and required a code review from the owning team for changes to shared modules, which slowed things down but stopped the cross-team breakage we had been getting.',
      'Permissions were initially hardcoded per controller. Replacing that with a policy layer and an admin-editable matrix meant non-developers could grant access without a deploy.',
    ],
    keyFeatures: [
      'Supplier and purchase order management',
      'Inventory tracking across multiple warehouses',
      'Movement history kept as an append-only log',
      'Admin-editable roles and permissions',
      'Reporting for stock levels and supplier lead times',
    ],
  },
};

/**
 * Merge the sample copy onto the real project data.
 * Returns the projects untouched if any slug is unknown.
 */
export function applyExampleContent(projects: Project[]): Project[] {
  return projects.map((project) => {
    const sample = SAMPLES[project.slug];
    if (!sample) return project;

    // Only fill fields that are still empty, so real data always wins.
    const merged: Partial<Project> = { ...sample };
    for (const key of Object.keys(sample) as (keyof Project)[]) {
      const current = project[key];
      const isEmpty =
        current === undefined ||
        current === null ||
        (Array.isArray(current) && current.length === 0) ||
        current === '';
      if (!isEmpty) delete merged[key];
    }

    return { ...project, ...merged };
  });
}

export const EXAMPLE_SLUGS = Object.keys(SAMPLES);
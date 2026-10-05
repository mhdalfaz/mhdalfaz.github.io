/**
 * Content loader that backs the `projects` collection with the Google Sheet.
 *
 * Build-time resilience: if the sheet is unreachable (rate limited, offline CI
 * runner, sheet temporarily unpublished) the loader falls back to a committed
 * snapshot and warns, rather than failing the whole build. Run
 * `npm run data:sync` to refresh the snapshot after editing the sheet.
 */

import type { Loader } from 'astro/loaders';
import type { SheetRecord } from './sheet.ts';
import { fetchSheetRecords } from './sheet.ts';
import { dedupeBySlug, mapRecords } from './project-mapper.ts';
import { projectSchema, type Project } from './project-schema.ts';
import { applyExampleContent } from '../data/example-content.ts';
import snapshot from '../data/projects.snapshot.json' with { type: 'json' };

function normalise(rows: SheetRecord[]): Project[] {
  return dedupeBySlug(mapRecords(rows));
}

export interface ProjectsLoaderOptions {
  sheetId?: string;
  /** Skip the network entirely and use the committed snapshot. */
  offline?: boolean;
}

export function projectsLoader(options: ProjectsLoaderOptions = {}): Loader {
  const { sheetId, offline = false } = options;

  // OFFLINE_DATA=true forces the snapshot; useful when the sheet is being
  // restructured and you want to check a build against known-good data.
  // import.meta.env is optional because this module is also imported directly by
  // the Node sync script, where Vite has not replaced it.
  const envOffline = import.meta.env?.OFFLINE_DATA === 'true';
  const forceOffline = offline || envOffline || process.env.OFFLINE_DATA === 'true';

  /*
   * EXAMPLE_CONTENT=true overlays sample deep-dive copy so the project pages can
   * be reviewed with realistic prose before the real Sheet columns are filled
   * in. Real values always win over the samples. Must never be on in CI.
   */
  const withExamples =
    import.meta.env?.EXAMPLE_CONTENT === 'true' || process.env.EXAMPLE_CONTENT === 'true';

  return {
    name: 'google-sheets-projects',
    schema: projectSchema,

    load: async ({ store, logger, parseData, generateDigest }) => {
      let projects: Project[];

      if (forceOffline) {
        logger.info('projects: offline mode, using committed snapshot.');
        projects = snapshot as Project[];
      } else {
        try {
          const rows = await fetchSheetRecords({ sheetId });
          projects = normalise(rows);
          logger.info(`projects: loaded ${projects.length} project(s) from Google Sheets.`);
        } catch (error) {
          projects = snapshot as Project[];
          logger.warn(
            `projects: could not reach Google Sheets (${
              error instanceof Error ? error.message : String(error)
            }). Falling back to the committed snapshot with ${projects.length} project(s).`,
          );
        }
      }

      if (withExamples) {
        logger.warn(
          'projects: EXAMPLE_CONTENT is on. Sample deep-dive copy is being used. ' +
            'Never set this in CI — it will publish placeholder text.',
        );
        projects = applyExampleContent(projects);
      }

      store.clear();

      for (const project of projects) {
        const data = await parseData({ id: project.slug, data: project });
        store.set({
          id: project.slug,
          data,
          digest: generateDigest(data),
        });
      }
    },
  };
}
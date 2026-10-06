import { defineCollection } from 'astro:content';
import { projectSchema } from './lib/project-schema.ts';
import { projectsLoader } from './lib/projects-loader.ts';

// Reads the published Google Sheet. If the sheet cannot be reached the loader
// falls back to src/data/projects.snapshot.json (refresh with `npm run data:sync`).
const projects = defineCollection({
  loader: projectsLoader(),
  schema: projectSchema,
});

export const collections = { projects };
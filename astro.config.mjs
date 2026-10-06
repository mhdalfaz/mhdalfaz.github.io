// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

// https://astro.build/config
export default defineConfig({
  site: 'https://mhdalfaz.github.io',
  // This is a user/organisation GitHub Pages site (mhdalfaz.github.io),
  // so the published path is the domain root. If this repo is ever moved to
  // a project path (mhdalfaz.github.io/portfolio), set base to '/portfolio'.
  base: '/',
  trailingSlash: 'never',
  build: {
    // Inline stylesheets that Astro considers small enough. Keeps the
    // single-page-feeling navigation instant on repeat visits.
    inlineStylesheets: 'auto',
  },
  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },
  integrations: [sitemap()],
});
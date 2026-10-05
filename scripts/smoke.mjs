/**
 * Headless browser smoke test against the preview server.
 *
 * Verifies the parts of the redesign that a static build check cannot:
 * the particle canvas actually paints, the projects filter/search mutates the
 * DOM, the mobile nav opens, and view transitions survive a client-side
 * navigation.
 *
 * Uses the locally installed Chrome so nothing has to be downloaded.
 *
 *   node scripts/smoke.mjs [baseUrl]
 */

import { chromium } from 'playwright-core';

const BASE = process.argv[2] ?? 'http://localhost:4322';
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const failures = [];
const passes = [];

function check(name, condition, detail = '') {
  if (condition) {
    passes.push(name);
    console.log(`  ok   ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const browser = await chromium.launch({
  executablePath: CHROME,
  args: ['--no-sandbox', '--disable-gpu'],
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

// --- home ------------------------------------------------------------------

console.log('\nhome');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

check('title is set', (await page.title()).includes('Muhammad Alfaz'));
check('exactly one h1', (await page.locator('h1').count()) === 1);

const canvasPainted = await page.evaluate(() => {
  const canvas = document.getElementById('particle-canvas');
  if (!canvas || !(canvas instanceof HTMLCanvasElement)) return false;
  if (canvas.width === 0) return false;
  const context = canvas.getContext('2d');
  if (!context) return false;
  // Sample the whole surface; the particle field should leave some pixels lit.
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let lit = 0;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] > 0) lit += 1;
  }
  return lit > 0;
});
check('particle canvas is painting', canvasPainted);

/*
 * The neuron network must actually animate, and impulses must appear. A static
 * or empty canvas would still pass the "is painting" check above, so sample
 * several frames and assert both movement and the bright signal pixels that
 * distinguish an active network from plain drifting dots.
 */
const frames = [];
for (let i = 0; i < 4; i += 1) {
  frames.push(
    await page.evaluate(() => {
      const canvas = document.getElementById('particle-canvas');
      if (!(canvas instanceof HTMLCanvasElement)) return { lit: 0, bright: 0 };
      const context = canvas.getContext('2d');
      if (!context) return { lit: 0, bright: 0 };
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      let bright = 0;
      for (let p = 3; p < data.length; p += 4) {
        if (data[p] > 0) lit += 1;
        if (data[p] > 90) bright += 1;
      }
      return { lit, bright };
    }),
  );
  await page.waitForTimeout(700);
}

check(
  'neuron network animates over time',
  new Set(frames.map((f) => f.lit)).size > 1,
  `lit counts: ${frames.map((f) => f.lit).join(',')}`,
);
check(
  'synapse impulses fire',
  Math.max(...frames.map((f) => f.bright)) > 0,
  `max bright: ${Math.max(...frames.map((f) => f.bright))}`,
);

// The network is background decoration, so it must stay sparse enough that
// content on top of it stays readable.
const coverage = Math.max(...frames.map((f) => f.lit)) / (1440 * 900 * 4);
check('network stays subtle', coverage < 0.25, `${(coverage * 100).toFixed(1)}% coverage`);

// The network rewires and steps signals every frame, so a dropped frame rate
// would mean the background is competing with the content for main-thread time.
const fps = await page.evaluate(
  () =>
    new Promise((resolve) => {
      let count = 0;
      const start = performance.now();
      const tick = () => {
        count += 1;
        if (performance.now() - start < 2000) {
          requestAnimationFrame(tick);
        } else {
          resolve(Math.round((count / (performance.now() - start)) * 1000));
        }
      };
      requestAnimationFrame(tick);
    }),
);
check('renders at 60fps', fps >= 50, `${fps}fps`);

check(
  'canvas fades in',
  await page.evaluate(
    () => document.getElementById('particle-canvas')?.classList.contains('is-visible') === true,
  ),
);

// Reveal only activates for elements that actually enter the viewport, and the
// home hero has none, so scroll before asserting.
await page.evaluate(() => window.scrollTo(0, 1200));
await page.waitForTimeout(700);
const revealed = await page.locator('[data-reveal].is-inview').count();
check('reveal animations activate on scroll', revealed > 0, `${revealed} revealed`);
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(300);

const heroStats = await page.locator('.hero__stat').count();
check('hero stats rendered', heroStats >= 3, `found ${heroStats}`);

// --- projects index --------------------------------------------------------

console.log('\nprojects');
await page.goto(`${BASE}/projects`, { waitUntil: 'networkidle' });

const totalItems = await page.locator('.grid__item').count();
check('all projects listed', totalItems === 22, `found ${totalItems}`);

await page.fill('#project-search', 'laravel');
await page.waitForTimeout(150);
const afterSearch = await page.locator('.grid__item:not([hidden])').count();
check('search filters the grid', afterSearch > 0 && afterSearch < totalItems, `${afterSearch} visible`);

const countText = await page.locator('#result-count').textContent();
check('result count updates', /\d+ of \d+/.test(countText ?? ''), countText ?? '');

await page.fill('#project-search', 'zzzzz-no-match');
await page.waitForTimeout(150);
check(
  'empty state appears',
  await page.locator('#empty-state').isVisible(),
);
check(
  'empty state is announced',
  (await page.locator('#result-count').getAttribute('aria-live')) === 'polite',
);

await page.click('[data-reset]');
await page.waitForTimeout(150);
check(
  'reset restores all items',
  (await page.locator('.grid__item:not([hidden])').count()) === totalItems,
);

const openChip = page.locator('[data-filter="private"]');
if ((await openChip.count()) > 0) {
  await openChip.click();
  await page.waitForTimeout(150);
  const privateCount = await page.locator('.grid__item:not([hidden])').count();
  check('visibility filter works', privateCount > 0 && privateCount < totalItems, `${privateCount} visible`);
  check('chip reports pressed state', (await openChip.getAttribute('aria-pressed')) === 'true');
  await page.locator('[data-filter="all"]').click();
}

// --- project detail --------------------------------------------------------

console.log('\nproject detail');
await page.goto(`${BASE}/projects/gsi-project`, { waitUntil: 'networkidle' });

check('one h1', (await page.locator('h1').count()) === 1);
check('h1 names the project', ((await page.locator('h1').textContent()) ?? '').includes('GSI'));
check('facts sidebar present', (await page.locator('.facts__row').count()) > 0);
check('stack tags present', (await page.locator('.tag').count()) > 0);
check('pager present', (await page.locator('.pager__link').count()) > 0);

// The card zoom must scale a single layer. An earlier version stacked two
// images and slid the top one, which only moved the bottom band.
await page.goto(`${BASE}/projects`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(900);
const card = page.locator('.card').first();
check('one image per card', (await card.locator('img').count()) === 1);
const restTransform = await card
  .locator('.card__img')
  .evaluate((el) => getComputedStyle(el).transform);
await card.hover();
await page.waitForTimeout(800);
const hoverTransform = await card
  .locator('.card__img')
  .evaluate((el) => getComputedStyle(el).transform);
check('card image zooms on hover', restTransform !== hoverTransform, `${restTransform} -> ${hoverTransform}`);
check(
  'card zoom scales uniformly (no directional slide)',
  restTransform.startsWith('matrix(1.08') && hoverTransform.startsWith('matrix(1,'),
  `${restTransform} / ${hoverTransform}`,
);

await page.goto(`${BASE}/projects/gsi-project`, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(400);

// --- client-side navigation + view transitions -----------------------------

console.log('\nview transitions');
const hasClientRouter = await page.evaluate(
  () => typeof document.startViewTransition === 'function' || !!window.__astro_transitions,
);
check('ClientRouter active', hasClientRouter);

// Navigate via an in-page link, which is what triggers a soft navigation.
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.click('a[href="/projects"]');
await page.waitForURL('**/projects', { timeout: 5000 });
await page.waitForTimeout(400);
check('soft navigation to /projects', page.url().endsWith('/projects'));

const canvasAliveAfterSwap = await page.evaluate(() => {
  const canvas = document.getElementById('particle-canvas');
  if (!(canvas instanceof HTMLCanvasElement) || canvas.width === 0) return false;
  const context = canvas.getContext('2d');
  if (!context) return false;
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
  return false;
});
check('particles still painting after swap', canvasAliveAfterSwap);

// Back navigation should restore the filter-capable DOM.
await page.goBack();
await page.waitForTimeout(500);
check('back navigation works', new URL(page.url()).pathname === '/');

// --- mobile nav ------------------------------------------------------------

console.log('\nmobile nav');
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mobilePage = await mobile.newPage();
await mobilePage.goto(`${BASE}/`, { waitUntil: 'networkidle' });

const toggle = mobilePage.locator('[data-nav-toggle]');
check('toggle visible on mobile', await toggle.isVisible());
check('nav hidden initially', !(await mobilePage.locator('[data-nav]').isVisible()));

await toggle.click();
await mobilePage.waitForTimeout(300);
check('nav opens', await mobilePage.locator('[data-nav]').isVisible());
check(
  'aria-expanded toggles',
  (await toggle.getAttribute('aria-expanded')) === 'true',
);

await mobilePage.keyboard.press('Escape');
await mobilePage.waitForTimeout(300);
check('escape closes nav', !(await mobilePage.locator('[data-nav]').isVisible()));

await toggle.click();
await mobilePage.waitForTimeout(300);
await mobilePage.click('[data-nav] a[href="/about"]');
await mobilePage.waitForTimeout(900);
check('navigated from the mobile nav', mobilePage.url().endsWith('/about'));
// The whole body is replaced by the view transition, so the nav we would be
// inspecting is a fresh element. Assert on visibility, which is what the user
// actually experiences, not on an attribute from the discarded node.
check('nav is closed after navigating', !(await mobilePage.locator('[data-nav]').isVisible()));
check(
  'page scroll is restored after closing the nav',
  !(await mobilePage.locator('html').evaluate((el) => el.classList.contains('no-scroll'))),
);

// --- reduced motion --------------------------------------------------------

console.log('\nreduced motion');
const reduced = await browser.newContext({
  reducedMotion: 'reduce',
  viewport: { width: 1280, height: 800 },
});
const reducedPage = await reduced.newPage();
await reducedPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await reducedPage.waitForTimeout(400);

check(
  'canvas hidden under reduced motion',
  await reducedPage.evaluate(() => {
    const canvas = document.getElementById('particle-canvas');
    if (!canvas) return false;
    return getComputedStyle(canvas).display === 'none';
  }),
);
check(
  'content visible under reduced motion',
  (await reducedPage.locator('[data-reveal]').first().evaluate((el) => getComputedStyle(el).opacity)) === '1',
);

// --- console ---------------------------------------------------------------

console.log('\nconsole');
const realErrors = consoleErrors.filter(
  (message) =>
    !message.includes('favicon') &&
    !message.includes('ERR_CONNECTION') &&
    !message.includes('404'),
);
check('no console errors', realErrors.length === 0, realErrors.slice(0, 3).join(' | '));

await browser.close();

console.log(`\n${passes.length} passed, ${failures.length} failed`);
if (failures.length > 0) {
  console.error('\nFailures:');
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
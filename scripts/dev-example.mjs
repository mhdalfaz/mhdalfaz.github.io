/**
 * Starts the dev server with EXAMPLE_CONTENT=on.
 *
 * A tiny wrapper rather than `cross-env` so the project does not take on a
 * dependency just to set one variable, and it works the same on Windows,
 * macOS, and Linux where `EXAMPLE_CONTENT=true astro dev` would not.
 *
 *   npm run dev:example
 */

import { spawn } from 'node:child_process';

const child = spawn('npx', ['astro', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, EXAMPLE_CONTENT: 'true' },
});

child.on('close', (code) => process.exit(code ?? 0));

// Forward interrupts so Ctrl+C stops the dev server rather than orphaning it.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal));
}
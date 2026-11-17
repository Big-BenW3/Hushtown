import { defineConfig, devices } from '@playwright/test';
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PORT = 3100;

/** Uses a preinstalled Chromium when PLAYWRIGHT_BROWSERS_PATH points at one, otherwise Playwright's own. */
function chromiumPath(): string | undefined {
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  const dir = readdirSync(root).find((d) => d.startsWith('chromium-'));
  if (!dir) return undefined;
  // Playwright has used both folder names across versions.
  return ['chrome-linux64', 'chrome-linux']
    .map((folder) => join(root, dir, folder, 'chrome'))
    .find((candidate) => existsSync(candidate));
}

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: { executablePath: chromiumPath(), args: ['--no-sandbox'] },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // A fast clock lets a whole game run in seconds; production uses real time.
    command: `npx next start -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { HUSHTOWN_TIME_SCALE: '0.1' },
  },
});

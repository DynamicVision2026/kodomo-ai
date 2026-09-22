import { defineConfig, devices } from '@playwright/test';

/**
 * AD-12 Pass 1 screenshot/regression coverage for the 12 static states (src/ad12/gallery/
 * main.tsx, served at /design/ad12/ — never a product route). Only Chromium is available in
 * this environment (no WebKit/Firefox binaries installed, and installing them is out of scope
 * here) — "iPad Safari" and "Chromebook" below are therefore Chromium at each device's own
 * viewport size, not a real WebKit render. A real pre-ship pass still needs an actual Safari
 * run on real iPadOS hardware; this config proves the LAYOUT and the invariants (yellow
 * discipline, equal weight, tap targets, reduced-motion) that don't depend on the rendering
 * engine, not Safari-specific font/compositing quirks.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  use: {
    baseURL: 'http://localhost:4173',
    // Optional escape hatch for a sandbox whose pre-installed Chromium revision is older than
    // this @playwright/test version's own default (headless-shell) executable expects — set
    // PLAYWRIGHT_CHROMIUM_PATH to a real `chrome`/`chromium` binary already on disk rather than
    // running `playwright install`. Unset (the normal case, e.g. CI with a matched install) —
    // Playwright resolves its own bundled browser exactly as it always has.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173/design/ad12/',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'ipad-chromium',
      use: { ...devices['iPad (gen 7)'], browserName: 'chromium' },
    },
    {
      name: 'chromebook-chromium',
      use: {
        browserName: 'chromium',
        viewport: { width: 1366, height: 768 },
      },
    },
  ],
});

import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests against a running site: `E2E_BASE_URL=https://staging.example npm run test:e2e`.
 * Defaults to a local dev stack (web on :3200 with the API on :3201, seeded).
 */
// PW_CHROMIUM_PATH lets you reuse a system Chromium instead of `npx playwright install`.
const launchOptions = {
  executablePath: process.env.PW_CHROMIUM_PATH || undefined,
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
};

/** Specs that run the device matrix (test/e2e/devices.ts) instead of the desktop/mobile projects. */
const MATRIX_SPECS = /(mobile-matrix|tour|matrix-[a-z0-9-]+)\.spec\.ts$/;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3200', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', testIgnore: MATRIX_SPECS, use: { ...devices['Desktop Chrome'], launchOptions } },
    { name: 'mobile', testIgnore: MATRIX_SPECS, use: { ...devices['Pixel 7'], launchOptions } },
    // Mobile + SEO QA device matrix (13 Nov 2026): each spec opens the 12 device sizes itself, in both engines.
    { name: 'matrix-chromium', testMatch: MATRIX_SPECS, use: { browserName: 'chromium', launchOptions } },
    { name: 'matrix-webkit', testMatch: MATRIX_SPECS, use: { browserName: 'webkit' } },
  ],
});

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

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3200', trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions }  },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions }  },
  ],
});

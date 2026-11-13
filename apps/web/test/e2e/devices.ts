import { devices, expect, type Browser, type BrowserContextOptions, type Page } from '@playwright/test';

/** The Mobile + SEO QA device matrix (13 Nov 2026), shared by mobile-matrix.spec.ts and the per-task specs. */
export type Device = { id: string; label: string; base: BrowserContextOptions; viewport: { width: number; height: number } };
const desktop = devices['Desktop Chrome'];
export const MATRIX: Device[] = [
  { id: 'se1-320x568', label: 'iPhone SE (1st gen)', base: devices['iPhone SE'], viewport: { width: 320, height: 568 } },
  { id: 's8-360x740', label: 'Galaxy S8/S9', base: devices['Galaxy S8'], viewport: { width: 360, height: 740 } },
  { id: 'se3-375x667', label: 'iPhone SE 2/3', base: devices['iPhone SE (3rd gen)'], viewport: { width: 375, height: 667 } },
  { id: 'x-375x812', label: 'iPhone X/11 Pro', base: devices['iPhone X'], viewport: { width: 375, height: 812 } },
  { id: 'i12-390x844', label: 'iPhone 12–15', base: devices['iPhone 12'], viewport: { width: 390, height: 844 } },
  { id: 'pixel7-412x915', label: 'Pixel 7', base: devices['Pixel 7'], viewport: { width: 412, height: 915 } },
  { id: 'promax-430x932', label: 'iPhone Pro Max', base: devices['iPhone 14 Pro Max'], viewport: { width: 430, height: 932 } },
  { id: 'ipad-768x1024', label: 'iPad portrait', base: devices['iPad (gen 6)'], viewport: { width: 768, height: 1024 } },
  { id: 'ipad-1024x768', label: 'iPad landscape', base: devices['iPad (gen 6) landscape'], viewport: { width: 1024, height: 768 } },
  { id: 'phone-844x390', label: 'Phone landscape', base: devices['iPhone 12 landscape'], viewport: { width: 844, height: 390 } },
  { id: 'desktop-1280x800', label: 'Desktop 1280', base: desktop, viewport: { width: 1280, height: 800 } },
  { id: 'desktop-1440x900', label: 'Desktop 1440', base: desktop, viewport: { width: 1440, height: 900 } },
];


export const ONLY = process.env.MATRIX_DEVICES?.split(',');
export const devicesToRun = () => MATRIX.filter((x) => !ONLY || ONLY.some((o) => x.id.startsWith(o)));

export async function openOn(browser: Browser, d: Device, baseURL: string) {
  const { defaultBrowserType: _ignored, ...opts } = d.base as BrowserContextOptions & { defaultBrowserType?: string };
  return browser.newContext({ ...opts, viewport: d.viewport, screen: d.viewport, baseURL });
}

/** Finish (or wait out) the first-visit tour so the map itself can be checked. */
export async function dismissTour(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'Guided tour' });
  await dialog.waitFor({ timeout: 6000 }).catch(() => undefined);
  if (await dialog.isVisible().catch(() => false)) await dialog.getByRole('button', { name: /skip/i }).click();
  await expect(dialog).toBeHidden();
}


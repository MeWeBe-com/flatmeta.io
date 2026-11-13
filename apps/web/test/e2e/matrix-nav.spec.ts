import { expect, test } from '@playwright/test';
import { devicesToRun, openOn } from './devices';

/**
 * M3: the menu on the map page and on every other page, on every device of the matrix (Chromium and WebKit): it opens,
 * says so (aria-expanded / aria-controls), lists Sign in and every section, every link answers 200, Esc closes it and
 * focus returns to the button. From 1024 px the sections are in the header instead.
 */
const SECTIONS = ['Explore', 'Companies', 'Marketplace', 'Clans', 'Leaderboards', 'For business', 'Pricing', 'About'];

test.describe('site menu', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const d of devicesToRun()) {
    test(`${d.id}: menu on the map and on /pricing`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const ctx = await openOn(browser, d, baseURL!);
      await ctx.addInitScript(() => {
        localStorage.setItem('fm-tour-done', '1');
        // Layout, not motion (headless WebKit barely advances CSS motion while the software-drawn map runs).
        const css = '*,*::before,*::after{animation:none!important;transition:none!important}';
        document.addEventListener('DOMContentLoaded', () => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css })));
      });
      /** A real click at the button's centre after proving nothing covers it (frames stall in WebKit, see tour.spec). */
      const tapTop = async (l: import('@playwright/test').Locator) => {
        expect(await l.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!h && (h === el || el.contains(h)); })).toBe(true);
        await l.click({ force: true });
      };
      const page = await ctx.newPage();
      for (const path of ['/', '/pricing']) {
        await page.goto(path);
        const menu = page.getByRole('button', { name: 'Menu' });
        if (d.viewport.width >= 1024) {
          // Desktop layouts: no menu button; the sections and Sign in are in the header.
          await expect(menu).toBeHidden();
          await expect(page.getByRole('button', { name: 'Sign in' }).first()).toBeVisible();
          continue;
        }
        await expect(menu).toBeVisible();
        const box = (await menu.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await tapTop(menu);
        await expect(menu).toHaveAttribute('aria-expanded', 'true');
        const panelId = await menu.getAttribute('aria-controls');
        const panel = page.locator(`[id="${panelId}"]`);
        await expect(panel).toBeVisible();
        // The whole panel is on screen.
        const pb = (await panel.boundingBox())!;
        expect(pb.x).toBeGreaterThanOrEqual(0);
        expect(pb.x + pb.width).toBeLessThanOrEqual(d.viewport.width + 0.5);
        await expect(panel.getByRole('button', { name: 'Sign in' })).toBeVisible();
        for (const name of SECTIONS) await expect(panel.getByRole('link', { name, exact: true })).toBeVisible();
        await expect(panel.getByRole(path === '/' ? 'button' : 'link', { name: 'Replay tour' })).toBeVisible();
        if (path === '/') {
          // Every link resolves (once is enough).
          for (const href of await panel.getByRole('link').evaluateAll((els) => els.map((e) => e.getAttribute('href')!))) {
            expect((await page.request.get(href)).status(), href).toBe(200);
          }
        }
        // Esc closes it and focus goes back to the button.
        await page.keyboard.press('Escape');
        await expect(panel).toBeHidden();
        await expect(menu).toHaveAttribute('aria-expanded', 'false');
        await expect(menu).toBeFocused();
        // Sign in is reachable from the menu.
        await tapTop(menu);
        await tapTop(panel.getByRole('button', { name: 'Sign in' }));
        await expect(page.getByRole('dialog', { name: /sign in/i })).toBeVisible();
      }
      await ctx.close();
    });
  }
});

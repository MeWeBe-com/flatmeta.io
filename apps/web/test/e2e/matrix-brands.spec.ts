import { expect, test } from '@playwright/test';
import { devicesToRun, openOn } from './devices';

/**
 * M7: /brands on every device of the matrix (Chromium and WebKit): no sideways scroll, the countries are one strip on
 * phones with the current one in view, logo badges contain their logo on a neutral surface (or show initials), sector
 * names have one casing, and the list is paginated with every page its own canonical URL.
 */
test.describe('companies directory', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const d of devicesToRun()) {
    test(`${d.id}: /brands and /brands/<country>`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const ctx = await openOn(browser, d, baseURL!);
      const page = await ctx.newPage();
      const W = d.viewport.width;
      const phone = W < 768;
      await page.goto('/brands');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(W);

      // Countries: one sideways strip on phones, wrapped rows from 768 px.
      const strip = page.getByTestId('chip-strip');
      const chips = strip.getByRole('link');
      const n = await chips.count();
      expect(n).toBeGreaterThan(1);
      const tops = new Set(await chips.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top))));
      if (phone) {
        expect(tops.size, 'one line of chips').toBe(1);
        const box = (await strip.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(W + 0.5);
      }
      if (d.base.hasTouch) for (const b of await chips.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(b).toBeGreaterThanOrEqual(44);

      // Cards: badges are contained logos on the neutral surface, or initials; sectors start with a capital.
      const cards = page.locator('main ul > li');
      expect(await cards.count()).toBeGreaterThan(0);
      for (const img of await page.getByTestId('logo-badge').locator('img').all()) {
        expect(await img.evaluate((e) => getComputedStyle(e).objectFit)).toBe('contain');
        expect(await img.evaluate((e) => getComputedStyle(e.parentElement!).backgroundColor)).toBe('rgb(244, 245, 248)');
      }
      for (const line of await cards.locator('.muted').allInnerTexts()) {
        const sector = line.split(' · ')[0]!;
        expect(sector, line).toMatch(/^[A-Z0-9]/);
      }
      // No text under 12 px in the list.
      expect(await cards.evaluateAll((els) => els.flatMap((li) => [...li.querySelectorAll('*')].filter((e) => e.childNodes.length && [...e.childNodes].some((c) => c.nodeType === 3 && c.textContent!.trim()) && parseFloat(getComputedStyle(e).fontSize) < 11.95).map((e) => e.textContent)))).toEqual([]);

      // Paginated: page 2 links back, says which page it is, and is its own canonical URL.
      const next = page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Next' });
      if (await next.count()) {
        await expect(next).toHaveAttribute('rel', 'next');
        await page.goto((await next.getAttribute('href'))!);
        await expect(page.getByText('Page 2')).toBeVisible();
        await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/brands\?page=2$/);
        await expect(page.getByRole('navigation', { name: 'Pages' }).getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/brands');
      }

      // A country page: its chip is current and scrolled into view inside the strip.
      const last = await chips.last().getAttribute('href');
      await page.goto(last!);
      const current = page.getByTestId('chip-strip').locator('[aria-current="page"]');
      await expect(current).toHaveAttribute('href', last!);
      await expect
        .poll(() => current.evaluate((e) => { const r = e.getBoundingClientRect(); const s = e.parentElement!.getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1; }))
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(W);
      await ctx.close();
    });
  }
});

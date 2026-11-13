import { expect, test } from '@playwright/test';
import { devicesToRun, openOn } from './devices';

/**
 * M6: /explore's sort tabs and categories on every device of the matrix (Chromium and WebKit): one sideways strip
 * each on phones (snap, faded edge where there is more), never a sideways page, 44 px targets on touch screens, and
 * the chip just chosen scrolled into view.
 */
test.describe('explore filters', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const d of devicesToRun()) {
    test(`${d.id}: sort tabs and category strip`, async ({ browser, baseURL }) => {
      test.setTimeout(120_000);
      const ctx = await openOn(browser, d, baseURL!);
      const page = await ctx.newPage();
      const W = d.viewport.width;
      await page.goto('/explore');
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(W);
      const cats = page.getByRole('navigation', { name: 'Categories' });
      const tabs = page.getByRole('navigation', { name: 'Sort' });
      const chips = cats.getByRole('button');
      expect(await chips.count()).toBeGreaterThan(5);
      for (const strip of [cats, tabs]) {
        const box = (await strip.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(W + 0.5);
        if (d.base.hasTouch) for (const h of await strip.getByRole('button').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
      }
      const strip = cats.getByTestId('chip-strip');
      if (W < 768) {
        // One line, scrolling sideways, with the far edge faded while there is more.
        expect(new Set(await chips.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))).size).toBe(1);
        expect(await strip.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true);
        await expect(strip).toHaveAttribute('data-end', 'false');
        expect(await strip.evaluate((e) => getComputedStyle(e).scrollSnapType)).toContain('x');
      }
      // Choosing the last category: it is pressed, in the URL, and scrolled into view inside its strip.
      const last = chips.last();
      await last.evaluate((e) => (e as HTMLButtonElement).click()); // reachable by scrolling; the click is what matters here
      await expect(page).toHaveURL(/category=community/);
      await expect(last).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(() => last.evaluate((e) => { const r = e.getBoundingClientRect(); const s = e.parentElement!.getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1; }))
        .toBe(true);
      // Reloaded with the filter set, it starts in view too.
      await page.reload();
      await expect
        .poll(() => cats.locator('[aria-pressed="true"]').evaluate((e) => { const r = e.getBoundingClientRect(); const s = e.parentElement!.getBoundingClientRect(); return r.left >= s.left - 1 && r.right <= s.right + 1; }))
        .toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(W);
      await ctx.close();
    });
  }
});

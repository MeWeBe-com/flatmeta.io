import { expect, test } from '@playwright/test';
import { devicesToRun, openOn } from './devices';

/**
 * M10: keyboard hints ("Esc to close" in the search panel, ⌘K on the search bar) only on devices with a keyboard and
 * a mouse ((hover: hover) and (pointer: fine)), never on phones or tablets, on every device of the matrix.
 */
test.describe('keyboard hints', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const d of devicesToRun()) {
    test(`${d.id}: Esc and ⌘K hints only with a keyboard and mouse`, async ({ browser, baseURL }) => {
      test.setTimeout(90_000);
      const ctx = await openOn(browser, d, baseURL!);
      await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
      const page = await ctx.newPage();
      await page.goto('/');
      const fine = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
      expect(fine, 'the matrix emulates touch on every phone and tablet').toBe(!d.base.hasTouch);
      const search = page.getByRole('button', { name: /Search places/ }).first();
      await expect(search).toBeVisible({ timeout: 20_000 });
      const kbd = search.locator('kbd');
      if (fine) await expect(kbd).toBeVisible();
      else await expect(kbd).toBeHidden();
      await search.click({ force: true });
      const hint = page.getByTestId('esc-hint');
      await expect(page.getByRole('dialog', { name: 'Search' })).toBeVisible({ timeout: 15_000 }); // loaded on first open
      if (fine) await expect(hint).toBeVisible();
      else await expect(hint).toBeHidden();
      await ctx.close();
    });
  }
});

import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { devicesToRun, openOn } from './devices';

/**
 * M1: the first-visit tour on every device of the matrix, in Chromium and WebKit. Every step's card is fully inside
 * the viewport, doesn't cover the control it points at, sits above every floating control (its Next button is what
 * a tap at its centre hits), the buttons are 44 px, and the four steps complete. Tapping outside never loses the tour.
 */
const OUT = path.resolve(__dirname, '../../test-results/mobile');

async function cardState(page: Page) {
  return page.evaluate(() => {
    const card = document.querySelector('[data-testid="tour-card"]')!.getBoundingClientRect();
    const spot = document.querySelector('[data-testid="tour-spotlight"]')?.getBoundingClientRect() ?? null;
    const buttons = [...document.querySelectorAll('[data-testid="tour-card"] button')].map((b) => {
      const r = b.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { text: (b as HTMLElement).innerText, w: r.width, h: r.height, onTop: !!hit && (hit === b || b.contains(hit)) };
    });
    return { card: { left: card.left, top: card.top, right: card.right, bottom: card.bottom }, spot: spot && { left: spot.left, top: spot.top, right: spot.right, bottom: spot.bottom }, vw: innerWidth, vh: innerHeight, buttons };
  });
}

test.describe('guided tour on every device', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const d of devicesToRun()) {
    test(`${d.id}: every step on screen, above everything, and the tour completes`, async ({ browser, baseURL }) => {
      test.setTimeout(90_000);
      const engine = browser.browserType().name();
      const ctx = await openOn(browser, d, baseURL!);
      // This checks layout, not motion: animations and transitions off (as Playwright's screenshots do). Headless WebKit
      // draws frames so slowly while the software-rendered map runs that CSS motion barely advances.
      await ctx.addInitScript(() => {
        const css = '*,*::before,*::after{animation:none!important;transition:none!important}';
        document.addEventListener('DOMContentLoaded', () => document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css })));
      });
      const page = await ctx.newPage();
      await page.goto('/');
      const dialog = page.getByRole('dialog', { name: 'Guided tour' });
      await expect(dialog).toBeVisible({ timeout: 10_000 });
      await expect(dialog).toHaveAttribute('aria-modal', 'true');
      mkdirSync(path.join(OUT, d.id), { recursive: true });
      for (let step = 1; step <= 4; step++) {
        await expect(dialog.getByText(`Step ${step} of 4`)).toBeVisible();
        await page.waitForTimeout(300); // the layout pass
        const s = await cardState(page);
        const where = `${engine} ${d.id} step ${step}`;
        expect(s.card.left, `${where}: left edge`).toBeGreaterThanOrEqual(0);
        expect(s.card.top, `${where}: top edge`).toBeGreaterThanOrEqual(0);
        expect(s.card.right, `${where}: right edge`).toBeLessThanOrEqual(s.vw);
        expect(s.card.bottom, `${where}: bottom edge`).toBeLessThanOrEqual(s.vh);
        for (const b of s.buttons) {
          expect(b.h, `${where}: "${b.text}" height`).toBeGreaterThanOrEqual(44);
          expect(b.w, `${where}: "${b.text}" width`).toBeGreaterThanOrEqual(44);
          expect(b.onTop, `${where}: "${b.text}" is covered`).toBe(true);
        }
        if (s.spot) {
          // The card never covers the control it is pointing at.
          const overlap = !(s.card.right <= s.spot.left || s.card.left >= s.spot.right || s.card.bottom <= s.spot.top || s.card.top >= s.spot.bottom);
          expect(overlap, `${where}: card covers its target`).toBe(false);
        }
        if (step >= 2) await expect(dialog.getByRole('button', { name: 'Back' })).toBeVisible();
        else await expect(dialog.getByRole('button', { name: 'Back' })).toHaveCount(0);
        await page.screenshot({ path: path.join(OUT, d.id, `tour-step${step}-${engine}.png`) });
        if (step === 1) {
          // A tap outside the card (here: on the logo's spot) does nothing.
          await page.mouse.click(20, 20);
          await page.waitForTimeout(200);
          await expect(dialog).toBeVisible();
          await expect(dialog.getByText('Step 1 of 4')).toBeVisible();
        }
        // A real mouse click at the button's centre. `force` only skips Playwright's frame-based "stable" wait (frames
        // stall in headless WebKit while the map draws); the elementFromPoint check above proved nothing covers it.
        await dialog.getByRole('button', { name: step === 4 ? 'Let’s go' : 'Next' }).click({ force: true });
      }
      await expect(dialog).toBeHidden();
      expect(await page.evaluate(() => localStorage.getItem('fm-tour-done'))).toBe('1');
      await ctx.close();
    });
  }
});

test.describe('guided tour: keyboard, Back, replay', () => {
  test('arrows move, Back goes back, Esc skips, and the help menu replays it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'keyboard behaviour: once is enough');
    await page.goto('/');
    const dialog = page.getByRole('dialog', { name: 'Guided tour' });
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('button', { name: 'Next' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText('Step 2 of 4')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await expect(dialog.getByText('Step 3 of 4')).toBeVisible();
    await page.keyboard.press('ArrowLeft');
    await expect(dialog.getByText('Step 2 of 4')).toBeVisible();
    await dialog.getByRole('button', { name: 'Back' }).click();
    await expect(dialog.getByText('Step 1 of 4')).toBeVisible();
    // Tab stays inside the card.
    for (let k = 0; k < 4; k++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[data-testid="tour-card"]'))).toBe(true);
    // The map's shortcuts wait: "/" doesn't open search under the tour.
    await page.keyboard.press('/');
    await expect(page.getByRole('dialog', { name: /search/i })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem('fm-tour-done'))).toBe('1');
    // Done stays done after a reload…
    await page.reload();
    await page.waitForTimeout(2200);
    await expect(dialog).toBeHidden();
    // …and the help (?) menu replays it.
    const help = page.getByRole('button', { name: 'Help' });
    await expect(help).toHaveAttribute('aria-expanded', 'false');
    await help.click();
    await expect(help).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('menuitem', { name: 'Replay tour' }).click();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Step 1 of 4')).toBeVisible();
    // Modal: the page behind is inert while it runs…
    expect(await page.evaluate(() => !!document.getElementById('main')?.closest('[inert]'))).toBe(true);
    // …and when it ends, focus returns to the Help button and the page is usable again.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
    expect(await page.evaluate(() => !!document.getElementById('main')?.closest('[inert]'))).toBe(false);
  });
});

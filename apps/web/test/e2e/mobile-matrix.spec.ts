import { expect, test, type Page } from '@playwright/test';
import { devicesToRun, openOn } from './devices';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Mobile + SEO QA (13 Nov 2026), MX: the device matrix. Every page on every device, in Chromium and WebKit:
 *   - no horizontal scroll (documentElement.scrollWidth <= innerWidth);
 *   - no visible interactive element outside the viewport or covered by another element (elementFromPoint at its centre);
 *   - tap targets at least 44×44 CSS px on touch devices (24×24 on desktop pointers: WCAG 2.5.8; see RELEASE-REPORT);
 *   - text at least 12 px;
 *   - a full-page screenshot per device and page in test-results/mobile/<device>/<page>-<engine>.png (a CI artifact).
 * Runs in the matrix-chromium and matrix-webkit projects (playwright.config.ts), one context per device and page.
 * MATRIX_DEVICES=se1,x limits the devices (prefixes of the ids in devices.ts).
 */

export const PAGES = [
  { id: 'home-tour', path: '/' }, // first visit: the guided tour is open
  { id: 'home', path: '/' }, // the map once the tour is done
  { id: 'plot', path: '/p/tesla' },
  { id: 'brands', path: '/brands' },
  { id: 'explore', path: '/explore' },
  { id: 'pricing', path: '/pricing' },
  { id: 'business', path: '/business' },
  { id: 'signin', path: '/login' },
];

/**
 * Elements the tap-target rule does not apply to, each with its reason. Everything else that can be tapped must be
 * at least 44×44 on touch screens.
 */
const TAP_ALLOWLIST: { selector: string; reason: string }[] = [
  { selector: '[data-inline-link], p a, li > p a, .prose a, blockquote a', reason: 'links inside running text (WCAG 2.5.8 "inline" exception)' },
  { selector: '.sr-only, .sr-only *, [data-skip-link]', reason: 'visually hidden until focused (skip link)' },
  { selector: '.maplibregl-canvas', reason: 'the map canvas itself (the whole screen is the target)' },
];
/** Text the 12 px rule does not apply to. */
const TEXT_ALLOWLIST: { selector: string; reason: string }[] = [
  { selector: 'kbd', reason: 'keyboard shortcut hints, shown on desktop only' },
  { selector: '.sr-only', reason: 'not visible' },
];

/**
 * Bugs reproduced by this spec and not fixed yet, by task. Each fix removes its entries; at the end of the
 * Mobile + SEO QA list this is empty and every check applies everywhere.
 */
type Check = 'hscroll' | 'offscreen' | 'covered' | 'tap' | 'text';
const KNOWN: { task: string; page: string; check: Check; devices?: RegExp }[] = [
  // Baseline of 13 Nov 2026 (production build before the fixes); the task that fixes each one removes it.
  ...(['covered', 'offscreen', 'tap', 'text'] as const).map((check) => ({ task: 'M4', page: 'home', check })),
  // WebKit also scrolls sideways at 320 px, 844x390 and on the iPad (the header and card rows are wider there).
  ...(['hscroll', 'offscreen', 'tap', 'text'] as const).map((check) => ({ task: 'M5', page: 'plot', check })),
  ...(['hscroll', 'offscreen', 'tap', 'text'] as const).map((check) => ({ task: 'M6', page: 'explore', check })),
  ...(['hscroll', 'offscreen', 'tap', 'text'] as const).map((check) => ({ task: 'M7', page: 'brands', check })),
  ...(['hscroll', 'offscreen', 'tap', 'text'] as const).map((check) => ({ task: 'M11', page: 'pricing', check })),
  ...(['hscroll', 'offscreen', 'tap', 'text'] as const).map((check) => ({ task: 'M3', page: 'business', check })),
  ...(['hscroll', 'offscreen', 'covered', 'tap', 'text'] as const).map((check) => ({ task: 'M3', page: 'signin', check })),
];

type Violation = { check: Check; detail: string };
type Measured = { violations: Violation[] };

export async function measure(page: Page, touch: boolean): Promise<Measured> {
  return page.evaluate(
    ({ touch, tapAllow, textAllow }) => {
      const out: { check: 'hscroll' | 'offscreen' | 'covered' | 'tap' | 'text'; detail: string }[] = [];
      const W = window.innerWidth;
      const H = window.innerHeight;
      const doc = document.documentElement;
      if (doc.scrollWidth > W) out.push({ check: 'hscroll', detail: `scrollWidth ${doc.scrollWidth} > ${W}` });
      const describe = (el: Element) => {
        const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        const id = el.id ? `#${el.id}` : '';
        return `${el.tagName.toLowerCase()}${id}${el.getAttribute('data-testid') ? `[data-testid=${el.getAttribute('data-testid')}]` : ''} "${name}"`;
      };
      const visible = (el: Element) => {
        const r = el.getBoundingClientRect();
        if (r.width < 1 || r.height < 1) return false;
        if (el.closest('[aria-hidden="true"], [inert]')) return false;
        let n: Element | null = el;
        while (n) {
          const s = getComputedStyle(n);
          if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
          n = n.parentElement;
        }
        return true;
      };
      const fixedAncestor = (el: Element) => {
        for (let n: Element | null = el; n; n = n.parentElement) {
          const p = getComputedStyle(n).position;
          if (p === 'fixed' || p === 'sticky') return n;
        }
        return null;
      };
      const scrollerAncestor = (el: Element) => {
        for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
          const s = getComputedStyle(n);
          if (/(auto|scroll)/.test(s.overflowX) || /(auto|scroll)/.test(s.overflowY)) return n;
        }
        return null;
      };
      // When a modal dialog is open, only its contents are interactive (the rest is behind the backdrop by design).
      const dialogs = [...document.querySelectorAll('[aria-modal="true"]')].filter(visible);
      const scope: ParentNode = dialogs.length ? dialogs[dialogs.length - 1]! : document;
      const interactive = [...scope.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], [role=tab], [role=menuitem]')].filter(
        (el) => visible(el) && !(el as HTMLButtonElement).disabled,
      );
      const matches = (el: Element, list: { selector: string }[]) => list.some((a) => el.matches(a.selector));
      const startY = window.scrollY;
      for (const el of interactive) {
        const fixed = fixedAncestor(el);
        const scroller = scrollerAncestor(el);
        let r = el.getBoundingClientRect();
        // Normal-flow elements: scroll them to the middle of the screen first (the page scrolls; the viewport doesn't).
        if (!fixed && !scroller) {
          window.scrollTo(0, Math.max(0, window.scrollY + r.top + r.height / 2 - H / 2));
          r = el.getBoundingClientRect();
        }
        if (scroller) {
          // Inside a scroll strip: it only has to be reachable within its scroller, which must itself be on screen.
          const sr = scroller.getBoundingClientRect();
          if (sr.left < -1 || sr.right > W + 1) out.push({ check: 'offscreen', detail: `${describe(scroller)} scroller at x ${Math.round(sr.left)}→${Math.round(sr.right)}` });
        } else if (r.left < -1 || r.right > W + 1 || (fixed && (r.top < -1 || r.bottom > H + 1))) {
          out.push({ check: 'offscreen', detail: `${describe(el)} at x ${Math.round(r.left)}→${Math.round(r.right)}, y ${Math.round(r.top)}→${Math.round(r.bottom)}` });
          continue;
        }
        if (!scroller && !matches(el, tapAllow)) {
          const cx = Math.min(W - 1, Math.max(0, r.left + r.width / 2));
          const cy = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
          const hit = document.elementFromPoint(cx, cy);
          if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
            const label = hit.closest('label');
            if (!(label && label.contains(el))) out.push({ check: 'covered', detail: `${describe(el)} covered by ${describe(hit)}` });
          }
        }
        if (!matches(el, tapAllow)) {
          const min = touch ? 44 : 24;
          if (r.width < min - 0.5 || r.height < min - 0.5) out.push({ check: 'tap', detail: `${describe(el)} ${Math.round(r.width)}×${Math.round(r.height)}` });
        }
      }
      window.scrollTo(0, startY);
      // Text size: every visible text node's element.
      const walker = document.createTreeWalker(scope === document ? document.body : (scope as Element), NodeFilter.SHOW_TEXT);
      const seen = new Set<Element>();
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (!n.textContent?.trim()) continue;
        const el = n.parentElement;
        if (!el || seen.has(el)) continue;
        seen.add(el);
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(el.tagName) || matches(el, textAllow) || el.closest('svg, .maplibregl-ctrl-attrib-inner')) continue;
        if (!visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        if (size < 11.95) out.push({ check: 'text', detail: `${describe(el)} ${size}px` });
      }
      return { violations: out };
    },
    { touch, tapAllow: TAP_ALLOWLIST, textAllow: TEXT_ALLOWLIST },
  );
}

async function plotPath(request: import('@playwright/test').APIRequestContext) {
  // /p/tesla exists wherever the company showcase is loaded (staging, production); a fresh CI database has the seed only.
  const r = await request.get('/api/v1/plots/tesla').catch(() => null);
  return r?.ok() ? '/p/tesla' : '/p/flatmeta-hq';
}



const OUT = path.resolve(__dirname, '../../test-results/mobile');

test.describe('device matrix', () => {
  test.describe.configure({ mode: 'parallel' });
  for (const d of devicesToRun()) {
    test(`${d.id}`, async ({ browser, request, baseURL }) => {
      test.setTimeout(240_000);
      const engine = browser.browserType().name();
      const plot = await plotPath(request);
      const touch = !!d.base.hasTouch;
      const results: Record<string, Violation[]> = {};
      for (const p of PAGES) {
        const ctx = await openOn(browser, d, baseURL!);
        if (p.id === 'home') await ctx.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
        const page = await ctx.newPage();
        await page.goto(p.id === 'plot' ? plot : p.path, { waitUntil: 'domcontentloaded' });
        // The map keeps fetching tiles, so "network idle" never comes there: other pages wait for it (briefly).
        if (p.path === '/') await page.waitForLoadState('load').catch(() => undefined);
        else await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
        if (p.id === 'home-tour') await page.getByRole('dialog', { name: 'Guided tour' }).waitFor({ timeout: 8000 });
        if (p.id === 'home') await page.waitForTimeout(800);
        const m = await measure(page, touch);
        const known = KNOWN.filter((k) => k.page === p.id && (!k.devices || k.devices.test(d.id)));
        results[p.id] = m.violations.filter((v) => !known.some((k) => k.check === v.check));
        mkdirSync(path.join(OUT, d.id), { recursive: true });
        await page.screenshot({ path: path.join(OUT, d.id, `${p.id}-${engine}.png`), fullPage: true, timeout: 20_000 }).catch(() => undefined);
        await ctx.close();
      }
      writeFileSync(path.join(OUT, `results-${engine}-${d.id}.json`), JSON.stringify({ engine, device: d.id, pages: Object.fromEntries(Object.entries(results).map(([k, v]) => [k, v.length ? v : 'pass'])) }, null, 1));
      for (const [pageId, v] of Object.entries(results)) {
        expect.soft(v.map((x) => `${x.check}: ${x.detail}`), `${engine} ${d.id} ${pageId}`).toEqual([]);
      }
    });
  }
});

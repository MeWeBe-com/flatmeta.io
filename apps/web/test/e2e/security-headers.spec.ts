import { expect, test } from '@playwright/test';

/** G2: every page sends a nonce-based CSP and frame protection; the map, live socket and chat still work under it. */
test.skip(({ isMobile }) => !!isMobile, 'headers are the same on mobile');

test('pages send a nonce CSP, frame protection and the other security headers', async ({ request }) => {
  for (const path of ['/', '/pricing', '/explore', '/legal/terms']) {
    const res = await request.get(path);
    expect(res.status(), path).toBe(200);
    const h = res.headers();
    const csp = h['content-security-policy'] ?? '';
    expect(csp, path).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    expect(csp).toMatch(/frame-ancestors 'none'/);
    expect(csp).toMatch(/object-src 'none'/);
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['referrer-policy']).toBe('strict-origin-when-cross-origin');
    // Every inline <script> in the HTML carries this response's nonce.
    const nonce = /'nonce-([^']+)'/.exec(csp)![1]!;
    const html = await res.text();
    const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((m) => m[1]!).filter((attrs) => !/type="application\/(ld\+)?json"/.test(attrs));
    expect(scripts.length).toBeGreaterThan(0);
    for (const attrs of scripts) expect(attrs, `script without the nonce on ${path}`).toContain(`nonce="${nonce}"`);
  }
  // A fresh nonce per request.
  const a = (await request.get('/pricing')).headers()['content-security-policy'];
  const b = (await request.get('/pricing')).headers()['content-security-policy'];
  expect(a).not.toBe(b);
});

test('the map, the live socket and avatars work under the CSP, with no violations', async ({ page }) => {
  const violations: string[] = [];
  page.on('console', (m) => {
    if (/Content Security Policy|Refused to (load|execute|connect|frame|apply)/i.test(m.text())) violations.push(m.text().slice(0, 300));
  });
  await page.addInitScript(() => {
    localStorage.setItem('fm-tour-done', '1');
    document.addEventListener('securitypolicyviolation', (e) => console.error(`Content Security Policy violation: ${e.violatedDirective} ${e.blockedURI}`));
  });
  await page.goto('/?at=41.3874,2.1686,15');
  await expect(page.locator('canvas.maplibregl-canvas')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.fm-avatar-me')).toHaveAttribute('data-lat', /./, { timeout: 30_000 }); // my avatar, via the live socket
  await page.getByRole('button', { name: /^Chat/ }).click();
  await expect(page.getByRole('region', { name: 'Chat' })).toBeVisible();
  await page.waitForTimeout(1500);
  expect(violations).toEqual([]);
});

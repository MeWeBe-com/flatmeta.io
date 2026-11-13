import { expect, test } from '@playwright/test';

/**
 * M9: on the map page there is exactly one live socket; it is open within 5 s and still open 30 s later, and the
 * console shows no WebSocket errors (production logged 17 failed handshakes in 10 s).
 */
test('one live socket, open within 5 s and still open after 30 s, no WebSocket errors', async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => localStorage.setItem('fm-tour-done', '1'));
  const sockets: { url: string; closed: boolean; welcomed: boolean }[] = [];
  const errors: string[] = [];
  page.on('websocket', (ws) => {
    if (!ws.url().includes('/v1/live')) return;
    const s = { url: ws.url(), closed: false, welcomed: false };
    sockets.push(s);
    ws.on('framereceived', (f) => String(f.payload).includes('"type":"welcome"') && (s.welcomed = true));
    ws.on('close', () => (s.closed = true));
  });
  page.on('console', (m) => m.type() === 'error' && /websocket/i.test(m.text()) && errors.push(m.text()));
  await page.goto('/');
  await expect.poll(() => sockets.length, { timeout: 5000 }).toBe(1);
  // Open: the server's welcome arrives within 5 s.
  await expect.poll(() => sockets[0]?.welcomed, { timeout: 5000 }).toBe(true);
  await page.waitForTimeout(30_000);
  expect(sockets).toHaveLength(1);
  expect(sockets[0]!.closed).toBe(false);
  expect(errors).toEqual([]);
});

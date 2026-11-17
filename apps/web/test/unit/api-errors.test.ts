import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, friendlyError } from '@/lib/api';

afterEach(() => vi.unstubAllGlobals());

describe('R3g helpful errors from the API client', () => {
  it('turns an HTML proxy error page into a clear message, not a JSON parse error', async () => {
    vi.stubGlobal('fetch', async () => new Response('<html><body>502 Bad Gateway</body></html>', { status: 502 }));
    await expect(api('/me')).rejects.toMatchObject({ status: 502, message: friendlyError(502) });
  });
  it('says the browser is offline when the request never reaches us', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    await expect(api('/me')).rejects.toMatchObject({ status: 0, message: /offline/ });
  });
  it('keeps the server’s own message when there is one, and explains rate limits', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 'bad_request', message: 'That code is wrong.' } }), { status: 400 }));
    await expect(api('/x')).rejects.toMatchObject({ message: 'That code is wrong.' });
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 429 }));
    await expect(api('/x')).rejects.toMatchObject({ message: /wait a minute/ });
  });
  it('never shows a raw status code', () => {
    for (const s of [0, 400, 401, 403, 404, 413, 429, 500, 502, 503]) expect(friendlyError(s)).not.toMatch(/\d{3}/);
  });
});

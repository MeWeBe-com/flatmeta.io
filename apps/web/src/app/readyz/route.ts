import { API_INTERNAL_URL as API } from '@/lib/internal';

/**
 * AD1: readiness for the auto-deploy and uptime checks. 200 when the web app and the API (database + Redis) answer;
 * 503 otherwise. `release` is the commit the web app was built from; `api.release` the commit the API runs. After a
 * switch, the auto-deploy waits until both show the new commit.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const web = (process.env.BUILD_SHA || 'unknown').slice(0, 12);
  let api: { ok: boolean; release?: string; database?: { ok: boolean }; redis?: { ok: boolean } } = { ok: false };
  try {
    const r = await fetch(`${API}/v1/health`, { cache: 'no-store', signal: AbortSignal.timeout(4000) });
    api = (await r.json()) as typeof api;
  } catch {
    api = { ok: false };
  }
  const ok = api.ok === true;
  return Response.json(
    { ok, release: web, web: { ok: true, release: web }, api: { ok, release: api.release ?? 'unknown' }, sameRelease: !!api.release && api.release.slice(0, 12) === web },
    { status: ok ? 200 : 503, headers: { 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } },
  );
}

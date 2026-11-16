/**
 * GL6: the FlatMeta uptime cron worker. Every 5 minutes it checks the health URLs (the API's /v1/health: database and
 * Redis round trips) and the home page, and posts to ALERT_WEBHOOK_URL (a Worker secret: Slack/Discord/Google Chat)
 * when a site goes down and when it recovers, not on every check. State is kept in the UPTIME KV namespace.
 * The daily run also fetches the sitemap index so the edge cache and crawlers find it warm.
 */
export const CHECKS = (env) =>
  (env.SITES ?? 'https://www.flatmeta.io,https://staging.flatmeta.io')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
    .flatMap((site) => [`${site}/api/v1/health`, `${site}/`]);

/** Up when the answer is 200 within the time limit (the health URL also says ok: true). */
export async function check(url, fetcher = fetch) {
  const started = Date.now();
  try {
    const res = await fetcher(url, { headers: { 'user-agent': 'FlatMeta-Uptime/1.0' }, signal: AbortSignal.timeout(10_000), cf: { cacheTtl: 0 } });
    let ok = res.status === 200;
    if (ok && url.endsWith('/v1/health')) ok = (await res.json().catch(() => ({}))).ok === true;
    return { url, ok, status: res.status, ms: Date.now() - started };
  } catch (err) {
    return { url, ok: false, status: 0, ms: Date.now() - started, error: String(err).slice(0, 120) };
  }
}

/** The alerts to send: one per URL whose state changed since the last run. */
export function changes(results, previous) {
  return results
    .filter((r) => (previous[r.url] ?? true) !== r.ok)
    .map((r) => (r.ok ? `✅ ${r.url} is back up (${r.ms} ms)` : `🔴 ${r.url} is DOWN (status ${r.status || 'no answer'}${r.error ? `, ${r.error}` : ''})`));
}

export default {
  async scheduled(event, env, ctx) {
    const results = await Promise.all(CHECKS(env).map((u) => check(u)));
    const previous = JSON.parse((await env.UPTIME?.get('state')) ?? '{}');
    const alerts = changes(results, previous);
    await env.UPTIME?.put('state', JSON.stringify(Object.fromEntries(results.map((r) => [r.url, r.ok]))));
    if (alerts.length && env.ALERT_WEBHOOK_URL) {
      ctx.waitUntil(fetch(env.ALERT_WEBHOOK_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: alerts.join('\n') }) }));
    }
    if (event.cron === '17 6 * * *') ctx.waitUntil(fetch('https://www.flatmeta.io/sitemap.xml').catch(() => undefined));
  },
  // GET on the worker's own URL shows the last state (handy for a status check); no secrets in it.
  async fetch(_request, env) {
    return new Response((await env.UPTIME?.get('state')) ?? '{}', { headers: { 'content-type': 'application/json' } });
  },
};

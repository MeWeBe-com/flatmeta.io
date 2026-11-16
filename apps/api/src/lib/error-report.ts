import { execSync } from 'node:child_process';
import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * GL6: the error-tracking hook. Server errors (5xx), unhandled rejections and browser errors reported by the web app
 * are sent to ERROR_WEBHOOK_URL as a short JSON message ({ text } works with Slack, Discord via /slack, Google Chat
 * and most incident tools). Never sent: request bodies, cookies, headers, emails or keys; only the route, the error
 * name and message (cut to 300 characters, emails and long tokens masked) and the release. Rate-limited (at most 20
 * a minute, the same error at most once in 10 minutes) so an outage can't flood the channel.
 */
export const release = (() => {
  if (process.env.RELEASE_SHA) return process.env.RELEASE_SHA.slice(0, 12);
  try {
    return execSync('git rev-parse --short=12 HEAD', { stdio: ['ignore', 'pipe', 'ignore'], timeout: 2000 }).toString().trim() || 'unknown';
  } catch {
    return 'unknown';
  }
})();

/** Removes things that must never leave the server in an error report. */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '<email>')
    .replace(/\b(sk|rk|pk|whsec|re|ghp|github_pat|xox[bp])_[A-Za-z0-9_]{8,}/g, '<secret>')
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, '<token>')
    .slice(0, 300);
}

type Fetch = typeof fetch;
let fetcher: Fetch = (...a) => fetch(...a);
export function setErrorReportFetchForTests(f: Fetch | null) {
  fetcher = f ?? ((...a) => fetch(...a));
  recent.clear();
  window.length = 0;
}
const recent = new Map<string, number>();
const window: number[] = [];

export interface ErrorReport { source: 'api' | 'worker' | 'web'; where: string; name: string; message: string }

/** Sends one report (or drops it when rate-limited or no webhook is set). Never throws. */
export async function reportError(r: ErrorReport): Promise<boolean> {
  const url = config.ERROR_WEBHOOK_URL;
  if (!url) return false;
  const now = Date.now();
  const key = `${r.source}|${r.where}|${r.name}|${r.message.slice(0, 80)}`;
  if ((recent.get(key) ?? 0) > now - 10 * 60_000) return false;
  while (window.length && window[0]! < now - 60_000) window.shift();
  if (window.length >= 20) return false;
  recent.set(key, now);
  window.push(now);
  if (recent.size > 500) recent.clear();
  const text = `[${config.APP_NAME} ${config.APP_ENV} ${release}] ${r.source} error at ${scrub(r.where)}: ${scrub(r.name)}: ${scrub(r.message)}`;
  try {
    const res = await fetcher(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, source: r.source, env: config.APP_ENV, release, where: scrub(r.where) }), signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'error webhook failed');
    return false;
  }
}

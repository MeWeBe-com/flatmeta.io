/**
 * GL6: tell the API about an error the browser saw (error boundaries). It forwards it, scrubbed and rate-limited, to
 * the error webhook. Fire-and-forget: reporting never breaks the error page itself.
 */
export function reportClientError(error: Error & { digest?: string }, where: string) {
  try {
    const body = JSON.stringify({ where: `${where} ${typeof location !== 'undefined' ? location.pathname : ''}`.slice(0, 200), name: (error.name || 'Error').slice(0, 100), message: (error.message || '').slice(0, 500), ...(error.digest ? { digest: error.digest.slice(0, 64) } : {}) });
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/v1/client-errors', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/v1/client-errors', { method: 'POST', headers: { 'content-type': 'application/json' }, body, keepalive: true }).catch(() => undefined);
  } catch {
    /* never throw from the error page */
  }
}

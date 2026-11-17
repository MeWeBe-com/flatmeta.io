'use client';
/**
 * R3f: funnel events (visit, demo_view, claim_start), privacy-friendly: no cookie and no identifier in the browser,
 * at most once per tab session per event, nothing sent when Do Not Track or Global Privacy Control is on. The API
 * counts unique people per day from a salted hash that changes daily.
 */
export type FunnelEvent = 'visit' | 'demo_view' | 'claim_start';

export function optedOut(nav: { doNotTrack?: string | null; globalPrivacyControl?: boolean } = typeof navigator === 'undefined' ? {} : (navigator as never)): boolean {
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

export function track(event: FunnelEvent) {
  if (typeof window === 'undefined' || optedOut()) return;
  try {
    const k = `fm-ev-${event}`;
    if (sessionStorage.getItem(k)) return;
    sessionStorage.setItem(k, '1');
  } catch {
    /* storage blocked: still count, the API dedupes per day */
  }
  void fetch('/api/v1/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: event }), keepalive: true, credentials: 'omit' }).catch(() => undefined);
}

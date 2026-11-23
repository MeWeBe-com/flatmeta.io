'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { GA_ID, PLAUSIBLE_DOMAIN } from '@/lib/config';

const KEY = 'fm-cookie-notice';
/** 'granted' | 'denied'. Only used when GA_ID is set. */
const CONSENT_KEY = 'fm-analytics-consent';
const OPEN_EVENT = 'fm:cookie-settings';

type Gtag = (...args: unknown[]) => void;
declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

const read = (k: string): string | null => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const write = (k: string, v: string) => {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
};

/** Do Not Track / Global Privacy Control: never load Google Analytics and never ask (the funnel beacon does the same). */
const optedOut = () => {
  const n = navigator as Navigator & { globalPrivacyControl?: boolean };
  return n.doNotTrack === '1' || n.globalPrivacyControl === true;
};

/** Loads GA4 once, after consent. Advertising signals stay denied (no AW- tag, no Google Signals). */
function loadGa() {
  if (!GA_ID || window.gtag) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() {
    window.dataLayer!.push(arguments);
  };
  window.gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  window.gtag('js', new Date());
  window.gtag('config', GA_ID, { allow_google_signals: false, allow_ad_personalization_signals: false });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);
}

/** Withdrawing consent: stop sending and remove the _ga cookies this site set. */
function stopGa() {
  if (GA_ID) {
    (window as unknown as Record<string, boolean>)[`ga-disable-${GA_ID}`] = true;
    window.gtag?.('consent', 'update', { analytics_storage: 'denied' });
  }
  const host = location.hostname.replace(/^www\./, '');
  for (const c of document.cookie.split(';')) {
    const name = c.split('=')[0]?.trim();
    if (name && /^_ga(_|$)/.test(name)) {
      for (const domain of ['', `; domain=.${host}`, `; domain=${location.hostname}`]) {
        document.cookie = `${name}=; Max-Age=0; path=/${domain}`;
      }
    }
  }
}

/**
 * Without GA_ID: shown once when Plausible is on (cookie-free, no personal data); it informs rather than asks.
 * With GA_ID: asks first. Google Analytics loads only after "Allow analytics"; "Essential only" loads nothing.
 * The choice can be changed from the privacy page (CookieSettingsButton).
 */
export function CookieNotice() {
  const [mode, setMode] = useState<'hidden' | 'inform' | 'ask'>('hidden');
  useEffect(() => {
    if (GA_ID) {
      if (optedOut()) return;
      const c = read(CONSENT_KEY);
      if (c === 'granted') loadGa();
      else if (c !== 'denied') setMode('ask');
      const open = () => setMode('ask');
      window.addEventListener(OPEN_EVENT, open);
      return () => window.removeEventListener(OPEN_EVENT, open);
    }
    if (PLAUSIBLE_DOMAIN && !read(KEY)) setMode('inform');
  }, []);
  if (mode === 'hidden') return null;
  if (mode === 'inform') {
    const ok = () => {
      write(KEY, '1');
      setMode('hidden');
    };
    return (
      <div role="region" aria-label="Cookie notice" className="fixed z-[60] left-3 right-3 bottom-3 sm:right-auto sm:max-w-sm glass rounded-2xl p-3 text-xs flex items-center gap-3 animate-rise">
        <p className="flex-1">
          We use one essential cookie to keep you signed in, and cookie-free, privacy-friendly analytics. No ads, no tracking.{' '}
          <Link href="/legal/privacy" className="underline">Privacy</Link>
        </p>
        <button className="btn-primary btn-sm" onClick={ok}>OK</button>
      </div>
    );
  }
  const choose = (granted: boolean) => {
    write(CONSENT_KEY, granted ? 'granted' : 'denied');
    write(KEY, '1');
    if (granted) loadGa();
    else stopGa();
    setMode('hidden');
  };
  return (
    <div role="region" aria-label="Cookie choice" className="fixed z-[60] left-3 right-3 bottom-3 sm:right-auto sm:max-w-sm glass rounded-2xl p-3 text-xs space-y-2 animate-rise">
      <p>
        We use one essential cookie to keep you signed in. With your permission we also use Google Analytics cookies to
        count visits and see which pages help. No advertising cookies.{' '}
        <Link href="/legal/privacy#cookies-and-analytics" className="underline">Privacy</Link>
      </p>
      <div className="flex gap-2 justify-end">
        <button className="btn-ghost btn-sm" onClick={() => choose(false)}>Essential only</button>
        <button className="btn-primary btn-sm" onClick={() => choose(true)}>Allow analytics</button>
      </div>
    </div>
  );
}

/** Re-opens the cookie choice (privacy page). */
export function CookieSettingsButton() {
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}>
      Cookie settings
    </button>
  );
}

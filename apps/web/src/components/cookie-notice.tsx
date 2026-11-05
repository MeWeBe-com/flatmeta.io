'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PLAUSIBLE_DOMAIN } from '@/lib/config';

const KEY = 'fm-cookie-notice';

/**
 * Shown once when analytics is on (Plausible: cookie-free, no personal data). It informs rather than asks for
 * consent, because nothing beyond the essential sign-in cookie is set.
 */
export function CookieNotice() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!PLAUSIBLE_DOMAIN) return;
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked: don't nag */
    }
  }, []);
  if (!show) return null;
  const ok = () => {
    try {
      localStorage.setItem(KEY, '1');
    } catch {
      /* ignore */
    }
    setShow(false);
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

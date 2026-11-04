'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/** Route-level error page: the site header and providers stay; only the failing page is replaced. */
export default function RouteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[flatmeta] page error', error);
  }, [error]);
  return (
    <main id="main" className="min-h-[60vh] grid place-items-center p-6 text-center">
      <div className="max-w-md space-y-3">
        <h1 className="text-xl font-bold">Something went wrong on this page</h1>
        <p className="muted text-sm">Try again. If it keeps happening, go back to the map.{error.digest ? ` (ref ${error.digest})` : ''}</p>
        <div className="flex justify-center gap-2">
          <button className="btn-primary" onClick={reset}>Try again</button>
          <Link className="btn-ghost" href="/">Back to the map</Link>
        </div>
      </div>
    </main>
  );
}

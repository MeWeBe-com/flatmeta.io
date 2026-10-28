import type { Metadata } from 'next';
import { Logo } from '@/components/ui';

export const metadata: Metadata = { title: 'Offline', robots: { index: false } };

/** Served by the service worker when a page can’t be fetched. Kept static and dependency-free. */
export default function Offline() {
  return (
    <main id="main" className="min-h-dvh grid place-items-center p-6 text-center">
      <div className="space-y-4 max-w-sm">
        <Logo size={40} className="justify-center" />
        <h1 className="text-2xl font-bold">You’re offline</h1>
        <p className="muted">The world will still be here. Check your connection and try again; pages you’ve visited recently are still available.</p>
        {/* A full reload on purpose: client navigation would not retry the network. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="btn-primary inline-flex">Try again</a>
      </div>
    </main>
  );
}

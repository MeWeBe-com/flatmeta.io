import type { Metadata } from 'next';
import Link from 'next/link';
import { PageShell } from '@/components/site-chrome';
import { EmptyState } from '@/components/ui';

// S6: a real 404 status (Next sends it for notFound() and unknown paths), its own title, never indexed, and links on.
export const metadata: Metadata = { title: 'Page not found', robots: { index: false, follow: true } };

export default function NotFound() {
  return (
    <PageShell>
      <div id="main" className="py-10">
        <EmptyState
          icon="compass"
          title="Uncharted territory"
          body="This page isn’t on our map. The plot may have been renamed or released back to the wild."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href="/" className="btn-primary">Back to the map</Link>
              <Link href="/explore" className="btn-ghost">Explore plots</Link>
              <Link href="/brands" className="btn-ghost">Companies</Link>
              <Link href="/insights" className="btn-ghost">Insights</Link>
            </div>
          }
        />
      </div>
    </PageShell>
  );
}

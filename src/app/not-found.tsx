import Link from 'next/link';
import { PageShell } from '@/components/site-chrome';
import { EmptyState } from '@/components/ui';

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
            </div>
          }
        />
      </div>
    </PageShell>
  );
}

'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PageShell } from '@/components/site-chrome';
import { useSession } from '@/components/providers';
import { Logo } from '@/components/ui';

function LoginInner() {
  const { me, openSignIn, loading } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get('next') ?? '/dashboard';
  useEffect(() => {
    if (loading) return;
    if (me.user) router.replace(next.startsWith('/') ? next : '/dashboard');
    else openSignIn(params.get('error') ? 'That sign-in didn’t work. Try the email code instead.' : undefined, () => router.replace(next));
  }, [loading, me.user, next, openSignIn, params, router]);
  return (
    <div className="min-h-[50vh] grid place-items-center text-center">
      <div>
        <Logo size={48} />
        <p className="muted mt-4">Sign in with a code we email you. No password needed.</p>
        <button className="btn-primary mt-6" onClick={() => openSignIn(undefined, () => router.replace(next))}>Sign in</button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <PageShell>
      <Suspense>
        <LoginInner />
      </Suspense>
    </PageShell>
  );
}

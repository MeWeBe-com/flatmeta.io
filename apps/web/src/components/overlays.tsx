'use client';

import Link from 'next/link';
import { clearReferral, storedReferral } from '@/lib/referral';
import { useEffect, useRef, useState } from 'react';
import { Mail, Sparkles, CheckCircle2, AlertTriangle, Info } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { RARITY_COLOR } from '@/lib/format';
import { GOOGLE_AUTH, PAID_CHECKOUT } from '@/lib/config';
import { t } from '@/lib/i18n';
import type { GameResult, Me } from '@/lib/types';
import { useGame, useSession } from './providers';
import { Modal, NamedIcon, Spinner, clsx } from './ui';

function Toasts() {
  const { toasts, dismiss } = useGame();
  return (
    <div className="fixed z-[70] top-20 right-4 left-4 sm:left-auto sm:w-80 flex flex-col gap-2 pointer-events-none" aria-live="polite">
      {toasts.map((x) => {
        const color = x.kind === 'achievement' ? RARITY_COLOR[x.rarity ?? 'common'] : x.kind === 'error' ? 'var(--color-coral)' : x.kind === 'xp' ? 'var(--color-teal)' : 'var(--color-violet)';
        return (
          <div key={x.id} role="status" className="pointer-events-auto">
          <button
            onClick={() => dismiss(x.id)}
            className="glass w-full rounded-2xl px-4 py-3 flex items-center gap-3 text-left animate-pop"
            style={{ borderColor: `${color}55` }}
          >
            <span className="size-9 shrink-0 rounded-xl grid place-items-center" style={{ background: `${color}22`, color }}>
              {x.kind === 'achievement' ? (
                <NamedIcon name={x.icon ?? 'star'} />
              ) : x.kind === 'xp' ? (
                <Sparkles size={18} />
              ) : x.kind === 'error' ? (
                <AlertTriangle size={18} />
              ) : x.kind === 'success' || x.kind === 'quest' ? (
                <CheckCircle2 size={18} />
              ) : (
                <Info size={18} />
              )}
            </span>
            <span className="min-w-0">
              {x.body && <span className="block text-xs uppercase tracking-wider font-semibold" style={{ color }}>{x.body}</span>}
              <span className={clsx('block font-semibold', x.kind === 'xp' && 'font-display text-lg')} style={x.kind === 'xp' ? { color } : undefined}>
                {x.title}
              </span>
              {x.kind === 'achievement' && x.rarity && <span className="block text-xs muted capitalize">{x.rarity}</span>}
            </span>
          </button>
          </div>
        );
      })}
    </div>
  );
}

function LevelUp() {
  const { levelUp, clearLevelUp } = useGame();
  return (
    <Modal open={!!levelUp} onClose={clearLevelUp}>
      {levelUp && (
        <div className="text-center py-4">
          <div className="mx-auto size-28 rounded-full grid place-items-center animate-float" style={{ background: 'radial-gradient(circle, rgb(45 226 196 / .35), transparent 70%)' }}>
            <span className="font-display text-6xl font-bold text-gradient">{levelUp.level}</span>
          </div>
          <h2 className="text-3xl font-bold mt-4">{t('game.levelUp', { level: levelUp.level })}</h2>
          <p className="muted mt-2">{t('game.levelUpTitle', { title: levelUp.title })}</p>
          <p className="text-sm muted mt-4">New frames and rewards may have unlocked. Check Quests &amp; badges.</p>
          <button className="btn-primary btn-lg mt-6" onClick={clearLevelUp}>
            Keep exploring
          </button>
        </div>
      )}
    </Modal>
  );
}

function SignInDialog() {
  const { signInOpen, closeSignIn, onSignedIn, signInReason } = useSession();
  const { handleGame, toast } = useGame();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (signInOpen) {
      setStep('email');
      setCode('');
      setError(null);
      setDevCode(null);
    }
  }, [signInOpen]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ devCode?: string }>('/auth/request-code', { email });
      setDevCode(r.devCode ?? null);
      setStep('code');
      setTimeout(() => codeRef.current?.focus(), 50);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not send the code');
    } finally {
      setBusy(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const countryHint = Intl.DateTimeFormat().resolvedOptions().locale.split('-')[1];
      const ref = storedReferral();
      const r = await post<{ user: Me; isNew: boolean; game?: GameResult }>('/auth/verify-code', { email, code: value, ...(countryHint?.length === 2 ? { countryHint } : {}), ...(ref ? { ref } : {}) });
      if (ref) clearReferral();
      toast({ kind: 'success', title: r.isNew ? t('auth.welcome') : t('auth.welcomeBack') });
      handleGame(r.game);
      onSignedIn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={signInOpen} onClose={closeSignIn} title={t('auth.title')}>
      {signInReason && <p className="text-sm mb-4 rounded-xl px-3 py-2 bg-[rgb(45_226_196/.08)] text-[var(--color-teal)]">{signInReason}</p>}
      {step === 'email' ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          className="space-y-3"
        >
          <p className="muted text-sm">{t('auth.subtitle')}</p>
          <label className="label" htmlFor="si-email">
            {t('auth.email')}
          </label>
          <input id="si-email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
          <button className="btn-primary w-full btn-lg" disabled={busy || !email}>
            {busy ? <Spinner /> : <Mail size={18} />} {t('auth.sendCode')}
          </button>
          {GOOGLE_AUTH && (
            <a href="/api/v1/auth/google" className="btn-ghost w-full">
              {t('auth.google')}
            </a>
          )}
          <p className="text-xs muted text-center">By continuing you agree to our <Link className="underline" href="/legal/terms">Terms</Link> and <Link className="underline" href="/legal/privacy">Privacy policy</Link>.</p>
        </form>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void verify();
          }}
          className="space-y-3"
        >
          <p className="muted text-sm">{t('auth.code', { email })}</p>
          <input
            ref={codeRef}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className="input text-center font-display text-3xl tracking-[0.5em] h-16"
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6);
              setCode(v);
              if (v.length === 6) void verify(v);
            }}
            aria-label="6-digit code"
          />
          {devCode && (
            <button type="button" className="text-xs text-[var(--color-gold)] underline" onClick={() => { setCode(devCode); void verify(devCode); }}>
              {t('auth.devHint', { code: devCode })}
            </button>
          )}
          {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
          <button className="btn-primary w-full btn-lg" disabled={busy || code.length !== 6}>
            {busy ? <Spinner /> : null} {t('auth.verify')}
          </button>
          <button type="button" className="btn-ghost w-full" onClick={() => void send()} disabled={busy}>
            {t('auth.resend')}
          </button>
        </form>
      )}
    </Modal>
  );
}

export function GlobalOverlays() {
  return (
    <>
      <Toasts />
      <LevelUp />
      <SignInDialog />
      <UpgradeDialog />
    </>
  );
}

/**
 * G13: the upgrade at the moment of need. Any 402 from the API opens this with the plan that unlocks the feature;
 * checkout returns to the same page with the feature unlocked. While payments are off it says "coming soon".
 */
function UpgradeDialog() {
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const [hit, setHit] = useState<{ message: string; upsell: 'plus' | 'business' | 'credits' } | null>(null);
  const [period, setPeriod] = useState<'year' | 'month'>('year');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<{ message: string; upsell: 'plus' | 'business' | 'credits' }>).detail;
      setHit(d);
      void post('/billing/paywall-seen', { upsell: d.upsell }).catch(() => undefined);
    };
    window.addEventListener('fm:paywall', on);
    return () => window.removeEventListener('fm:paywall', on);
  }, []);
  // Back from checkout: say what changed, and refresh the session so the new plan applies at once.
  const { refresh } = useSession();
  useEffect(() => {
    const p = new URLSearchParams(location.search).get('upgraded');
    if (p === 'plus' || p === 'business' || p === 'brand') {
      void refresh();
      toast({ kind: 'success', title: `Welcome to ${p[0]!.toUpperCase()}${p.slice(1)}! Your new features are unlocked.` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!hit) return null;
  const close = () => setHit(null);
  const back = `${location.pathname}${location.search}`.replace(/[?&]upgraded=[a-z]+/, '');
  const goPlus = async () => {
    if (!me.user) return openSignIn('Sign in to upgrade.');
    setBusy(true);
    try {
      const r = await post<{ url: string }>('/billing/checkout', { plan: 'plus', interval: period, returnPath: back.slice(0, 200), source: 'paywall' });
      window.location.href = r.url;
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not start checkout' });
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={close} title={hit.upsell === 'business' ? 'A Business plan feature' : hit.upsell === 'credits' ? 'Out of AI designs' : 'Unlock this with Plus'}>
      <div className="space-y-4" aria-label="Upgrade">
        <p className="text-sm muted">{hit.message}</p>
        {!PAID_CHECKOUT ? (
          <p className="surface p-3 text-sm">Paid plans are coming soon. We’ll let you know as soon as you can upgrade.</p>
        ) : hit.upsell === 'plus' ? (
          <>
            <ul className="text-sm space-y-1">
              <li>✓ Custom HTML and JavaScript on your plots</li>
              <li>✓ 10 plots, 30 AI designs a month, premium frames</li>
              <li>✓ 10% off land</li>
            </ul>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Billing period">
              {(['year', 'month'] as const).map((i) => (
                <button key={i} type="button" role="radio" aria-checked={period === i} onClick={() => setPeriod(i)} className={clsx('surface p-3 text-left', period === i && 'ring-2 ring-[var(--color-teal)]')}>
                  <div className="font-semibold">{i === 'year' ? '$48 a year' : '$5 a month'}</div>
                  <div className="text-xs muted">{i === 'year' ? '$4/month · save 20%' : 'cancel any time'}</div>
                </button>
              ))}
            </div>
            <button className="btn-primary w-full" disabled={busy} onClick={() => void goPlus()}>{busy ? <Spinner /> : <Sparkles size={16} />} Upgrade to Plus</button>
          </>
        ) : (
          <Link href={hit.upsell === 'credits' ? '/dashboard/billing' : '/pricing'} className="btn-primary w-full" onClick={close}>
            {hit.upsell === 'credits' ? 'Get a Design Pack ($5) or Plus' : 'See the Business plan'}
          </Link>
        )}
        <button type="button" className="text-xs muted underline w-full" onClick={close}>Not now</button>
      </div>
    </Modal>
  );
}

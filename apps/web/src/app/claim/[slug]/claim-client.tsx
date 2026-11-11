'use client';

import { ComingSoon } from '@/components/coming-soon';
import { PAID_CHECKOUT } from '@/lib/config';
import { useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Mail, ShieldAlert, Building2, Trash2 } from 'lucide-react';
import { ApiError, post } from '@/lib/api';
import { usd } from '@/lib/format';
import type { Plot } from '@/lib/types';
import { useGame, useSession } from '@/components/providers';
import { Spinner } from '@/components/ui';

export function ClaimWizard({ plot, takedown, requestId: initialRequest, landmarkCents }: { plot: Plot; takedown: boolean; requestId: string | null; landmarkCents: number }) {
  const brand = plot.showcase?.brand ?? plot.title;
  const domain = plot.showcase ? new URL(plot.showcase.website).hostname.replace(/^www\./, '') : '';
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const [mode, setMode] = useState<'claim' | 'takedown'>(takedown ? 'takedown' : 'claim');
  const [step, setStep] = useState<'start' | 'code' | 'dns' | 'review'>(initialRequest ? 'review' : 'start');
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState(brand);
  const [note, setNote] = useState('');
  const [requestId, setRequestId] = useState<string | null>(initialRequest);
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [td, setTd] = useState({ name: '', email: '', organisation: brand, message: '' });
  const [tdDone, setTdDone] = useState(false);
  const [dns, setDns] = useState<{ host: string; alsoAccepted: string; value: string } | null>(null);

  // G12: no work email at the domain? Prove control of the domain with a DNS TXT record instead.
  const startDns = async () => {
    if (!me.user) return openSignIn(`Sign in first. Then verify ${domain} with a DNS record.`);
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ requestId: string; record: { host: string; alsoAccepted: string; value: string }; message: string }>(`/showcase/${plot.slug}/claim/dns`, { orgName });
      setRequestId(r.requestId);
      setDns(r.record);
      setMessage(r.message);
      setStep('dns');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the DNS check');
    } finally {
      setBusy(false);
    }
  };
  const checkDns = async () => {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ checkoutUrl?: string; message?: string }>(`/showcase/claim/${requestId}/verify-dns`);
      if (r.checkoutUrl) return void (window.location.href = r.checkoutUrl);
      setMessage(r.message ?? 'Verified. We’ll email you when you can complete the claim.');
      setStep('review');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not check the record');
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!me.user) return openSignIn(`Sign in first. Then verify that you work at ${brand}.`);
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ requestId: string; status: string; message: string; devCode?: string }>(`/showcase/${plot.slug}/claim`, { email, orgName, note: note || undefined });
      setRequestId(r.requestId);
      setMessage(r.message);
      setDevCode(r.devCode ?? null);
      setStep(r.status === 'pending_email' ? 'code' : 'review');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not start the claim');
    } finally {
      setBusy(false);
    }
  };
  const verify = async (value = code) => {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ checkoutUrl?: string; message?: string }>('/showcase/claim/verify', { requestId, code: value });
      if (r.checkoutUrl) return void (window.location.href = r.checkoutUrl);
      // Payments not open yet: the verified claim is saved and the team follows up.
      setMessage(r.message ?? 'Verified. We’ll email you when you can complete the claim.');
      setStep('review');
      setBusy(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Verification failed');
      setBusy(false);
    }
  };
  const checkoutApproved = async () => {
    if (!requestId) return;
    setBusy(true);
    try {
      const r = await post<{ checkoutUrl: string }>(`/showcase/claim/${requestId}/checkout`);
      window.location.href = r.checkoutUrl;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Not approved yet');
      setBusy(false);
    }
  };
  const sendTakedown = async () => {
    setBusy(true);
    try {
      await post(`/showcase/${plot.slug}/takedown`, td);
      setTdDone(true);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not send the request' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_380px] gap-8 items-start">
      <div className="surface p-6 md:p-8 space-y-6">
        <div className="flex gap-2">
          <button className={mode === 'claim' ? 'btn-gold' : 'btn-ghost'} onClick={() => setMode('claim')}><BadgeCheck size={16} /> Claim for {brand}</button>
          <button className={mode === 'takedown' ? 'btn-primary' : 'btn-ghost'} onClick={() => setMode('takedown')}><Trash2 size={16} /> Request removal</button>
        </div>

        {mode === 'claim' && step === 'start' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Make this landmark official</h2>
            <ol className="text-sm muted space-y-1 list-decimal pl-5">
              <li>Verify that you work at {brand} with an email at <b className="text-[var(--text)]">@{domain}</b>.</li>
              {PAID_CHECKOUT ? (
                <li>Pay the one-time Landmark price ({usd(landmarkCents)}, includes 3 months of the Brand plan).</li>
              ) : (
                <li>We save your verified claim and contact you. Landmark checkout opens soon.</li>
              )}
              <li>The plot moves to your verified organisation: edit it, invite your team, add more plots.</li>
            </ol>
            <div>
              <label className="label" htmlFor="c-email">Work email</label>
              <input id="c-email" type="email" className="input" placeholder={`you@${domain}`} value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="c-org">Organisation name</label>
              <input id="c-org" className="input" value={orgName} onChange={(e) => setOrgName(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="c-note">Anything we should know? (optional)</label>
              <textarea id="c-note" className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Your role, or why your email domain is different" />
            </div>
            {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
            <button className="btn-gold btn-lg" disabled={busy || !email || orgName.length < 2} onClick={() => void start()}>{busy ? <Spinner /> : <Mail size={18} />} Verify my email</button>
            <p className="text-xs muted">Different domain? We’ll review your claim by hand, usually within 2 working days.</p>
            <div className="border-t border-[var(--line)] pt-4">
              <p className="text-sm">No email at @{domain}? Whoever runs the domain’s DNS can verify instead.</p>
              <button className="btn-ghost mt-2" disabled={busy || orgName.length < 2} onClick={() => void startDns()}>Verify with a DNS record</button>
            </div>
          </div>
        )}

        {mode === 'claim' && step === 'dns' && dns && (
          <div className="space-y-4" role="region" aria-label="DNS verification">
            <h2 className="text-2xl font-bold">Add a DNS record</h2>
            <p className="muted text-sm">{message}</p>
            <dl className="surface p-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="muted">Type</dt><dd className="font-mono">TXT</dd>
              <dt className="muted">Name / host</dt><dd className="font-mono break-all select-all">{dns.host}</dd>
              <dt className="muted">Value</dt><dd className="font-mono break-all select-all">{dns.value}</dd>
            </dl>
            <p className="text-xs muted">A TXT record on {dns.alsoAccepted} itself works too. You can delete it once you’re verified.</p>
            {error && <p role="alert" className="text-sm text-[var(--color-coral)]">{error}</p>}
            <button className="btn-gold btn-lg" disabled={busy} onClick={() => void checkDns()}>{busy && <Spinner />} Check the record</button>
          </div>
        )}

        {mode === 'claim' && step === 'code' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">Check your inbox</h2>
            <p className="muted text-sm">{message}</p>
            <input className="input text-center font-display text-3xl tracking-[0.5em] h-16" inputMode="numeric" maxLength={6} value={code} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 6); setCode(v); if (v.length === 6) void verify(v); }} aria-label="Verification code" />
            {devCode && <button className="text-xs text-[var(--color-gold)] underline" onClick={() => { setCode(devCode); void verify(devCode); }}>Dev mode: your code is {devCode}</button>}
            {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
            <button className="btn-gold btn-lg" disabled={busy || code.length !== 6} onClick={() => void verify()}>{busy && <Spinner />} {PAID_CHECKOUT ? 'Verify and continue to payment' : 'Verify my claim'}</button>
          </div>
        )}

        {mode === 'claim' && step === 'review' && (
          <div className="space-y-4">
            <h2 className="text-2xl font-bold">We’re on it</h2>
            <p className="muted">{message ?? 'Your claim is being reviewed.'} {PAID_CHECKOUT ? ' We’ll email you as soon as it’s approved. Then come back here to complete the claim.' : ''}</p>
            {error && <p className="text-sm text-[var(--color-coral)]">{error}</p>}
            {PAID_CHECKOUT ? (
              <button className="btn-ghost" onClick={() => void checkoutApproved()} disabled={busy}>{busy && <Spinner />} I’ve been approved: continue</button>
            ) : (
              <ComingSoon compact text="Landmark checkout is coming soon. Your claim is saved; nothing else to do for now." />
            )}
          </div>
        )}

        {mode === 'takedown' && (
          tdDone ? (
            <div className="space-y-2">
              <h2 className="text-2xl font-bold">Request received</h2>
              <p className="muted">Thank you. We handle removal requests within 48 hours and will email you. If we haven’t by then, the plot is hidden automatically until we have.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-2xl font-bold">Request removal</h2>
              <p className="muted text-sm">If you represent {brand} (or have another reason this sample shouldn’t be here), tell us and we’ll take it down.</p>
              <div className="grid md:grid-cols-2 gap-3">
                <input className="input" placeholder="Your name" value={td.name} onChange={(e) => setTd({ ...td, name: e.target.value })} />
                <input className="input" type="email" placeholder="Email" value={td.email} onChange={(e) => setTd({ ...td, email: e.target.value })} />
              </div>
              <input className="input" placeholder="Organisation" value={td.organisation} onChange={(e) => setTd({ ...td, organisation: e.target.value })} />
              <textarea className="input" rows={4} placeholder="Message" value={td.message} onChange={(e) => setTd({ ...td, message: e.target.value })} />
              <button className="btn-primary" disabled={busy || td.name.length < 2 || !td.email || td.message.length < 5} onClick={() => void sendTakedown()}>{busy && <Spinner />} Send request</button>
            </div>
          )
        )}
      </div>

      <aside className="space-y-4">
        <Link href={`/p/${plot.slug}`} className="block surface overflow-hidden">
          {plot.coverImageUrl && <img src={plot.coverImageUrl} alt="" className="aspect-[3/2] object-cover w-full" />}
          <div className="p-4">
            <span className="chip chip-gold">Showcase · Unclaimed</span>
            <div className="font-semibold mt-2">{plot.title}</div>
            <div className="text-xs muted">{plot.width}×{plot.height} cells · {plot.countryName}</div>
          </div>
        </Link>
        <div className="surface p-4 text-sm space-y-2">
          <div className="flex items-center gap-2 font-semibold"><ShieldAlert size={16} className="text-[var(--color-gold)]" /> Why verification?</div>
          <p className="muted">Showcase plots use real organisation names, so only verified staff can claim them. This protects brands from impersonation.</p>
          <div className="flex items-center gap-2 font-semibold pt-2"><Building2 size={16} className="text-[var(--color-teal)]" /> What you get</div>
          <p className="muted">Verified badge, Landmark status, the Brand plan for 3 months, team seats and analytics.</p>
        </div>
      </aside>
    </div>
  );
}

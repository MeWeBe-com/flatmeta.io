'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Save, User } from 'lucide-react';
import { ApiError, api, patch, post, put } from '@/lib/api';
import type { AvatarLook, Country } from '@/lib/types';
import { ACCESSORIES, COLORS, FACES, FaceBadge } from '@/components/face-badge';
import { useGame, useSession } from '@/components/providers';
import { SectionTitle, Spinner } from '@/components/ui';

export default function SettingsPage() {
  const { me, refresh } = useSession();
  const { toast } = useGame();
  const u = me.user;
  const [form, setForm] = useState({ displayName: '', username: '', bio: '', homeCountry: '' });
  const [look, setLook] = useState<AvatarLook>({ face: '🙂', color: COLORS[1]! });
  const [countries, setCountries] = useState<Country[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!u) return;
    setForm({ displayName: u.displayName, username: u.username, bio: u.bio ?? '', homeCountry: u.homeCountry ?? '' });
    if (u.avatar) setLook(u.avatar);
  }, [u]);
  useEffect(() => {
    api<{ countries: Country[] }>('/countries').then((r) => setCountries(r.countries)).catch(() => undefined);
  }, []);

  const fail = (e: unknown) => toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
  const saveProfile = async () => {
    setSaving(true);
    try {
      await patch('/me', { displayName: form.displayName, username: form.username, bio: form.bio || null, homeCountry: form.homeCountry || null, avatar: { face: look.face, color: look.color, ...(look.accessory ? { accessory: look.accessory } : {}) } });
      await refresh();
      toast({ kind: 'success', title: 'Profile saved' });
    } catch (e) {
      fail(e);
    } finally {
      setSaving(false);
    }
  };

  if (!u) return <div className="skeleton h-64" />;
  return (
    <div className="space-y-8 max-w-3xl">
      <SectionTitle>Settings</SectionTitle>

      <section className="surface p-6 space-y-5">
        <h2 className="font-bold flex items-center gap-2"><User size={16} /> Profile and look</h2>
        <div className="flex items-center gap-4">
          <FaceBadge look={look} size={72} />
          <p className="text-sm muted">This is how you appear when you walk on the map and in chat. Guests get a random look.</p>
        </div>
        <div>
          <div className="label">Face</div>
          <div className="flex flex-wrap gap-1.5">{FACES.map((f) => <button key={f} type="button" aria-pressed={look.face === f} aria-label={`Face ${f}`} onClick={() => setLook({ ...look, face: f })} className={`size-10 rounded-xl text-xl grid place-items-center ${look.face === f ? 'bg-white/15 ring-2 ring-[var(--color-teal)]' : 'bg-white/5 hover:bg-white/10'}`}>{f}</button>)}</div>
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <div className="label">Colour</div>
            <div className="flex flex-wrap gap-2">{COLORS.map((c) => <button key={c} type="button" aria-label={`Colour ${c}`} aria-pressed={look.color === c} onClick={() => setLook({ ...look, color: c })} className={`size-8 rounded-full ${look.color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--bg)]' : ''}`} style={{ background: c }} />)}</div>
          </div>
          <div>
            <div className="label">Accessory</div>
            <div className="flex flex-wrap gap-1.5">{ACCESSORIES.map((a) => <button key={a || 'none'} type="button" aria-pressed={(look.accessory ?? '') === a} aria-label={a ? `Accessory ${a}` : 'No accessory'} onClick={() => setLook({ ...look, accessory: a || undefined })} className={`size-9 rounded-xl grid place-items-center ${(look.accessory ?? '') === a ? 'bg-white/15 ring-2 ring-[var(--color-teal)]' : 'bg-white/5 hover:bg-white/10'}`}>{a || '∅'}</button>)}</div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <label className="block"><span className="label">Display name</span><input className="input" maxLength={40} value={form.displayName} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
          <label className="block"><span className="label">Username <span className="muted font-normal">· your link: flatmeta.io/@{form.username || '…'}</span></span><input className="input" maxLength={20} value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value.replace(/[^a-zA-Z0-9_]/g, '') })} /></label>
        </div>
        <label className="block"><span className="label">Bio</span><textarea className="input" rows={3} maxLength={280} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
        <label className="block max-w-xs"><span className="label">Home country</span>
          <select className="input" value={form.homeCountry} onChange={(e) => setForm({ ...form, homeCountry: e.target.value })}>
            <option value="">Not set</option>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        </label>
        <button className="btn-primary" disabled={saving} onClick={() => void saveProfile()}>{saving ? <Spinner /> : <Save size={16} />} Save profile</button>
      </section>

      <PasswordCard hasPassword={u.hasPassword} email={u.email} onChanged={refresh} />
    </div>
  );
}

function PasswordCard({ hasPassword, email, onChanged }: { hasPassword: boolean; email: string; onChanged: () => Promise<void> }) {
  const { toast } = useGame();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    try {
      await fn();
      toast({ kind: 'success', title: ok });
      setCurrent('');
      setNext('');
      setCode('');
      setSent(false);
      await onChanged();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="surface p-6 space-y-4">
      <h2 className="font-bold flex items-center gap-2"><KeyRound size={16} /> Password <span className="chip">{hasPassword ? 'Set' : 'Optional'}</span></h2>
      <p className="text-sm muted">You can always sign in with an emailed code. A password is an extra way in, handy on shared devices. Use at least 10 characters.</p>
      {hasPassword ? (
        <div className="grid sm:grid-cols-2 gap-3 max-w-xl">
          <label><span className="label">Current password</span><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
          <label><span className="label">New password</span><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
          <div className="flex gap-2 sm:col-span-2">
            <button className="btn-primary" disabled={busy || !current || next.length < 10} onClick={() => void run(() => put('/me/password', { password: next, current }), 'Password changed')}>Change password</button>
            <button className="btn-ghost" disabled={busy || !current} onClick={() => void run(() => put('/me/password', { password: null, current }), 'Password removed')}>Remove password</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3 max-w-xl">
          {!sent ? (
            <button className="btn-ghost" disabled={busy} onClick={() => void run(async () => { await post('/auth/request-code', { email }); }, `We emailed a code to ${email}`).then(() => setSent(true))}>Email me a code to set a password</button>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              <label><span className="label">6-digit code</span><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
              <label><span className="label">New password</span><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
              <button className="btn-primary sm:col-span-2" disabled={busy || code.length !== 6 || next.length < 10} onClick={() => void run(() => put('/me/password', { password: next, code }), 'Password set')}>Set password</button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

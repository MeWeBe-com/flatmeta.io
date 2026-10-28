'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Building2, CreditCard, Mail, Plus, Trash2 } from 'lucide-react';
import { ApiError, api, del, post } from '@/lib/api';
import type { Org } from '@/lib/types';
import { useGame, useSession } from '@/components/providers';
import { Avatar, SectionTitle, Spinner } from '@/components/ui';

interface Member { id: string; username: string; displayName: string; avatarUrl: string | null; email: string; role: string }

function Orgs() {
  const { me, refresh } = useSession();
  const { toast } = useGame();
  const params = useSearchParams();
  const [creating, setCreating] = useState(params.get('create') === '1');
  const [form, setForm] = useState({ name: '', kind: 'business', website: '', description: '' });
  const [busy, setBusy] = useState(false);
  const orgs = me.orgs ?? [];

  useEffect(() => {
    const invite = params.get('invite');
    if (invite) {
      post<{ org: Org }>('/orgs/invites/accept', { token: invite })
        .then((r) => { toast({ kind: 'success', title: `You joined ${r.org.name}` }); void refresh(); })
        .catch((e) => toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Invite failed' }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const create = async () => {
    setBusy(true);
    try {
      await post('/orgs', { ...form, website: form.website || undefined, description: form.description || undefined });
      await refresh();
      setCreating(false);
      const plan = params.get('plan');
      toast({ kind: 'success', title: 'Organisation created' + (plan ? `. Now choose the ${plan} plan.` : '') });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not create' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-8">
      <SectionTitle sub="Businesses, brands and nonprofits. Organisation plots unlock business pages, team seats and verified badges." action={<button className="btn-primary" onClick={() => setCreating(true)}><Plus size={16} /> New organisation</button>}>Organisations</SectionTitle>
      {creating && (
        <div className="surface p-6 space-y-3 max-w-xl">
          <h2 className="font-bold text-lg">Create an organisation</h2>
          <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
            <option value="business">Local business</option>
            <option value="brand">Brand / company</option>
            <option value="nonprofit">Nonprofit</option>
            <option value="other">Other</option>
          </select>
          <input className="input" placeholder="Website (https://…)" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
          <textarea className="input" rows={3} placeholder="Short description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="flex gap-2"><button className="btn-primary" onClick={() => void create()} disabled={busy || form.name.length < 2}>{busy && <Spinner />} Create</button><button className="btn-ghost" onClick={() => setCreating(false)}>Cancel</button></div>
        </div>
      )}
      {orgs.length === 0 && !creating && <p className="muted">You’re not part of any organisation yet.</p>}
      <div className="space-y-6">{orgs.map((o) => <OrgCard key={o.id} org={o} />)}</div>
    </div>
  );
}

function OrgCard({ org }: { org: Org }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<{ id: string; email: string; role: string }[]>([]);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('editor');
  const [busy, setBusy] = useState<string | null>(null);
  const { toast } = useGame();
  const admin = org.role === 'owner' || org.role === 'admin';
  const load = () => api<{ members: Member[]; invites: { id: string; email: string; role: string }[] }>(`/orgs/${org.id}/members`).then((r) => { setMembers(r.members); setInvites(r.invites); }).catch(() => undefined);
  useEffect(() => { void load(); }, [org.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const invite = async () => {
    setBusy('invite');
    try {
      const r = await post<{ devLink?: string }>(`/orgs/${org.id}/invites`, { email, role });
      toast({ kind: 'success', title: `Invite sent to ${email}`, body: r.devLink ? 'Dev link logged' : undefined });
      if (r.devLink) console.info('Invite link:', r.devLink);
      setEmail('');
      void load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Invite failed' });
    } finally {
      setBusy(null);
    }
  };
  const billing = async (plan?: string) => {
    setBusy(plan ?? 'portal');
    try {
      const r = plan ? await post<{ url: string }>('/billing/checkout', { plan, interval: 'month', orgId: org.id }) : await post<{ url: string }>('/billing/portal', { orgId: org.id });
      window.location.href = r.url;
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Billing unavailable' });
      setBusy(null);
    }
  };
  return (
    <div className="surface p-6 space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <Avatar name={org.name} url={org.logoUrl} size={52} />
        <div className="flex-1 min-w-0">
          <Link href={`/o/${org.slug}`} className="text-xl font-bold hover:underline">{org.name}</Link>
          <div className="text-sm muted capitalize">{org.kind} · <span className="text-[var(--color-teal)]">{org.plan} plan</span> · you are {org.role}{org.verified && ' · ✓ verified'}</div>
        </div>
        {admin && (
          <div className="flex gap-2">
            {org.plan === 'free' && <button className="btn-primary btn-sm" onClick={() => void billing('business')} disabled={!!busy}><Building2 size={14} /> Business · $29/mo</button>}
            {org.plan !== 'brand' && <button className="btn-gold btn-sm" onClick={() => void billing('brand')} disabled={!!busy}>Brand · $249/mo</button>}
            {org.plan !== 'free' && <button className="btn-ghost btn-sm" onClick={() => void billing()} disabled={!!busy}><CreditCard size={14} /> Manage billing</button>}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-sm font-semibold muted mb-2">Team</h3>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.id} className="flex items-center gap-3 text-sm">
              <Avatar name={m.displayName} url={m.avatarUrl} size={30} />
              <span className="font-medium">{m.displayName}</span><span className="muted">{m.email}</span>
              <span className="chip ml-auto">{m.role}</span>
              {admin && m.role !== 'owner' && <button className="icon-btn size-8" onClick={async () => { await del(`/orgs/${org.id}/members/${m.id}`); void load(); }} aria-label="Remove member"><Trash2 size={14} /></button>}
            </li>
          ))}
          {invites.map((i) => <li key={i.id} className="text-sm muted flex gap-2"><Mail size={14} /> {i.email} · invited as {i.role}</li>)}
        </ul>
        {admin && (
          <div className="flex gap-2 mt-3 max-w-lg">
            <input className="input h-10" type="email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            <select className="input h-10 w-32" value={role} onChange={(e) => setRole(e.target.value)}><option value="editor">Editor</option><option value="admin">Admin</option></select>
            <button className="btn-ghost h-10" disabled={!email || busy === 'invite'} onClick={() => void invite()}>Invite</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function OrgsPage() {
  return <Suspense><Orgs /></Suspense>;
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Check, Crown, LogOut, Shield, UserMinus, UserPlus, X } from 'lucide-react';
import { ApiError, api, del, post, put } from '@/lib/api';
import { compact } from '@/lib/format';
import type { ClanDetail } from '@/lib/types';
import { ClanEmblem } from '@/components/clan-emblem';
import { FaceBadge } from '@/components/face-badge';
import { useGame, useSession } from '@/components/providers';
import { Spinner } from '@/components/ui';

export function ClanClient({ slug, initial }: { slug: string; initial: ClanDetail }) {
  const { me, openSignIn } = useSession();
  const router = useRouter();
  const { toast } = useGame();
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [invite, setInvite] = useState('');

  const reload = useCallback(async () => {
    try {
      setD(await api<ClanDetail>(`/clans/${slug}`));
    } catch {
      router.replace('/clans'); // disbanded
    }
  }, [slug, router]);
  useEffect(() => {
    void api<ClanDetail>(`/clans/${slug}`).then(setD).catch(() => undefined); // viewer-specific fields
  }, [slug, me.user?.id]);

  const run = async (fn: () => Promise<unknown>, ok?: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast({ kind: 'success', title: ok });
      after ? after() : await reload();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
    } finally {
      setBusy(false);
    }
  };

  const { clan, members, myRole, myPending, requests } = d;
  const staff = myRole === 'leader' || myRole === 'officer';
  return (
    <div className="space-y-8">
      <header className="surface p-6 flex flex-wrap items-center gap-5">
        <ClanEmblem emblem={clan.emblem} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">[{clan.tag}] {clan.name}</h1>
          <p className="muted mt-1">{clan.description ?? 'A clan of FlatMeta explorers.'}</p>
          <p className="text-sm muted mt-2">{clan.memberCount}/{clan.maxMembers} members · {compact(clan.xp)} XP · {compact(clan.cells)} cells owned</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {!myRole && !myPending && <button className="btn-primary" disabled={busy} onClick={() => (me.user ? void run(() => post(`/clans/${slug}/join`), 'Request sent') : openSignIn('Sign in to join a clan.'))}>{busy ? <Spinner /> : <UserPlus size={16} />} Ask to join</button>}
          {myPending && myPending.kind === 'join_request' && <span className="chip chip-gold">Request pending</span>}
          {myPending && myPending.kind === 'invite' && <button className="btn-primary" disabled={busy} onClick={() => void run(() => post(`/clan-requests/${myPending.id}/accept`), 'Welcome!')}>Accept invite</button>}
          {myRole && <Link href="/" className="btn-ghost">Open map and chat</Link>}
          {myRole && <button className="btn-ghost" disabled={busy} onClick={() => confirm('Leave this clan?') && void run(() => post('/clans/leave'), 'You left the clan')}><LogOut size={16} /> Leave</button>}
        </div>
      </header>

      {staff && requests.length > 0 && (
        <section className="surface p-5 space-y-2">
          <h2 className="font-bold">Join requests</h2>
          {requests.map((r) => (
            <div key={r.id} className="flex items-center gap-3 text-sm">
              <span className="font-medium">{r.displayName}</span><span className="muted">@{r.username} · level {r.level}</span>
              <span className="ml-auto flex gap-1">
                <button className="icon-btn" aria-label="Accept" onClick={() => void run(() => post(`/clan-requests/${r.id}/accept`), 'Member added')}><Check size={16} /></button>
                <button className="icon-btn" aria-label="Decline" onClick={() => void run(() => post(`/clan-requests/${r.id}/decline`))}><X size={16} /></button>
              </span>
            </div>
          ))}
        </section>
      )}

      {staff && (
        <form className="flex gap-2 max-w-md" onSubmit={(e) => { e.preventDefault(); const u = invite.trim().replace(/^@/, ''); if (u) void run(() => post(`/clans/${slug}/invite`, { username: u }), 'Invite sent', () => { setInvite(''); void reload(); }); }}>
          <input className="input" placeholder="Invite by @username" value={invite} onChange={(e) => setInvite(e.target.value)} aria-label="Username to invite" />
          <button className="btn-primary" disabled={busy}><UserPlus size={16} /> Invite</button>
        </form>
      )}

      <section>
        <h2 className="font-bold mb-3">Members</h2>
        <ul className="surface divide-y divide-[var(--line)]">
          {members.map((m) => (
            <li key={m.id} className="p-3 flex items-center gap-3">
              <FaceBadge look={m.avatar} size={34} />
              <Link href={`/u/${m.username}`} className="min-w-0 flex-1 hover:underline"><span className="font-medium">{m.displayName}</span> <span className="muted text-sm">@{m.username}</span></Link>
              <span className="text-xs muted">Lv {m.level} · {compact(m.xp)} XP</span>
              <span className={m.role === 'leader' ? 'chip chip-gold' : m.role === 'officer' ? 'chip chip-violet' : 'chip'}>{m.role === 'leader' ? <><Crown size={11} /> Leader</> : m.role === 'officer' ? <><Shield size={11} /> Officer</> : 'Member'}</span>
              {myRole === 'leader' && m.role !== 'leader' && (
                <button className="btn-ghost btn-sm" onClick={() => void run(() => put(`/clans/${slug}/members/${m.username}/role`, { role: m.role === 'officer' ? 'member' : 'officer' }))}>{m.role === 'officer' ? 'Demote' : 'Promote'}</button>
              )}
              {staff && m.role !== 'leader' && myRole !== m.role && (
                <button className="icon-btn" aria-label={`Remove ${m.displayName}`} onClick={() => confirm(`Remove ${m.displayName}?`) && void run(() => del(`/clans/${slug}/members/${m.username}`), 'Removed')}><UserMinus size={15} /></button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

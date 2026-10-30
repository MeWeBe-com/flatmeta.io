'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { Plus, Search, Trophy, Users } from 'lucide-react';
import { ApiError, api, post } from '@/lib/api';
import { compact } from '@/lib/format';
import type { Clan, ClanEmblem as Emblem, ClanRank } from '@/lib/types';
import { ClanEmblem, EMBLEM_COLORS, EMBLEM_ICONS } from '@/components/clan-emblem';
import { useGame, useSession } from '@/components/providers';
import { EmptyState, Modal, Spinner } from '@/components/ui';

interface Mine { clan: Clan | null; role: string | null; invites: { id: string; clanSlug: string; clanName: string; clanTag: string }[] }

export function ClansClient({ board, initial }: { board: ClanRank[]; initial: Clan[] }) {
  const { me, openSignIn } = useSession();
  const router = useRouter();
  const { toast } = useGame();
  const [list, setList] = useState(initial);
  const [q, setQ] = useState('');
  const [mine, setMine] = useState<Mine | null>(null);
  const [found, setFound] = useState(false);

  const loadMine = useCallback(() => {
    if (me.user) api<Mine>('/clans/mine').then(setMine).catch(() => undefined);
    else setMine(null);
  }, [me.user]);
  useEffect(loadMine, [loadMine]);
  useEffect(() => {
    const t = setTimeout(() => {
      api<{ clans: Clan[] }>(`/clans?limit=24${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => setList(r.clans)).catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  const answer = async (id: string, accept: boolean) => {
    try {
      await post(`/clan-requests/${id}/${accept ? 'accept' : 'decline'}`);
      toast({ kind: 'success', title: accept ? 'Welcome to the clan!' : 'Invite declined' });
      loadMine();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'That did not work' });
    }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_22rem] gap-8">
      <div className="space-y-6">
        {mine?.clan && (
          <Link href={`/clan/${mine.clan.slug}`} className="surface p-5 flex items-center gap-4 hover:border-[var(--line-strong)]">
            <ClanEmblem emblem={mine.clan.emblem} size={52} />
            <div className="min-w-0">
              <div className="text-xs muted">Your clan · {mine.role}</div>
              <div className="font-display font-bold text-xl truncate">[{mine.clan.tag}] {mine.clan.name}</div>
              <div className="text-sm muted">{mine.clan.memberCount} members · {compact(mine.clan.xp)} XP</div>
            </div>
          </Link>
        )}
        {mine?.invites.map((i) => (
          <div key={i.id} className="surface p-4 flex items-center gap-3 flex-wrap">
            <span>You are invited to <b>[{i.clanTag}] {i.clanName}</b></span>
            <span className="ml-auto flex gap-2"><button className="btn-primary btn-sm" onClick={() => void answer(i.id, true)}>Join</button><button className="btn-ghost btn-sm" onClick={() => void answer(i.id, false)}>Decline</button></span>
          </div>
        ))}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 muted" />
            <input className="input pl-9" placeholder="Search clans by name or tag" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search clans" />
          </div>
          {!mine?.clan && (
            <button className="btn-primary" onClick={() => (me.user ? setFound(true) : openSignIn('Sign in to found a clan.'))}><Plus size={16} /> Found a clan</button>
          )}
        </div>
        {list.length === 0 ? (
          <EmptyState icon="users" title="No clans match" body="Start your own: pick a name, a tag and an emblem." />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {list.map((c) => (
              <Link key={c.id} href={`/clan/${c.slug}`} className="surface p-4 flex items-center gap-3 hover:border-[var(--line-strong)]">
                <ClanEmblem emblem={c.emblem} />
                <div className="min-w-0">
                  <div className="font-semibold truncate">[{c.tag}] {c.name}</div>
                  <div className="text-xs muted flex gap-3"><span className="inline-flex items-center gap-1"><Users size={12} />{c.memberCount}/{c.maxMembers}</span><span>{compact(c.xp)} XP</span></div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
      <aside className="surface p-5 h-fit space-y-3">
        <h2 className="font-bold flex items-center gap-2"><Trophy size={16} className="text-[var(--color-gold)]" /> Clan leaderboard</h2>
        {board.length === 0 ? <p className="text-sm muted">No clans yet. Be the first.</p> : (
          <ol className="space-y-2">
            {board.slice(0, 10).map((c) => (
              <li key={c.id}><Link href={`/clan/${c.slug}`} className="flex items-center gap-3 text-sm hover:text-[var(--color-teal)]"><span className="w-5 text-right muted">{c.rank}</span><ClanEmblem emblem={c.emblem} size={28} /><span className="truncate flex-1">[{c.tag}] {c.name}</span><span className="muted">{compact(c.xp)}</span></Link></li>
            ))}
          </ol>
        )}
      </aside>
      <FoundModal open={found} onClose={() => setFound(false)} onDone={(slug) => { setFound(false); router.push(`/clan/${slug}`); }} />
    </div>
  );
}

function FoundModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (slug: string) => void }) {
  const { toast } = useGame();
  const [name, setName] = useState('');
  const [tag, setTag] = useState('');
  const [description, setDescription] = useState('');
  const [emblem, setEmblem] = useState<Emblem>({ icon: 'shield', color: EMBLEM_COLORS[0]! });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const r = await post<{ clan: Clan }>('/clans', { name, tag, description: description || null, emblem });
      toast({ kind: 'success', title: `${r.clan.name} is founded!` });
      onDone(r.clan.slug);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not found the clan' });
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Found a clan">
      <div className="space-y-4">
        <div className="flex items-center gap-3"><ClanEmblem emblem={emblem} size={56} /><div className="text-sm muted">You need level 2. You will be the leader and can invite up to 49 players.</div></div>
        <label className="block"><span className="label">Name</span><input className="input" maxLength={30} value={name} onChange={(e) => setName(e.target.value)} placeholder="Midnight Cartographers" /></label>
        <label className="block"><span className="label">Tag (2 to 4 letters)</span><input className="input uppercase" maxLength={4} value={tag} onChange={(e) => setTag(e.target.value.replace(/[^a-zA-Z0-9]/g, ''))} placeholder="MIDN" /></label>
        <label className="block"><span className="label">About (optional)</span><textarea className="input" rows={2} maxLength={280} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        <div><span className="label">Emblem</span>
          <div className="flex flex-wrap gap-2 mt-1">{Object.keys(EMBLEM_ICONS).map((icon) => <button key={icon} type="button" aria-pressed={emblem.icon === icon} className={emblem.icon === icon ? 'ring-2 ring-white rounded-2xl' : ''} onClick={() => setEmblem({ ...emblem, icon })}><ClanEmblem emblem={{ icon, color: emblem.color }} size={36} /></button>)}</div>
          <div className="flex gap-2 mt-2">{EMBLEM_COLORS.map((color) => <button key={color} type="button" aria-label={`Colour ${color}`} aria-pressed={emblem.color === color} onClick={() => setEmblem({ ...emblem, color })} className={`size-7 rounded-full ${emblem.color === color ? 'ring-2 ring-white' : ''}`} style={{ background: color }} />)}</div>
        </div>
        <button className="btn-primary w-full" disabled={busy || name.trim().length < 3 || tag.length < 2} onClick={() => void submit()}>{busy && <Spinner />} Found clan</button>
      </div>
    </Modal>
  );
}

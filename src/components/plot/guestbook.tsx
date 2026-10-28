'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { ApiError, api, del, post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { t } from '@/lib/i18n';
import type { GameResult, GuestbookEntry } from '@/lib/types';
import { useGame, useSession } from '../providers';
import { Avatar, Spinner } from '../ui';

export function Guestbook({ plotId, canModerate }: { plotId: string; canModerate: boolean }) {
  const [entries, setEntries] = useState<GuestbookEntry[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const { me, openSignIn } = useSession();
  const { handleGame, toast } = useGame();

  const load = async (cursor = 0) => {
    const r = await api<{ entries: GuestbookEntry[]; nextCursor: number | null }>(`/plots/${plotId}/guestbook?cursor=${cursor}`);
    setEntries((e) => (cursor ? [...(e ?? []), ...r.entries] : r.entries));
    setNext(r.nextCursor);
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotId]);

  const submit = async () => {
    if (!me.user) return openSignIn('Sign in to sign the guestbook.');
    setBusy(true);
    try {
      const r = await post<{ entry: GuestbookEntry; game: GameResult }>(`/plots/${plotId}/guestbook`, { body });
      setEntries((e) => [r.entry, ...(e ?? [])]);
      setBody('');
      handleGame(r.game);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not post your note' });
    } finally {
      setBusy(false);
    }
  };
  const remove = async (id: string) => {
    await del(`/guestbook/${id}`).catch(() => undefined);
    setEntries((e) => e?.filter((x) => x.id !== id) ?? null);
  };

  return (
    <section className="surface p-5" aria-labelledby="gb">
      <h2 id="gb" className="text-lg font-bold mb-3">{t('plot.guestbook')}</h2>
      <div className="flex gap-2 mb-4">
        <input className="input" maxLength={280} value={body} onChange={(e) => setBody(e.target.value)} placeholder={me.user ? 'Leave a friendly note…' : 'Sign in to leave a note'} onFocus={() => !me.user && openSignIn('Sign in to sign the guestbook.')} onKeyDown={(e) => e.key === 'Enter' && body.trim() && void submit()} />
        <button className="btn-primary" disabled={busy || !body.trim()} onClick={() => void submit()}>{busy ? <Spinner /> : 'Sign'}</button>
      </div>
      {entries === null ? (
        <div className="skeleton h-16" />
      ) : entries.length === 0 ? (
        <p className="text-sm muted">No notes yet. Be the first to say hello.</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3">
              <Link href={`/u/${e.author.username}`}><Avatar name={e.author.displayName} url={e.author.avatarUrl} size={34} level={e.author.level} /></Link>
              <div className="min-w-0 flex-1">
                <div className="text-xs muted">
                  <Link href={`/u/${e.author.username}`} className="font-semibold text-[var(--text)]">{e.author.displayName}</Link> · {timeAgo(e.createdAt)}
                </div>
                <p className="text-sm mt-0.5 break-words">{e.body}</p>
              </div>
              {(canModerate || me.user?.id === e.author.id) && (
                <button className="icon-btn size-8 muted" onClick={() => void remove(e.id)} aria-label="Delete note"><Trash2 size={14} /></button>
              )}
            </li>
          ))}
        </ul>
      )}
      {next !== null && <button className="btn-ghost btn-sm mt-4" onClick={() => void load(next)}>Load more</button>}
    </section>
  );
}

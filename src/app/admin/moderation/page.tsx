'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { useGame } from '@/components/providers';
import { EmptyState, clsx } from '@/components/ui';

interface Flag { id: string; targetType: string; targetId: string; source: string; reason: string; score: number | null; status: string; createdAt: string; preview: Record<string, string | null | boolean> | null }

export default function ModerationPage() {
  const [status, setStatus] = useState<'open' | 'actioned' | 'dismissed'>('open');
  const [flags, setFlags] = useState<Flag[] | null>(null);
  const { toast } = useGame();
  const load = () => api<{ flags: Flag[] }>(`/admin/moderation?status=${status}`).then((r) => setFlags(r.flags));
  useEffect(() => { setFlags(null); void load(); }, [status]); // eslint-disable-line react-hooks/exhaustive-deps
  const act = async (f: Flag, action: string) => {
    await post(`/admin/moderation/${f.id}/resolve`, { action });
    toast({ kind: 'success', title: `Flag ${action === 'dismiss' || action === 'approve' ? 'dismissed' : 'actioned'}` });
    void load();
  };
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-3xl font-bold">Moderation</h1>
        <div className="flex gap-1 surface rounded-full p-1 ml-auto">
          {(['open', 'actioned', 'dismissed'] as const).map((s) => <button key={s} onClick={() => setStatus(s)} className={clsx('px-3 h-8 rounded-full text-sm capitalize', status === s ? 'bg-white/10 font-semibold' : 'muted')}>{s}</button>)}
        </div>
      </div>
      {!flags ? <div className="skeleton h-60" /> : flags.length === 0 ? <EmptyState icon="star" title="Queue is clear" body="AI moderation and user reports land here." /> : (
        <ul className="space-y-3">
          {flags.map((f) => (
            <li key={f.id} className="surface p-4 flex flex-col md:flex-row gap-4">
              {typeof f.preview?.thumbUrl === 'string' && <img src={f.preview.thumbUrl} alt="" className="size-24 rounded-xl object-cover" />}
              {typeof f.preview?.url === 'string' && <img src={f.preview.url} alt="" className="size-24 rounded-xl object-cover" />}
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex flex-wrap gap-2 items-center text-xs">
                  <span className="chip">{f.targetType}</span>
                  <span className={clsx('chip', f.source === 'report' ? 'chip-violet' : 'chip-coral')}>{f.source}</span>
                  {f.score !== null && <span className="muted">score {(f.score ?? 0).toFixed(2)}</span>}
                  <span className="muted">{timeAgo(f.createdAt)}</span>
                </div>
                <div className="text-sm font-semibold">{f.reason}</div>
                {f.preview && (
                  <div className="text-sm muted break-words">
                    {f.preview.title && <div><b className="text-[var(--text)]">{String(f.preview.title)}</b> {f.preview.slug && <Link className="underline" href={`/p/${f.preview.slug}`} target="_blank">open</Link>}</div>}
                    {f.preview.tagline && <div>{String(f.preview.tagline)}</div>}
                    {f.preview.description && <div className="line-clamp-3">{String(f.preview.description)}</div>}
                    {f.preview.body && <div>“{String(f.preview.body)}”</div>}
                    {f.preview.username && <div>@{String(f.preview.username)} · {String(f.preview.displayName)} · {String(f.preview.bio ?? '')}</div>}
                  </div>
                )}
              </div>
              {status === 'open' && (
                <div className="flex md:flex-col gap-2 shrink-0">
                  <button className="btn-ghost btn-sm" onClick={() => void act(f, 'approve')}>Looks fine</button>
                  <button className="btn-ghost btn-sm" onClick={() => void act(f, 'hide')}>Hide</button>
                  <button className="btn-danger btn-sm" onClick={() => void act(f, 'ban')}>Hide + ban</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

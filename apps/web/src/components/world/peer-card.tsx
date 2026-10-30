'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, UserPlus, X, Check } from 'lucide-react';
import { api, post, ApiError } from '@/lib/api';
import type { Peer } from '@/lib/types';
import { FaceBadge } from '../face-badge';
import { useGame, useSession } from '../providers';

type Rel = { status: 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked_by_me' | 'blocked_me' };

/** Small card shown when you tap another explorer on the map. */
export function PeerCard({ peer, onClose, onChat }: { peer: Peer; onClose: () => void; onChat: (username: string) => void }) {
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const [rel, setRel] = useState<Rel['status'] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!me.user || !peer.username) return;
    api<Rel>(`/users/${peer.username}/relation`).then((r) => setRel(r.status)).catch(() => undefined);
  }, [me.user, peer.username]);

  const connect = async () => {
    if (!me.user) return openSignIn('Sign in to connect with other explorers.');
    if (!peer.username) return;
    setBusy(true);
    try {
      const r = await post<{ status: string }>('/connections', { username: peer.username });
      setRel(r.status === 'accepted' ? 'accepted' : 'pending_out');
      toast({ kind: 'success', title: r.status === 'accepted' ? `You and ${peer.name} are connected` : 'Request sent' });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not send the request' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute z-30 left-1/2 -translate-x-1/2 bottom-28 md:bottom-24 glass rounded-2xl p-4 w-72 animate-pop" role="dialog" aria-label={`${peer.name}`}>
      <button className="icon-btn absolute right-1 top-1" onClick={onClose} aria-label="Close"><X size={16} /></button>
      <div className="flex items-center gap-3">
        <FaceBadge look={peer.avatar} size={44} />
        <div className="min-w-0">
          <div className="font-semibold truncate">{peer.name}</div>
          <div className="text-xs muted">{peer.userId ? `Level ${peer.level}` : 'Guest explorer'}</div>
        </div>
      </div>
      <div className="flex gap-2 mt-3">
        {peer.username ? (
          <>
            {rel === 'accepted' ? (
              <button className="btn-primary btn-sm flex-1" onClick={() => onChat(peer.username!)}><MessageCircle size={14} /> Message</button>
            ) : rel === 'pending_out' ? (
              <button className="btn-ghost btn-sm flex-1" disabled><Check size={14} /> Request sent</button>
            ) : (
              <button className="btn-primary btn-sm flex-1" disabled={busy || rel === 'blocked_by_me' || rel === 'blocked_me'} onClick={connect}><UserPlus size={14} /> {rel === 'pending_in' ? 'Accept' : 'Connect'}</button>
            )}
            <a className="btn-ghost btn-sm" href={`/u/${peer.username}`}>Profile</a>
          </>
        ) : (
          <p className="text-xs muted">Guests are anonymous. Sign-in unlocks profiles, connections and private chat.</p>
        )}
      </div>
    </div>
  );
}

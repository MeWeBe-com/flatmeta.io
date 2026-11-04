'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, UserPlus, X, Check, Heart } from 'lucide-react';
import { api, post, ApiError } from '@/lib/api';
import type { GameResult, Peer } from '@/lib/types';
import { FaceBadge } from '../face-badge';
import { useGame, useSession } from '../providers';

type Rel = { status: 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked_by_me' | 'blocked_me' };

/** Small card shown when you tap another explorer on the map. */
export function PeerCard({ peer, onClose, onChat }: { peer: Peer; onClose: () => void; onChat: (username: string) => void }) {
  const { me, openSignIn } = useSession();
  const { toast, handleGame } = useGame();
  const [rel, setRel] = useState<Rel['status'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [following, setFollowing] = useState(false);
  const signInFirst = (what: string) => openSignIn(`Sign in to ${what}. Guests explore anonymously; an account gives you a @username others can find.`);

  useEffect(() => {
    if (!me.user || !peer.username) return;
    api<Rel>(`/users/${peer.username}/relation`).then((r) => setRel(r.status)).catch(() => undefined);
  }, [me.user, peer.username]);

  const connect = async () => {
    if (!me.user) return signInFirst('connect with other explorers');
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

  const follow = async () => {
    if (!me.user) return signInFirst('follow explorers');
    if (!peer.username) return;
    try {
      const r = await post<{ game: GameResult | null }>(`/users/${peer.username}/follow`);
      setFollowing(true);
      toast({ kind: 'success', title: `You follow ${peer.name}` });
      handleGame(r.game);
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not follow' });
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
            <button className="btn-ghost btn-sm" onClick={follow} disabled={following} aria-label={following ? 'Following' : `Follow ${peer.name}`}><Heart size={14} /> {following ? 'Following' : 'Follow'}</button>
            <a className="btn-ghost btn-sm" href={`/u/${peer.username}`}>Profile</a>
          </>
        ) : (
          <p className="text-xs muted">{peer.name} is exploring as a guest, so they can’t be followed or messaged until they sign in. Say hi in nearby chat instead.</p>
        )}
      </div>
    </div>
  );
}

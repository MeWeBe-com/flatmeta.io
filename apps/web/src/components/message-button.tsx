'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Check, MessageCircle, UserPlus } from 'lucide-react';
import { api, post, ApiError } from '@/lib/api';
import { useGame, useSession } from './providers';

type Status = 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked_by_me' | 'blocked_me';

/** On a profile: "Message" opens the private chat on the map once connected; otherwise "Connect". */
export function MessageButton({ username }: { username: string }) {
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const [status, setStatus] = useState<Status | null>(null);
  useEffect(() => {
    if (!me.user || me.user.username === username) return;
    api<{ status: Status }>(`/users/${username}/relation`).then((r) => setStatus(r.status)).catch(() => undefined);
  }, [me.user, username]);

  if (me.user?.username === username) return null;
  if (!me.user) {
    return (
      <button className="btn-ghost" onClick={() => openSignIn('Sign in to connect with explorers and message them privately.')}>
        <MessageCircle size={16} /> Message
      </button>
    );
  }
  if (status === 'accepted') {
    return (
      <Link className="btn-ghost" href={`/?dm=${encodeURIComponent(username)}`}>
        <MessageCircle size={16} /> Message
      </Link>
    );
  }
  if (status === 'pending_out') {
    return (
      <button className="btn-ghost" disabled>
        <Check size={16} /> Request sent
      </button>
    );
  }
  if (status === 'blocked_by_me' || status === 'blocked_me' || status === null) return null;
  const connect = async () => {
    try {
      const r = await post<{ status: string }>('/connections', { username });
      setStatus(r.status === 'accepted' ? 'accepted' : 'pending_out');
      toast({ kind: 'success', title: r.status === 'accepted' ? 'Connected: you can message each other now' : 'Request sent' });
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not send the request' });
    }
  };
  return (
    <button className="btn-ghost" onClick={() => void connect()}>
      <UserPlus size={16} /> {status === 'pending_in' ? 'Accept request' : 'Connect to message'}
    </button>
  );
}

'use client';
import { useState } from 'react';
import { UserCheck, UserPlus } from 'lucide-react';
import { del, post } from '@/lib/api';
import type { GameResult } from '@/lib/types';
import { useGame, useSession } from './providers';

export function FollowButton({ username, initial }: { username: string; initial: boolean }) {
  const [following, setFollowing] = useState(initial);
  const { me, openSignIn } = useSession();
  const { handleGame } = useGame();
  if (me.user?.username === username) return null;
  const toggle = async () => {
    if (!me.user) return openSignIn('Sign in to follow explorers.');
    if (following) {
      await del(`/users/${username}/follow`);
      setFollowing(false);
    } else {
      const r = await post<{ game: GameResult | null }>(`/users/${username}/follow`);
      setFollowing(true);
      handleGame(r.game);
    }
  };
  return (
    <button className={following ? 'btn-ghost' : 'btn-primary'} onClick={() => void toggle()}>
      {following ? <UserCheck size={16} /> : <UserPlus size={16} />} {following ? 'Following' : 'Follow'}
    </button>
  );
}

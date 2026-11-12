'use client';

import { useState } from 'react';
import { post } from '@/lib/api';
import { useGame, useSession } from '../providers';

/** H1: admins can hide (or show again) one company plot's logo. Others see nothing. */
export function LogoAdminToggle({ plotId, hasLogo }: { plotId: string; hasLogo: boolean }) {
  const { me } = useSession();
  const { toast } = useGame();
  const [hidden, setHidden] = useState(!hasLogo);
  if (me.user?.role !== 'admin') return null;
  const toggle = async () => {
    await post(`/admin/plots/${plotId}/logo`, { hidden: !hidden });
    setHidden(!hidden);
    toast({ kind: 'success', title: hidden ? 'Logo shown again (reload to see it)' : 'Logo hidden' });
  };
  return (
    <button type="button" className="text-xs underline muted" onClick={() => void toggle()}>
      {hidden ? 'Admin: show logo' : 'Admin: hide logo'}
    </button>
  );
}

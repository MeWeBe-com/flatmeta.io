'use client';

import { useEffect, useState } from 'react';
import { Gift } from 'lucide-react';
import { api } from '@/lib/api';
import { SharePanel } from './share-panel';

interface Referral { code: string; link: string; bonusPerFriend: number; invited: number; claimed: number; bonusCells: number; bonusCellsUsed: number }

/** G11: my invite link; both of us get bonus squares when a friend claims their first land. */
export function InviteCard() {
  const [r, setR] = useState<Referral | null>(null);
  useEffect(() => {
    api<Referral>('/me/referral').then(setR).catch(() => undefined);
  }, []);
  if (!r) return null;
  return (
    <section className="surface p-5 space-y-3" aria-label="Invite friends">
      <h2 className="font-semibold inline-flex items-center gap-2"><Gift size={16} className="text-[var(--color-gold)]" /> Invite friends, get land</h2>
      <p className="text-sm muted">When a friend joins with your link and claims their first land, you both get {r.bonusPerFriend} free squares.</p>
      <SharePanel url={r.link} text="Claim free land next to me on FlatMeta" />
      <p className="text-xs muted" aria-label="Invite stats">
        {r.invited} joined · {r.claimed} claimed land · {r.bonusCells - r.bonusCellsUsed} bonus squares to use
      </p>
    </section>
  );
}

/** A one-line invite link for places that already show a share panel. */
export function InviteLink() {
  const [r, setR] = useState<Referral | null>(null);
  useEffect(() => {
    api<Referral>('/me/referral').then(setR).catch(() => undefined);
  }, []);
  if (!r) return null;
  return (
    <p className="text-xs muted">
      Your invite link (+{r.bonusPerFriend} squares each): <span className="font-mono select-all">{r.link}</span>
    </p>
  );
}

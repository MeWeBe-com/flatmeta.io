'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, Compass, Sparkles } from 'lucide-react';
import { api, post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Plot, Progress } from '@/lib/types';
import { useSession } from '@/components/providers';
import { EmptyState, LevelRing, NamedIcon, PlotCard, SectionTitle, Stat } from '@/components/ui';

interface Notification { id: string; kind: string; payload: Record<string, string | number | string[]>; readAt: string | null; createdAt: string }

function describe(n: Notification): string {
  const p = n.payload;
  switch (n.kind) {
    case 'like': return `${p.from} liked ${p.plotTitle}`;
    case 'wave': return `${p.from} waved at ${p.plotTitle} 👋`;
    case 'guestbook': return `${p.from} signed ${p.plotTitle}: “${p.body}”`;
    case 'follow': return `${p.from} started following you`;
    case 'achievement': return `Achievement unlocked: ${p.name}`;
    case 'level_up': return `Level ${p.level}! You are now a ${p.title}`;
    case 'quest_completed': return `Quest complete: ${p.title}. Claim your reward!`;
    case 'broken_links': return `Some links on ${p.plotTitle} look broken`;
    case 'dormant_soon': return `${p.plotTitle} has been quiet for a while. Give it a refresh?`;
    case 'landmark': return `${p.title} is now your verified Landmark`;
    case 'refund': return String(p.reason);
    case 'payment_failed': return `Payment failed for your ${p.plan} plan. Update your card in Billing.`;
    default: return n.kind;
  }
}

export default function DashboardHome() {
  const { me } = useSession();
  const [plots, setPlots] = useState<Plot[] | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [notes, setNotes] = useState<Notification[]>([]);
  useEffect(() => {
    api<{ plots: Plot[] }>('/me/plots').then((r) => setPlots(r.plots)).catch(() => setPlots([]));
    api<Progress>('/me/progress').then(setProgress).catch(() => undefined);
    api<{ notifications: Notification[] }>('/me/notifications').then((r) => setNotes(r.notifications)).catch(() => undefined);
  }, []);
  const u = me.user!;
  const markRead = async () => {
    await post('/me/notifications/read', {});
    setNotes((n) => n.map((x) => ({ ...x, readAt: x.readAt ?? new Date().toISOString() })));
  };
  const unlocked = progress?.achievements.filter((a) => a.unlocked).length ?? 0;
  return (
    <div className="space-y-10">
      <header className="surface p-6 flex flex-col md:flex-row md:items-center gap-6">
        {progress && <LevelRing level={progress.level} progress={progress.progress} size={84} />}
        <div className="flex-1">
          <h1 className="text-2xl font-bold">Welcome back, {u.displayName}</h1>
          {progress && <p className="muted text-sm mt-1">Level {progress.level} {progress.title} · {progress.nextLevelXp - progress.xp} XP to level {progress.level + 1} · {progress.streak}-day streak</p>}
        </div>
        <div className="flex gap-2">
          <Link href="/?claim" className="btn-primary"><Compass size={16} /> Claim land</Link>
        </div>
      </header>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Plots" value={plots?.length ?? '–'} icon="flag" />
        <Stat label="XP" value={progress?.xp.toLocaleString() ?? '–'} icon="sparkles" />
        <Stat label="Badges" value={`${unlocked}/${progress?.achievements.length ?? 0}`} icon="trophy" />
        <Stat label="AI designs left" value={progress?.credits.unlimited ? '∞' : progress?.credits.remaining ?? '–'} icon="palette" />
      </div>
      <section>
        <SectionTitle action={<Link href="/dashboard/plots" className="text-sm muted hover:text-[var(--text)]">All plots →</Link>}>Your plots</SectionTitle>
        {plots === null ? (
          <div className="skeleton h-40" />
        ) : plots.length === 0 ? (
          <EmptyState icon="flag" title="You don’t own any land yet" body="Your first plot is free. Pick a spot you love: your street, your café, your favourite beach." action={<Link className="btn-gold" href="/?claim">Claim your free Homestead</Link>} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">{plots.slice(0, 6).map((p) => <PlotCard key={p.id} plot={p} />)}</div>
        )}
      </section>
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="surface p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold flex items-center gap-2"><Bell size={16} /> Notifications</h2>
            {notes.some((n) => !n.readAt) && <button className="text-xs muted underline" onClick={() => void markRead()}>Mark all read</button>}
          </div>
          {notes.length === 0 ? <p className="text-sm muted">Nothing yet. Likes, waves and badges will show up here.</p> : (
            <ul className="space-y-2">
              {notes.slice(0, 10).map((n) => (
                <li key={n.id} className="text-sm flex gap-2">
                  {!n.readAt && <span className="size-2 rounded-full bg-[var(--color-teal)] mt-1.5 shrink-0" />}
                  <span className={n.readAt ? 'muted' : ''}>{describe(n)} <span className="text-xs muted">· {timeAgo(n.createdAt)}</span></span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="surface p-5">
          <h2 className="font-bold mb-3 flex items-center gap-2"><Sparkles size={16} /> Today’s quests</h2>
          <ul className="space-y-2">
            {progress?.quests.filter((q) => q.period !== 'weekly').slice(0, 6).map((q) => (
              <li key={q.key} className="flex items-center gap-3 text-sm">
                <NamedIcon name={q.icon} size={16} className={q.completed ? 'text-[var(--color-teal)]' : 'muted'} />
                <span className={q.completed ? 'line-through muted' : ''}>{q.title}</span>
                <span className="ml-auto text-xs muted">{q.progress}/{q.target}</span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/progress" className="text-xs muted underline mt-3 inline-block">All quests &amp; badges</Link>
        </section>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
import { RARITY_COLOR, timeAgo } from '@/lib/format';
import type { GameResult, Progress, Quest } from '@/lib/types';
import { useGame } from '@/components/providers';
import { LevelRing, NamedIcon, SectionTitle, Spinner, clsx } from '@/components/ui';

export default function ProgressPage() {
  const [p, setP] = useState<Progress | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { handleGame, progressVersion } = useGame();
  useEffect(() => {
    api<Progress>('/me/progress').then(setP).catch(() => undefined);
  }, [progressVersion]);
  if (!p) return <div className="skeleton h-96" />;
  const claim = async (q: Quest) => {
    if (!q.id) return;
    setBusy(q.key);
    try {
      handleGame((await post<{ game: GameResult }>(`/me/quests/${q.id}/claim`)).game);
    } finally {
      setBusy(null);
    }
  };
  const groups: [string, Quest[]][] = [
    ['Your first day', p.quests.filter((q) => q.period === 'onboarding')],
    ['Today', p.quests.filter((q) => q.period === 'daily')],
    ['This week', p.quests.filter((q) => q.period === 'weekly')],
  ];
  const unlocked = p.achievements.filter((a) => a.unlocked).length;
  return (
    <div className="space-y-10">
      <header className="surface p-6 flex flex-col md:flex-row gap-6 md:items-center">
        <LevelRing level={p.level} progress={p.progress} size={96} />
        <div className="flex-1">
          <h1 className="text-3xl font-bold">{p.title}</h1>
          <p className="muted">Level {p.level} · {p.xp.toLocaleString()} XP · {p.nextLevelXp - p.xp} XP to next level · {p.streak > 0 ? `${p.streak}-day streak` : 'Start a streak today'}</p>
          <div className="h-2 rounded-full bg-white/10 mt-3 overflow-hidden max-w-md"><div className="h-full bg-gradient-to-r from-[var(--color-teal)] to-[var(--color-violet)]" style={{ width: `${p.progress * 100}%` }} /></div>
        </div>
      </header>
      <section className="grid lg:grid-cols-3 gap-4">
        {groups.map(([title, qs]) => (
          <div key={title} className="surface p-5">
            <h2 className="font-bold mb-3">{title}</h2>
            {qs.length === 0 ? <p className="text-sm muted">All done. Nice work!</p> : (
              <ul className="space-y-3">
                {qs.map((q) => (
                  <li key={q.key} className="flex items-center gap-3">
                    <span className={clsx('size-9 rounded-xl grid place-items-center shrink-0', q.completed ? 'bg-[rgb(45_226_196/.15)] text-[var(--color-teal)]' : 'bg-white/5 muted')}><NamedIcon name={q.icon} size={16} /></span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{q.title}</div>
                      <div className="text-xs muted">{q.description} · +{q.xp} XP{q.credits ? ` · +${q.credits} AI designs` : ''}</div>
                    </div>
                    {q.claimed ? <span className="text-xs text-[var(--color-teal)]">✓</span> : q.completed ? (
                      <button className="btn-gold btn-sm" onClick={() => void claim(q)} disabled={busy === q.key}>{busy === q.key ? <Spinner /> : 'Claim'}</button>
                    ) : <span className="text-xs muted tabular-nums">{q.progress}/{q.target}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>
      <section>
        <SectionTitle sub={`${unlocked} of ${p.achievements.length} unlocked`}>Badges</SectionTitle>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {p.achievements.map((a) => (
            <div key={a.key} className={clsx('surface p-4 text-center', !a.unlocked && 'opacity-45 grayscale')} title={a.description}>
              <span className="mx-auto size-12 rounded-2xl grid place-items-center" style={{ background: `${RARITY_COLOR[a.rarity]}22`, color: RARITY_COLOR[a.rarity] }}><NamedIcon name={a.icon} size={22} /></span>
              <div className="font-semibold text-sm mt-2">{a.name}</div>
              <div className="text-[11px] muted">{a.description}</div>
              <div className="text-[11px] capitalize mt-1" style={{ color: RARITY_COLOR[a.rarity] }}>{a.rarity}{a.xp ? ` · ${a.xp} XP` : ''}</div>
            </div>
          ))}
        </div>
      </section>
      <section className="surface p-5">
        <h2 className="font-bold mb-3">Recent XP</h2>
        <ul className="grid md:grid-cols-2 gap-x-8 gap-y-1 text-sm">
          {p.recentXp.map((x, i) => (
            <li key={i} className="flex justify-between"><span className="muted capitalize">{x.kind.replace(/_/g, ' ')}</span><span><b className="text-[var(--color-teal)]">+{x.amount}</b> <span className="text-xs muted">{timeAgo(x.createdAt)}</span></span></li>
          ))}
        </ul>
      </section>
    </div>
  );
}

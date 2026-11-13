'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, ChevronDown, Flame, Trophy } from 'lucide-react';
import { api, post } from '@/lib/api';
import { t } from '@/lib/i18n';
import type { GameResult, Progress, Quest } from '@/lib/types';
import { useGame, useSession } from '../providers';
import { NamedIcon, Spinner, clsx } from '../ui';

export function QuestTracker() {
  const { me, openSignIn } = useSession();
  const { handleGame, progressVersion } = useGame();
  const [progress, setProgress] = useState<Progress | null>(null);
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!me.user) return setProgress(null);
    try {
      setProgress(await api<Progress>('/me/progress'));
    } catch {
      /* ignore */
    }
  }, [me.user]);
  useEffect(() => {
    void load();
  }, [load, progressVersion]);

  if (!me.user) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 font-display font-bold"><Trophy size={16} className="text-[var(--color-gold)]" /> {t('hud.questsTitle')}</div>
        <p className="text-sm muted mt-1">Sign in to track quests, earn XP and claim your free Homestead.</p>
        <button className="btn-primary w-full mt-3" onClick={() => openSignIn()}>{t('nav.signIn')}</button>
      </div>
    );
  }
  if (!progress) return <div className="glass rounded-2xl p-4"><div className="skeleton h-24" /></div>;

  const onboarding = progress.quests.filter((q) => q.period === 'onboarding').sort((a, b) => a.order - b.order);
  const daily = progress.quests.filter((q) => q.period === 'daily');
  const weekly = progress.quests.filter((q) => q.period === 'weekly');
  const shown: Quest[] = [...onboarding.slice(0, 3), ...daily, ...(onboarding.length ? [] : weekly)].slice(0, 6);

  const claim = async (q: Quest) => {
    if (!q.id) return;
    setBusy(q.key);
    try {
      const r = await post<{ game: GameResult }>(`/me/quests/${q.id}/claim`);
      handleGame(r.game);
    } finally {
      setBusy(null);
      void load();
    }
  };
  const checkin = async () => {
    setBusy('checkin');
    try {
      const r = await post<{ game: GameResult | null }>('/me/checkin');
      handleGame(r.game);
    } finally {
      setBusy(null);
      void load();
    }
  };

  return (
    <div className="glass rounded-2xl overflow-hidden" data-tour="quests">
      <button className="w-full flex items-center gap-2 px-4 h-12" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Trophy size={16} className="text-[var(--color-gold)]" />
        <span className="font-display font-bold">{t('hud.questsTitle')}</span>
        <span className="chip ml-1">{shown.filter((q) => q.completed && !q.claimed).length || shown.filter((q) => !q.completed).length}</span>
        <ChevronDown size={16} className={clsx('ml-auto transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-1.5">
          <button
            onClick={() => void checkin()}
            disabled={progress.checkedInToday || busy === 'checkin'}
            className={clsx('w-full flex items-center gap-2 rounded-xl px-3 h-10 text-sm', progress.checkedInToday ? 'bg-white/5 muted' : 'bg-[rgb(255_201_77/.12)] text-[var(--color-gold)] font-semibold')}
          >
            {busy === 'checkin' ? <Spinner /> : progress.checkedInToday ? <Flame size={16} /> : <CalendarCheck size={16} />}
            {progress.checkedInToday ? t('hud.checkedIn', { streak: progress.streak }) : t('hud.checkIn')}
          </button>
          {shown.map((q) => (
            <div key={`${q.key}-${q.periodKey}`} className="rounded-xl px-3 py-2 bg-white/[.03]">
              <div className="flex items-center gap-2">
                <span className={clsx('size-7 rounded-lg grid place-items-center shrink-0', q.completed ? 'bg-[rgb(45_226_196/.15)] text-[var(--color-teal)]' : 'bg-white/5 muted')}>
                  <NamedIcon name={q.icon} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{q.title}</div>
                  <div className="text-xs muted truncate">{q.period === 'onboarding' ? 'First day' : q.period === 'daily' ? 'Today' : 'This week'} · +{q.xp} XP{q.credits ? ` · +${q.credits} AI` : ''}</div>
                </div>
                {q.completed && !q.claimed ? (
                  <button className="btn-gold btn-sm" onClick={() => void claim(q)} disabled={busy === q.key}>
                    {busy === q.key ? <Spinner /> : t('hud.claimReward')}
                  </button>
                ) : (
                  <span className="text-xs muted tabular-nums">{q.progress}/{q.target}</span>
                )}
              </div>
              {!q.completed && (
                <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-[var(--color-teal)] rounded-full transition-all" style={{ width: `${(q.progress / q.target) * 100}%` }} />
                </div>
              )}
            </div>
          ))}
          {!shown.length && <p className="text-sm muted px-1">{t('hud.allDone')}</p>}
          <Link href="/dashboard/progress" className="block text-center text-xs muted hover:text-[var(--text)] pt-1">All quests &amp; badges →</Link>
        </div>
      )}
    </div>
  );
}

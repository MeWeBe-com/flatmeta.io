'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Crown, Medal } from 'lucide-react';
import { api } from '@/lib/api';
import { compact, flag } from '@/lib/format';
import type { Country } from '@/lib/types';
import { useSession } from '@/components/providers';
import { Avatar, EmptyState, Spinner, clsx } from '@/components/ui';

interface Row { rank: number; score: number; user?: { username: string; displayName: string; avatarUrl: string | null; level: number; homeCountry: string | null }; plot?: { slug: string; title: string; thumbUrl: string | null; countryCode: string | null } }
const BOARDS = [
  { key: 'xp-week', label: 'This week', unit: 'XP' },
  { key: 'xp', label: 'All time', unit: 'XP' },
  { key: 'xp-country', label: 'My country', unit: 'XP', country: true },
  { key: 'cells-country', label: 'Landholders', unit: 'cells', country: true },
  { key: 'plots-loved', label: 'Most loved plots', unit: 'likes' },
];

export function LeaderboardClient({ countries }: { countries: Country[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const { me } = useSession();
  const board = params.get('board') ?? 'xp-week';
  const def = BOARDS.find((b) => b.key === board) ?? BOARDS[0]!;
  const country = params.get('country') ?? me.user?.homeCountry ?? 'GB';
  const [data, setData] = useState<{ rows: Row[]; me: { rank: number; score: number } | null } | null>(null);

  useEffect(() => {
    setData(null);
    api<{ rows: Row[]; me: { rank: number; score: number } | null }>(`/leaderboards/${board}?limit=100${def.country ? `&country=${country}` : ''}`).then(setData).catch(() => setData({ rows: [], me: null }));
  }, [board, country, def.country]);

  const set = (k: string, v: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set(k, v);
    router.replace(`/leaderboards?${sp.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex gap-1 overflow-x-auto p-1 surface rounded-full">
          {BOARDS.map((b) => (
            <button key={b.key} onClick={() => set('board', b.key)} className={clsx('px-4 h-9 rounded-full text-sm whitespace-nowrap', board === b.key ? 'bg-[var(--color-teal)] text-[#04141a] font-semibold' : 'muted hover:text-[var(--text)]')}>{b.label}</button>
          ))}
        </div>
        {def.country && (
          <select className="input md:w-56 md:ml-auto" value={country} onChange={(e) => set('country', e.target.value)} aria-label="Country">
            {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
          </select>
        )}
      </div>
      {data?.me && (
        <div className="surface p-4 flex items-center gap-3 border-[var(--color-violet)]">
          <span className="chip chip-violet">You</span>
          <span className="font-display font-bold text-xl">#{data.me.rank}</span>
          <span className="muted text-sm ml-auto">{compact(data.me.score)} {def.unit}</span>
        </div>
      )}
      {!data ? (
        <div className="text-center py-10"><Spinner /></div>
      ) : !data.rows.length ? (
        <EmptyState icon="trophy" title="No one here yet" body="Earn XP by exploring, liking, waving and claiming land. The top spot is wide open." />
      ) : (
        <>
          <div className="grid md:grid-cols-3 gap-4">
            {data.rows.slice(0, 3).map((r, i) => (
              <Podium key={r.rank} row={r} place={i} unit={def.unit} />
            ))}
          </div>
          <ol className="surface divide-y divide-[var(--line)]">
            {data.rows.slice(3).map((r) => (
              <li key={r.rank} className="flex items-center gap-3 px-4 py-3">
                <span className="w-8 text-center font-display font-bold muted">{r.rank}</span>
                <RowBody row={r} />
                <span className="ml-auto text-sm tabular-nums">{compact(r.score)} <span className="muted">{def.unit}</span></span>
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  );
}

function RowBody({ row }: { row: Row }) {
  if (row.plot)
    return (
      <Link href={`/p/${row.plot.slug}`} className="flex items-center gap-3 min-w-0">
        {row.plot.thumbUrl && <img src={row.plot.thumbUrl} alt="" className="size-9 rounded-lg object-cover" />}
        <span className="font-semibold truncate">{row.plot.title}</span>
        <span>{flag(row.plot.countryCode)}</span>
      </Link>
    );
  if (!row.user) return null;
  return (
    <Link href={`/u/${row.user.username}`} className="flex items-center gap-3 min-w-0">
      <Avatar name={row.user.displayName} url={row.user.avatarUrl} size={34} level={row.user.level} />
      <span className="font-semibold truncate">{row.user.displayName}</span>
      {row.user.homeCountry && <span>{flag(row.user.homeCountry)}</span>}
    </Link>
  );
}

function Podium({ row, place, unit }: { row: Row; place: number; unit: string }) {
  const colors = ['#FFC94D', '#C9D1EA', '#E0A36B'];
  return (
    <div className="surface p-5 text-center relative overflow-hidden" style={{ borderColor: `${colors[place]}66` }}>
      <div className="absolute inset-x-0 top-0 h-24 opacity-30" style={{ background: `radial-gradient(circle at 50% 0%, ${colors[place]}, transparent 70%)` }} />
      <div className="relative">
        {place === 0 ? <Crown className="mx-auto" color={colors[0]} /> : <Medal className="mx-auto" color={colors[place]} />}
        <div className="mt-3 flex justify-center"><RowBody row={row} /></div>
        <div className="font-display text-3xl font-bold mt-3">{compact(row.score)}</div>
        <div className="text-xs muted">{unit}</div>
      </div>
    </div>
  );
}

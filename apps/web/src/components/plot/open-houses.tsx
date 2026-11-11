'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff, CalendarClock, Trash2, Users } from 'lucide-react';
import { ApiError, api, del, post } from '@/lib/api';
import { useGame, useSession } from '../providers';
import { Spinner, clsx } from '../ui';

interface OpenHouse { id: string; title: string; startsAt: string; endsAt: string; live: boolean; going: number; notifyMe: boolean }

const when = (o: OpenHouse) => {
  const s = new Date(o.startsAt);
  const e = new Date(o.endsAt);
  return `${s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${s.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}–${e.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
};

/** G10: "N people here now" and the plot's open houses with "Notify me". Owners can cancel. */
export function OpenHouses({ plotId, canEdit = false, compact = false }: { plotId: string; canEdit?: boolean; compact?: boolean }) {
  const { me, openSignIn } = useSession();
  const { toast } = useGame();
  const [data, setData] = useState<{ hereNow: number; openHouses: OpenHouse[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const load = () => api<{ hereNow: number; openHouses: OpenHouse[] }>(`/plots/${plotId}/open-houses`).then(setData).catch(() => undefined);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 30_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotId, me.user?.id]);
  if (!data) return null;

  const toggle = async (o: OpenHouse) => {
    if (!me.user) return openSignIn();
    setBusy(o.id);
    try {
      if (o.notifyMe) await del(`/open-houses/${o.id}/rsvp`);
      else await post(`/open-houses/${o.id}/rsvp`);
      toast({ kind: 'success', title: o.notifyMe ? 'You won’t be notified' : 'We’ll notify you when it starts' });
      await load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Something went wrong' });
    } finally {
      setBusy(null);
    }
  };
  const cancel = async (o: OpenHouse) => {
    if (!confirm(`Cancel “${o.title}”?`)) return;
    await del(`/open-houses/${o.id}`).catch(() => undefined);
    await load();
  };

  if (compact && !data.hereNow && !data.openHouses.length) return null;
  return (
    <section aria-label="Open houses" className={clsx('space-y-2', !compact && 'surface p-4')}>
      <div className="flex items-center justify-between gap-2">
        {!compact && <h2 className="font-semibold inline-flex items-center gap-2"><CalendarClock size={16} /> Open houses</h2>}
        <span className="chip text-xs inline-flex items-center gap-1" aria-label="People here now">
          <Users size={12} /> {data.hereNow} {data.hereNow === 1 ? 'person' : 'people'} here now
        </span>
      </div>
      {data.openHouses.length === 0 && !compact && <p className="text-sm muted">No open houses planned.{canEdit ? ' Schedule one from the editor so visitors can drop by while you’re there.' : ''}</p>}
      <ul className="space-y-2">
        {data.openHouses.map((o) => (
          <li key={o.id} className="flex items-center gap-3 text-sm">
            <div className="min-w-0 flex-1">
              <div className="font-medium truncate">{o.live && <span className="chip chip-coral mr-2 text-[10px]">Live now</span>}{o.title}</div>
              <div className="muted text-xs">{when(o)}{o.going ? ` · ${o.going} want${o.going === 1 ? 's' : ''} a reminder` : ''}</div>
            </div>
            {canEdit ? (
              <button type="button" className="btn-ghost btn-sm" aria-label={`Cancel ${o.title}`} onClick={() => void cancel(o)}><Trash2 size={14} /></button>
            ) : (
              !o.live && (
                <button type="button" className={clsx('btn-sm', o.notifyMe ? 'btn-ghost' : 'btn-primary')} disabled={busy === o.id} onClick={() => void toggle(o)}>
                  {busy === o.id ? <Spinner /> : o.notifyMe ? <BellOff size={14} /> : <Bell size={14} />} {o.notifyMe ? 'Notifying' : 'Notify me'}
                </button>
              )
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Owner form: schedule an open house (G10). */
export function ScheduleOpenHouse({ plotId, published }: { plotId: string; published: boolean }) {
  const { toast } = useGame();
  const [title, setTitle] = useState('Open house');
  const [start, setStart] = useState(() => {
    const d = new Date(Date.now() + 24 * 3600_000);
    d.setMinutes(0, 0, 0);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  if (!published) return <p className="text-sm muted">Publish your plot to schedule open houses.</p>;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await post(`/plots/${plotId}/open-houses`, { title, startsAt: new Date(start).toISOString(), minutes });
      toast({ kind: 'success', title: 'Open house scheduled. Visitors can ask for a reminder.' });
      setKey((k) => k + 1);
    } catch (err) {
      toast({ kind: 'error', title: err instanceof ApiError ? err.message : 'Could not schedule it' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => void submit(e)} className="space-y-2" aria-label="Schedule an open house">
        <input className="input" aria-label="Open house title" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input className="input" type="datetime-local" aria-label="Starts" value={start} onChange={(e) => setStart(e.target.value)} />
          <select className="input" aria-label="Length" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))}>
            {[15, 30, 60, 90, 120, 180, 240].map((m) => <option key={m} value={m}>{m < 60 ? `${m} min` : `${m / 60} h`}</option>)}
          </select>
        </div>
        <button className="btn-primary btn-sm" disabled={busy || title.trim().length < 3}>{busy ? <Spinner /> : <CalendarClock size={14} />} Schedule</button>
      </form>
      <OpenHouses key={key} plotId={plotId} canEdit compact />
    </div>
  );
}

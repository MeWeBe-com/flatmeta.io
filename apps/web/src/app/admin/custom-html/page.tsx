'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, post } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { sandboxSrc } from '@/lib/sandbox';
import { useGame } from '@/components/providers';
import { clsx } from '@/components/ui';

interface Item { id: string; version: number; bytes: number; notes: string[]; createdAt: string; plotId: string; plotSlug: string; plotTitle: string; disabled: boolean }
interface State { globallyDisabled: boolean; queue: Item[]; disabledPlots: { id: string; slug: string; title: string }[] }

/** G8: first-publish review of owner custom HTML, and the kill-switches. */
export default function CustomHtmlAdmin() {
  const { toast } = useGame();
  const [state, setState] = useState<State | null>(null);
  const [preview, setPreview] = useState<{ id: string; url: string; html: string } | null>(null);
  const load = () => void api<State>('/admin/custom-html').then(setState);
  useEffect(load, []);

  const open = async (it: Item) => {
    const r = await post<{ url: string; html: string }>(`/admin/custom-html/versions/${it.id}/preview`);
    setPreview({ id: it.id, url: sandboxSrc(r.url), html: r.html });
  };
  const review = async (it: Item, decision: 'approve' | 'reject') => {
    const note = decision === 'reject' ? prompt('Reason (shown to the owner in the version history)') ?? undefined : undefined;
    await post(`/admin/custom-html/versions/${it.id}/review`, { decision, note });
    toast({ kind: 'success', title: decision === 'approve' ? 'Approved: live now' : 'Rejected' });
    setPreview(null);
    load();
  };
  const togglePlot = async (plotId: string, disabled: boolean) => {
    await post(`/admin/plots/${plotId}/custom-html`, { disabled });
    toast({ kind: 'success', title: disabled ? 'Custom HTML switched off for this plot' : 'Custom HTML switched back on' });
    load();
  };
  const toggleGlobal = async () => {
    if (!state) return;
    const next = !state.globallyDisabled;
    if (next && !confirm('Switch off custom HTML on every plot? Visitors see the plots without it until you switch it back on.')) return;
    await post('/admin/custom-html/global', { disabled: next });
    toast({ kind: 'success', title: next ? 'All custom HTML is off' : 'Custom HTML is back on' });
    load();
  };

  if (!state) return <div className="skeleton h-64" />;
  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Custom HTML</h1>
          <p className="text-sm muted mt-1">First publishes wait here for a person. Owner code runs only on the usercontent origin, in a sandbox.</p>
        </div>
        <button className={clsx(state.globallyDisabled ? 'btn-primary' : 'btn-danger')} onClick={() => void toggleGlobal()}>
          {state.globallyDisabled ? 'Switch custom HTML back on' : 'Kill-switch: turn off all custom HTML'}
        </button>
      </header>
      {state.globallyDisabled && <p role="status" className="surface p-4 text-[var(--color-coral)]">Custom HTML is switched off for everyone.</p>}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Waiting for review ({state.queue.length})</h2>
        <ul className="surface divide-y divide-[var(--line)]">
          {state.queue.length === 0 && <li className="p-4 text-sm muted">Nothing to review.</li>}
          {state.queue.map((it) => (
            <li key={it.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center gap-3">
                <Link className="font-semibold underline" href={`/p/${it.plotSlug}`} target="_blank">{it.plotTitle}</Link>
                <span className="text-xs muted">v{it.version} · {(it.bytes / 1000).toFixed(1)} KB · {timeAgo(it.createdAt)}</span>
                <span className="text-xs text-[var(--color-gold)]">{it.notes.join('; ')}</span>
                <div className="ml-auto flex gap-2">
                  <button className="btn-ghost text-sm" onClick={() => void open(it)}>Preview</button>
                  <button className="btn-primary text-sm" onClick={() => void review(it, 'approve')}>Approve</button>
                  <button className="btn-danger text-sm" onClick={() => void review(it, 'reject')}>Reject</button>
                  <button className="btn-ghost text-sm" onClick={() => void togglePlot(it.plotId, true)}>Switch off plot</button>
                </div>
              </div>
              {preview?.id === it.id && (
                <div className="grid lg:grid-cols-2 gap-3">
                  <iframe title={`Preview of ${it.plotTitle}`} src={preview.url} sandbox="allow-scripts" referrerPolicy="no-referrer" className="w-full h-80 rounded-xl border border-[var(--line)] bg-[#0b1020]" />
                  <pre className="h-80 overflow-auto text-xs font-mono p-3 rounded-xl border border-[var(--line)] whitespace-pre-wrap break-all">{preview.html}</pre>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold">Switched off ({state.disabledPlots.length})</h2>
        <p className="text-sm muted">Plots a moderator switched off, or that three people reported.</p>
        <ul className="surface divide-y divide-[var(--line)]">
          {state.disabledPlots.length === 0 && <li className="p-4 text-sm muted">None.</li>}
          {state.disabledPlots.map((p) => (
            <li key={p.id} className="p-4 flex items-center gap-3">
              <Link className="underline" href={`/p/${p.slug}`} target="_blank">{p.title}</Link>
              <button className="btn-ghost text-sm ml-auto" onClick={() => void togglePlot(p.id, false)}>Switch back on</button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

interface Entry { id: number; action: string; targetType: string | null; targetId: string | null; meta: Record<string, unknown>; actor: string | null; createdAt: string }

export default function AuditPage() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => { void api<{ entries: Entry[] }>('/admin/audit?limit=200').then((r) => setEntries(r.entries)).catch(() => setEntries([])); }, []);
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Audit log</h1>
      <ul className="surface divide-y divide-[var(--line)] text-sm">
        {entries?.length === 0 && <li className="p-4 muted">Nothing logged yet.</li>}
        {entries?.map((e) => (
          <li key={e.id} className="p-3 flex flex-wrap gap-3">
            <span className="font-mono text-xs text-[var(--color-teal)]">{e.action}</span>
            <span className="muted">{e.targetType}{e.targetId ? ` ${e.targetId.slice(0, 8)}` : ''}</span>
            <span className="muted text-xs truncate max-w-md">{Object.keys(e.meta).length ? JSON.stringify(e.meta) : ''}</span>
            <span className="ml-auto text-xs muted">@{e.actor ?? 'system'} · {timeAgo(e.createdAt)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

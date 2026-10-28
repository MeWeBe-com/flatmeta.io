'use client';

import { useEffect, useState } from 'react';
import { Copy, KeyRound, Trash2, Bot, BookOpen } from 'lucide-react';
import { ApiError, api, del, post } from '@/lib/api';
import { API_DOCS_URL, MCP_URL } from '@/lib/config';
import { timeAgo } from '@/lib/format';
import { useGame } from '@/components/providers';
import { SectionTitle, Spinner } from '@/components/ui';

interface Key { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt: string | null; createdAt: string }

export default function DevelopersPage() {
  const [keys, setKeys] = useState<Key[] | null>(null);
  const [name, setName] = useState('My agent');
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useGame();
  const load = () => api<{ keys: Key[] }>('/me/api-keys').then((r) => setKeys(r.keys)).catch(() => setKeys([]));
  useEffect(() => { void load(); }, []);
  const create = async () => {
    setBusy(true);
    try {
      const r = await post<{ secret: string }>('/me/api-keys', { name });
      setSecret(r.secret);
      void load();
    } catch (e) {
      toast({ kind: 'error', title: e instanceof ApiError ? e.message : 'Could not create key' });
    } finally {
      setBusy(false);
    }
  };
  const copy = (text: string) => { void navigator.clipboard.writeText(text); toast({ kind: 'success', title: 'Copied' }); };
  const mcpConfig = JSON.stringify({ mcpServers: { flatmeta: { type: 'http', url: MCP_URL, headers: { Authorization: `Bearer ${secret ?? 'fm_live_…'}` } } } }, null, 2);
  const curl = `curl -H "Authorization: Bearer ${secret ?? 'fm_live_…'}" ${API_DOCS_URL.replace(/\/docs$/, '')}/v1/me/plots`;
  return (
    <div className="space-y-8">
      <SectionTitle sub="Connect AI agents and your own apps to FlatMeta.">Developers</SectionTitle>
      <div className="grid md:grid-cols-2 gap-4">
        <a href={API_DOCS_URL} target="_blank" rel="noopener" className="surface p-5 hover:border-[var(--color-teal)] transition">
          <BookOpen className="text-[var(--color-teal)]" />
          <h3 className="font-bold mt-3">REST API</h3>
          <p className="text-sm muted mt-1">OpenAPI 3.1 docs with every endpoint: plots, regions, search, game and more.</p>
        </a>
        <div className="surface p-5">
          <Bot className="text-[var(--color-violet)]" />
          <h3 className="font-bold mt-3">MCP server</h3>
          <p className="text-sm muted mt-1">Let Claude and other agents search, view and manage land. Endpoint: <code className="text-[var(--color-teal)] break-all">{MCP_URL}</code></p>
        </div>
      </div>
      <section className="surface p-6 space-y-4">
        <h2 className="font-bold flex items-center gap-2"><KeyRound size={16} /> API keys</h2>
        <div className="flex gap-2 max-w-lg">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Key name" />
          <button className="btn-primary" onClick={() => void create()} disabled={busy || !name}>{busy && <Spinner />} Create key</button>
        </div>
        {secret && (
          <div className="rounded-xl p-4 bg-[rgb(255_201_77/.08)] border border-[rgb(255_201_77/.3)] space-y-2">
            <div className="text-sm font-semibold text-[var(--color-gold)]">Copy your key now. You won’t see it again.</div>
            <div className="flex gap-2"><code className="input flex items-center font-mono text-xs overflow-x-auto">{secret}</code><button className="btn-ghost" onClick={() => copy(secret)}><Copy size={14} /></button></div>
          </div>
        )}
        {keys === null ? <div className="skeleton h-12" /> : keys.length === 0 ? <p className="text-sm muted">No keys yet.</p> : (
          <ul className="divide-y divide-[var(--line)]">
            {keys.map((k) => (
              <li key={k.id} className="py-3 flex items-center gap-3 text-sm">
                <span className="font-semibold">{k.name}</span>
                <code className="muted">{k.prefix}…</code>
                <span className="muted text-xs">{k.lastUsedAt ? `used ${timeAgo(k.lastUsedAt)}` : 'never used'}</span>
                <button className="icon-btn size-8 ml-auto" aria-label="Revoke key" onClick={async () => { await del(`/me/api-keys/${k.id}`); void load(); }}><Trash2 size={14} /></button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="grid lg:grid-cols-2 gap-4">
        <div className="surface p-5 space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-bold">Claude Desktop / Claude Code (MCP)</h3><button className="icon-btn size-8" onClick={() => copy(mcpConfig)} aria-label="Copy"><Copy size={14} /></button></div>
          <pre className="text-xs bg-black/30 rounded-xl p-3 overflow-x-auto">{mcpConfig}</pre>
          <p className="text-xs muted">Read-only tools (search, plots, countries, leaderboards) also work without a key.</p>
        </div>
        <div className="surface p-5 space-y-2">
          <div className="flex items-center justify-between"><h3 className="font-bold">REST</h3><button className="icon-btn size-8" onClick={() => copy(curl)} aria-label="Copy"><Copy size={14} /></button></div>
          <pre className="text-xs bg-black/30 rounded-xl p-3 overflow-x-auto whitespace-pre-wrap break-all">{curl}</pre>
        </div>
      </section>
    </div>
  );
}

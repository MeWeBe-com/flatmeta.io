'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api, patch } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import type { Me } from '@/lib/types';
import { useGame, useSession } from '@/components/providers';

type U = Me & { bannedAt: string | null; aiCreditsBonus: number };

export default function AdminUsers() {
  const [users, setUsers] = useState<U[] | null>(null);
  const [q, setQ] = useState('');
  const { toast } = useGame();
  const { me } = useSession();
  const isAdmin = me.user?.role === 'admin';
  const load = () => void api<{ users: U[] }>(`/admin/users?limit=100${q ? `&q=${encodeURIComponent(q)}` : ''}`).then((r) => setUsers(r.users));
  useEffect(load, []); // eslint-disable-line react-hooks/exhaustive-deps
  const update = async (u: U, body: Record<string, unknown>) => {
    await patch(`/admin/users/${u.id}`, body);
    toast({ kind: 'success', title: 'Updated' });
    load();
  };
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Users</h1>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); load(); }}>
        <input className="input w-72" placeholder="Email, username or name" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-ghost">Search</button>
      </form>
      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-xs muted"><tr><th className="p-3">User</th><th>Email</th><th>Level</th><th>Plan</th><th>Role</th><th>Joined</th><th className="text-right p-3">Actions</th></tr></thead>
          <tbody>
            {users?.map((u) => (
              <tr key={u.id} className="border-t border-[var(--line)]">
                <td className="p-3"><Link href={`/u/${u.username}`} className="font-semibold hover:underline">{u.displayName}</Link><div className="text-xs muted">@{u.username}{u.bannedAt && <span className="text-[var(--color-coral)]"> · banned</span>}</div></td>
                <td className="text-xs">{u.email}</td>
                <td>{u.level}</td>
                <td className="text-xs">{u.plan}</td>
                <td>
                  {isAdmin ? (
                    <select className="input h-8 text-xs w-28" value={u.role} onChange={(e) => void update(u, { role: e.target.value })}><option>user</option><option>moderator</option><option>admin</option></select>
                  ) : u.role}
                </td>
                <td className="text-xs muted">{timeAgo(u.createdAt)}</td>
                <td className="p-3 text-right whitespace-nowrap space-x-1">
                  {isAdmin && <button className="btn-ghost btn-sm" onClick={() => void update(u, { aiCreditsBonus: u.aiCreditsBonus + 10 })}>+10 AI</button>}
                  {isAdmin && (u.bannedAt ? <button className="btn-ghost btn-sm" onClick={() => void update(u, { banned: false })}>Unban</button> : <button className="btn-danger btn-sm" onClick={() => confirm(`Ban ${u.displayName}? Their plots are hidden.`) && void update(u, { banned: true })}>Ban</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

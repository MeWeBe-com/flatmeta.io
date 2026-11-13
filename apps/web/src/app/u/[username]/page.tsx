import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { PageShell } from '@/components/site-chrome';
import { Avatar, EmptyState, NamedIcon, PlotGrid, SectionTitle } from '@/components/ui';
import { FollowButton } from '@/components/follow-button';
import { MessageButton } from '@/components/message-button';
import { FaceBadge } from '@/components/face-badge';
import { serverApi } from '@/lib/server-api';
import { flag, RARITY_COLOR } from '@/lib/format';
import { SITE_URL } from '@/lib/config';
import type { Org, Plot, PublicUser } from '@/lib/types';
import Link from 'next/link';

type Params = { params: Promise<{ username: string }> };
interface Res { user: PublicUser; plots: Plot[]; achievements: { key: string; name: string; description: string; icon: string; rarity: string; unlockedAt: string }[]; followers: number; following: number; followedByMe: boolean; orgs: Org[] }
const load = (u: string) => serverApi<Res>(`/users/${encodeURIComponent(u)}`);

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const d = await load(username).catch(() => null);
  if (!d) return { title: 'Explorer not found' };
  return { title: `${d.user.displayName} (@${d.user.username})`, description: d.user.bio ?? `${d.user.displayName} is a level ${d.user.level} ${d.user.levelTitle} on FlatMeta.`, alternates: { canonical: `${SITE_URL}/u/${d.user.username}` } };
}

export default async function UserPage({ params }: Params) {
  const { username } = await params;
  const d = await load(username);
  if (!d) {
    // v1 vanity links: flatmeta.io/u/<plot slug> still works and lands on the plot page.
    const plot = await serverApi<{ plot: Plot }>(`/plots/${encodeURIComponent(username)}`, { auth: false, revalidate: 60 }).catch(() => null);
    if (plot) permanentRedirect(`/p/${plot.plot.slug}`);
    notFound();
  }
  const u = d.user;
  return (
    <PageShell>
      <div id="main" className="space-y-10">
        <header className="surface p-6 md:p-8 flex flex-col md:flex-row gap-6 md:items-center">
          {u.avatar && !u.avatarUrl ? <FaceBadge look={u.avatar} size={96} /> : <Avatar name={u.displayName} url={u.avatarUrl} size={96} />}
          <div className="flex-1">
            <h1 className="text-3xl font-bold">{u.displayName} {u.homeCountry && <span>{flag(u.homeCountry)}</span>}</h1>
            <p className="muted">@{u.username} · Level {u.level} {u.levelTitle}{u.plan === 'plus' && ' · ✦ Plus'}</p>
            {u.bio && <p className="mt-3 max-w-xl">{u.bio}</p>}
            <div className="flex gap-6 mt-4 text-sm">
              <span><b>{u.xp.toLocaleString()}</b> <span className="muted">XP</span></span>
              <span><b>{d.followers}</b> <span className="muted">followers</span></span>
              <span><b>{d.following}</b> <span className="muted">following</span></span>
              <span><b>{d.plots.length}</b> <span className="muted">plots</span></span>
            </div>
            {d.orgs.length > 0 && <div className="flex gap-2 mt-3">{d.orgs.map((o) => <Link key={o.id} href={`/o/${o.slug}`} className="chip chip-teal normal-case tracking-normal">{o.name}{o.verified && ' ✓'}</Link>)}</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            <FollowButton username={u.username} initial={d.followedByMe} />
            <MessageButton username={u.username} />
          </div>
        </header>
        <section>
          <SectionTitle>Plots</SectionTitle>
          <PlotGrid plots={d.plots} empty={<EmptyState icon="flag" title="No published plots yet" />} />
        </section>
        <section>
          <SectionTitle>Badges</SectionTitle>
          {d.achievements.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {d.achievements.map((a) => (
                <div key={a.key} className="surface p-4 text-center" title={a.description}>
                  <span className="mx-auto size-12 rounded-2xl grid place-items-center" style={{ background: `${RARITY_COLOR[a.rarity]}22`, color: RARITY_COLOR[a.rarity] }}><NamedIcon name={a.icon} size={22} /></span>
                  <div className="font-semibold text-sm mt-2">{a.name}</div>
                  <div className="text-xs capitalize" style={{ color: RARITY_COLOR[a.rarity] }}>{a.rarity}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted text-sm">No badges yet.</p>
          )}
        </section>
      </div>
    </PageShell>
  );
}

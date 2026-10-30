import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/server-api';
import { SITE_URL } from '@/lib/config';

export const revalidate = 3600;

interface SitemapFeed {
  plots: { slug: string; updatedAt: string }[];
  countries: string[];
  regions: string[];
  users: { username: string; updatedAt: string }[];
  orgs: { slug: string; updatedAt: string }[];
}

const STATIC = ['', '/explore', '/leaderboards', '/pricing', '/business', '/about', '/legal/terms', '/legal/privacy', '/legal/refunds'];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const out: MetadataRoute.Sitemap = STATIC.map((p) => ({ url: `${SITE_URL}${p}`, lastModified: now, changeFrequency: p === '' ? 'hourly' : 'weekly', priority: p === '' ? 1 : 0.6 }));
  // The sitemap must still render if the API is down during a build.
  const feed = await serverApi<SitemapFeed>('/sitemap', { auth: false, revalidate }).catch(() => null);
  if (!feed) return out;
  for (const c of feed.countries) out.push({ url: `${SITE_URL}/c/${c.toLowerCase()}`, changeFrequency: 'daily', priority: 0.7 });
  for (const r of feed.regions) out.push({ url: `${SITE_URL}/r/${r}`, changeFrequency: 'daily', priority: 0.7 });
  for (const p of feed.plots) out.push({ url: `${SITE_URL}/p/${p.slug}`, lastModified: new Date(p.updatedAt), changeFrequency: 'weekly', priority: 0.8 });
  for (const u of feed.users) out.push({ url: `${SITE_URL}/u/${u.username}`, lastModified: new Date(u.updatedAt), changeFrequency: 'weekly', priority: 0.4 });
  for (const o of feed.orgs) out.push({ url: `${SITE_URL}/o/${o.slug}`, lastModified: new Date(o.updatedAt), changeFrequency: 'weekly', priority: 0.5 });
  return out;
}

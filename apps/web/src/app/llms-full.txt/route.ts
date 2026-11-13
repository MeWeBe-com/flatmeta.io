import { llmsTxt, textResponse } from '@/lib/llms';
import { SITE_URL } from '@/lib/config';
import { serverApi } from '@/lib/server-api';

export const revalidate = 3600;

interface Brands { brands: { slug: string; title: string; countryCode: string | null; city: string | null; sector: string | null }[]; countries: { code: string; name: string; count: number }[] }
interface Search { plots: { slug: string; title: string; tagline: string | null; countryName: string | null; indexable?: boolean }[] }

/** llms.txt plus the facts an assistant may want to cite: companies by country and popular places. */
export async function GET() {
  const [brands, popular] = await Promise.all([
    serverApi<Brands>('/brands?page=1', { auth: false, revalidate: 3600 }).catch(() => null),
    serverApi<Search>('/search?q=a&limit=30', { auth: false, revalidate: 3600 }).catch(() => null),
  ]);
  const lines = [llmsTxt(), '', '## Companies with reserved land, by country', ''];
  for (const c of brands?.countries ?? []) lines.push(`- ${c.name}: ${c.count} companies · ${SITE_URL}/brands/${c.code.toLowerCase()}`);
  lines.push('', '## Some companies on FlatMeta (reserved, not affiliated with FlatMeta)', '');
  for (const b of brands?.brands ?? []) lines.push(`- ${b.title}${b.city ? `, ${b.city}` : ''}${b.sector ? ` (${b.sector})` : ''}: ${SITE_URL}/p/${b.slug}`);
  lines.push('', '## Popular places', '');
  // S2: the same indexing rule as the sitemap and the pages' robots meta.
  for (const p of (popular?.plots ?? []).filter((x) => x.indexable !== false)) lines.push(`- ${p.title}${p.countryName ? ` (${p.countryName})` : ''}${p.tagline ? `: ${p.tagline}` : ''} · ${SITE_URL}/p/${p.slug}`);
  return textResponse(lines.join('\n') + '\n');
}

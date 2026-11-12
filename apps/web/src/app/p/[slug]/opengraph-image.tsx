import { ImageResponse } from 'next/og';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'A plot on FlatMeta';

import { API_INTERNAL_URL as API } from '@/lib/internal';
const flag = (c?: string | null) => (c ? c.toUpperCase().replace(/./g, (ch) => String.fromCodePoint(127397 + ch.charCodeAt(0))) : '🌊');

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const res = await fetch(`${API}/v1/plots/${encodeURIComponent(slug)}`).catch(() => null);
  const plot = res?.ok ? ((await res.json()) as { plot: { title: string; tagline: string | null; countryName: string | null; countryCode: string | null; kind: string; coverImageUrl: string | null; showcase: { brand: string; logo?: { url: string } | null } | null } }).plot : null;
  // next/og refuses private-network image URLs, so inline the cover as a data URI.
  let cover: string | null = null;
  if (plot?.coverImageUrl) {
    const img = await fetch(`${API}/v1/plots/${encodeURIComponent(slug)}/cover.jpg?w=1200`).catch(() => null);
    if (img?.ok) cover = `data:image/jpeg;base64,${Buffer.from(await img.arrayBuffer()).toString('base64')}`;
  }
  // H1: the company logo as a small badge (inlined: next/og can't fetch private-network URLs).
  let logo: string | null = null;
  const logoPath = plot?.showcase?.logo?.url;
  if (logoPath && logoPath.startsWith('/media/')) {
    const l = await fetch(`${API.replace(/\/v1$/, '')}${logoPath}`).catch(() => null);
    if (l?.ok && (l.headers.get('content-type') ?? '').startsWith('image/png')) logo = `data:image/png;base64,${Buffer.from(await l.arrayBuffer()).toString('base64')}`;
  }
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: '#0B1020', color: 'white', fontFamily: 'sans-serif' }}>
        {cover && <img src={cover} alt="" width={1200} height={630} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
        <div style={{ position: 'absolute', inset: 0, display: 'flex', background: 'linear-gradient(0deg, rgba(11,16,32,0.95) 10%, rgba(11,16,32,0.2) 60%, rgba(11,16,32,0.1))' }} />
        <div style={{ position: 'absolute', left: 60, right: 60, bottom: 56, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 28, color: plot?.showcase ? '#FFC94D' : '#2DE2C4', fontWeight: 700 }}>
            {plot?.showcase ? 'SHOWCASE · UNCLAIMED' : 'ON FLATMETA'} {flag(plot?.countryCode)} {plot?.countryName ?? ''}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 22, marginTop: 10 }}>
            {logo && <img src={logo} alt="" width={84} height={84} style={{ width: 84, height: 84, borderRadius: 18, background: 'white', padding: 8 }} />}
            <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, lineHeight: 1.05 }}>{plot?.title ?? 'FlatMeta'}</div>
          </div>
          {plot?.showcase && <div style={{ display: 'flex', fontSize: 22, opacity: 0.8, marginTop: 10 }}>{`Reserved for ${plot.showcase.brand}, not affiliated with FlatMeta${logo ? '. Logo shown to identify the company; trademarks belong to their owners.' : ''}`}</div>}
          {plot?.tagline && <div style={{ display: 'flex', fontSize: 32, opacity: 0.85, marginTop: 14 }}>{plot.tagline.slice(0, 110)}</div>}
        </div>
        <div style={{ position: 'absolute', top: 44, right: 56, display: 'flex', alignItems: 'center', gap: 12, fontSize: 30, fontWeight: 800 }}>
          <div style={{ width: 34, height: 34, background: 'linear-gradient(135deg,#2DE2C4,#8B7CFF,#FFC94D)', transform: 'rotate(45deg)', borderRadius: 6 }} />
          FlatMeta
        </div>
      </div>
    ),
    size,
  );
}

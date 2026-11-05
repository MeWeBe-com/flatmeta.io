import { ImageResponse } from 'next/og';

// Default share card for every page that has no image of its own (plot pages draw their own).
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'FlatMeta: claim your corner of the world map';

export default function Image() {
  const dots = Array.from({ length: 70 }, (_, i) => ({ x: (i * 173) % 1200, y: (i * 97) % 630, r: 2 + (i % 4), c: ['#2DE2C4', '#FFC94D', '#8B7CFF', '#FF6B6B'][i % 4]! }));
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', background: 'linear-gradient(135deg, #0B1020 0%, #141B36 60%, #1B1240 100%)', color: 'white', fontFamily: 'sans-serif' }}>
        {dots.map((d, i) => (
          <div key={i} style={{ position: 'absolute', left: d.x, top: d.y, width: d.r * 2, height: d.r * 2, borderRadius: 99, background: d.c, opacity: 0.55, display: 'flex' }} />
        ))}
        <div style={{ position: 'absolute', left: 80, right: 80, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', fontSize: 30, fontWeight: 700, color: '#2DE2C4', letterSpacing: 4 }}>FLATMETA</div>
          <div style={{ display: 'flex', fontSize: 84, fontWeight: 800, lineHeight: 1.05, marginTop: 16 }}>Claim your corner of the world map</div>
          <div style={{ display: 'flex', fontSize: 34, opacity: 0.85, marginTop: 24 }}>Free land · design it with AI · meet explorers nearby</div>
        </div>
      </div>
    ),
    size,
  );
}

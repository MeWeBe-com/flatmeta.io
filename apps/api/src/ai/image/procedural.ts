/**
 * Procedural plot art: deterministic, original, text-free illustrations built
 * from a seed, a palette and a motif. Used as the free image provider and as
 * the placeholder while AI/external images are pending.
 *
 * Scene: gradient sky → glow/sun → stars → far silhouettes (motif-aware) →
 * floating isometric island with a glowing motif emblem → particles → vignette.
 */
import { Resvg } from '@resvg/resvg-js';

export const MOTIFS = [
  'waves', 'circuit', 'leaf', 'sun', 'mountain', 'city', 'orbit', 'bolt', 'drop', 'wheel', 'book', 'music',
  'ball', 'plate', 'heart', 'star', 'globe', 'gear', 'wing', 'cup', 'bag', 'column', 'flame', 'film',
] as const;
export type Motif = (typeof MOTIFS)[number];

export const PALETTES: [string, string, string][] = [
  ['#0B1B3F', '#2DE2C4', '#FFC94D'],
  ['#1A1040', '#8B7CFF', '#FF8FB1'],
  ['#08243A', '#3FA9F5', '#FFE08A'],
  ['#2A0F2E', '#FF6B6B', '#FFD27A'],
  ['#0E2A1F', '#4ADE80', '#FDE68A'],
  ['#1B1B3A', '#F472B6', '#A5F3FC'],
  ['#102030', '#22D3EE', '#F0ABFC'],
  ['#2B1A0E', '#FB923C', '#FEF3C7'],
];

function rng(seedStr: string) {
  let h = 1779033703 ^ seedStr.length;
  for (let i = 0; i < seedStr.length; i++) {
    h = Math.imul(h ^ seedStr.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h.padEnd(6, '0');
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}
const toHex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
function mix(a: string, b: string, t: number) {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}
const shade = (c: string, t: number) => (t < 0 ? mix(c, '#000000', -t) : mix(c, '#ffffff', t));
const isHex = (c: string) => /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c);

/** Motif emblems drawn in a 100×100 box (stroke-based, so they glow nicely). */
const GLYPHS: Record<Motif, string> = {
  waves: '<path d="M8 40c10-10 20-10 30 0s20 10 30 0 20-10 24-4M8 60c10-10 20-10 30 0s20 10 30 0 20-10 24-4M8 80c10-10 20-10 30 0s20 10 30 0 20-10 24-4"/>',
  circuit: '<path d="M20 20h25v25h30M50 45v35M20 80h30M75 45v-25M30 60h-10"/><circle cx="20" cy="20" r="5"/><circle cx="75" cy="20" r="5"/><circle cx="20" cy="80" r="5"/><circle cx="50" cy="80" r="5"/><circle cx="20" cy="60" r="5"/>',
  leaf: '<path d="M20 80C20 40 45 18 82 18c0 37-22 62-62 62zM20 80L62 38M40 60h14M48 52v-14"/>',
  sun: '<circle cx="50" cy="50" r="18"/><path d="M50 10v12M50 78v12M10 50h12M78 50h12M22 22l9 9M69 69l9 9M22 78l9-9M69 31l9-9"/>',
  mountain: '<path d="M8 82l28-46 16 24 12-16 28 38zM36 36l-8 14 8-4 8 4z"/>',
  city: '<path d="M10 85V45h16v40M26 85V25h20v60M46 85V55h14v30M60 85V35h18v50M78 85V60h12v25M8 85h86M32 35h8M32 45h8M32 55h8M66 45h6M66 55h6"/>',
  orbit: '<circle cx="50" cy="50" r="10"/><ellipse cx="50" cy="50" rx="40" ry="16"/><ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(60 50 50)"/><ellipse cx="50" cy="50" rx="40" ry="16" transform="rotate(120 50 50)"/>',
  bolt: '<path d="M56 8L22 56h24l-6 36 36-50H52z"/>',
  drop: '<path d="M50 10C38 30 24 46 24 62a26 26 0 0052 0c0-16-14-32-26-52zM38 64a12 12 0 0012 12"/>',
  wheel: '<circle cx="50" cy="50" r="38"/><circle cx="50" cy="50" r="10"/><path d="M50 12v28M50 60v28M12 50h28M60 50h28M23 23l20 20M57 57l20 20M23 77l20-20M57 43l20-20"/>',
  book: '<path d="M50 24c-12-8-28-8-40-4v60c12-4 28-4 40 4 12-8 28-8 40-4V20c-12-4-28-4-40 4zM50 24v60"/>',
  music: '<path d="M36 74V22l42-10v52"/><circle cx="26" cy="74" r="10"/><circle cx="68" cy="64" r="10"/><path d="M36 36l42-10"/>',
  ball: '<circle cx="50" cy="50" r="38"/><path d="M50 30l18 13-7 21H39l-7-21zM50 12v18M68 43l18-6M61 64l11 15M39 64L28 79M32 43l-18-6"/>',
  plate: '<circle cx="50" cy="54" r="30"/><circle cx="50" cy="54" r="18"/><path d="M14 14v26M8 14v14c0 6 12 6 12 0V14M86 14c-8 4-8 18 0 26v44"/>',
  heart: '<path d="M50 84S12 60 12 36a19 19 0 0138-6 19 19 0 0138 6c0 24-38 48-38 48z"/>',
  star: '<path d="M50 10l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z"/>',
  globe: '<circle cx="50" cy="50" r="38"/><ellipse cx="50" cy="50" rx="16" ry="38"/><path d="M12 50h76M18 30h64M18 70h64"/>',
  gear: '<circle cx="50" cy="50" r="14"/><path d="M44 10h12l2 12 10 4 10-7 8 8-7 10 4 10 12 2v12l-12 2-4 10 7 10-8 8-10-7-10 4-2 12H44l-2-12-10-4-10 7-8-8 7-10-4-10-12-2V44l12-2 4-10-7-10 8-8 10 7 10-4z"/>',
  wing: '<path d="M10 70c20-4 40-20 50-46 4 18 0 34-8 44 10-4 22-14 30-30 2 24-14 44-36 50-12 4-26 2-36-18zM30 66c10-4 18-10 24-20"/>',
  cup: '<path d="M18 36h52v20a26 26 0 01-52 0zM70 42h8a10 10 0 010 20h-9M14 86h64M34 14c-4 6 4 10 0 16M50 14c-4 6 4 10 0 16"/>',
  bag: '<path d="M18 34h64l-6 54H24zM36 34V26a14 14 0 0128 0v8"/>',
  column: '<path d="M18 22h64M22 22l6-10h44l6 10M26 22v58M42 22v58M58 22v58M74 22v58M14 80h72M10 88h80"/>',
  flame: '<path d="M50 90c-18 0-30-12-30-30 0-20 18-26 18-46 12 8 18 20 16 30 6-4 8-10 8-16 10 10 18 22 18 34 0 16-12 28-30 28zM50 90c-8 0-14-6-14-14 0-10 10-14 12-24 8 6 16 14 16 24 0 8-6 14-14 14z"/>',
  film: '<rect x="12" y="24" width="76" height="52" rx="4"/><path d="M12 36h76M12 64h76M24 24v12M40 24v12M56 24v12M72 24v12M24 64v12M40 64v12M56 64v12M72 64v12M44 44v12l12-6z"/>',
};

export interface ProceduralInput {
  seed: string;
  palette?: string[];
  motif?: string;
  width?: number;
  height?: number;
}

export function proceduralSvg({ seed, palette, motif, width = 1536, height = 1024 }: ProceduralInput): string {
  const r = rng(seed);
  const base = PALETTES[Math.floor(r() * PALETTES.length)]!;
  const pal = (palette && palette.length >= 3 && palette.every(isHex) ? palette : base).slice(0, 3) as [string, string, string];
  const [c0, c1, c2] = pal;
  const m: Motif = (MOTIFS as readonly string[]).includes(motif ?? '') ? (motif as Motif) : MOTIFS[Math.floor(r() * MOTIFS.length)]!;
  const W = width;
  const H = height;
  const skyTop = shade(mix(c0, '#050816', 0.35), -0.2);
  const skyBottom = mix(c0, c1, 0.35);
  const horizon = H * 0.62;

  const parts: string[] = [];
  parts.push(`<defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${skyTop}"/><stop offset="0.65" stop-color="${skyBottom}"/><stop offset="1" stop-color="${mix(c1, c2, 0.4)}"/></linearGradient>
    <radialGradient id="sunGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${c2}" stop-opacity="0.95"/><stop offset="0.35" stop-color="${c2}" stop-opacity="0.35"/><stop offset="1" stop-color="${c2}" stop-opacity="0"/></radialGradient>
    <radialGradient id="emblemGlow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${c1}" stop-opacity="0.75"/><stop offset="1" stop-color="${c1}" stop-opacity="0"/></radialGradient>
    <linearGradient id="top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${shade(c1, 0.25)}"/><stop offset="1" stop-color="${shade(c1, -0.25)}"/></linearGradient>
    <linearGradient id="left" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c0, 0.15)}"/><stop offset="1" stop-color="${shade(c0, -0.5)}"/></linearGradient>
    <linearGradient id="right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(c0, -0.1)}"/><stop offset="1" stop-color="${shade(c0, -0.65)}"/></linearGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.45" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.55"/></radialGradient>
    <filter id="blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${W * 0.008}"/></filter>
  </defs>`);
  parts.push(`<rect width="${W}" height="${H}" fill="url(#sky)"/>`);

  // Stars
  for (let i = 0; i < 90; i++) {
    const x = r() * W;
    const y = r() * horizon * 0.85;
    const s = r() * 2.2 + 0.4;
    parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(2)}" fill="#fff" opacity="${(0.25 + r() * 0.6).toFixed(2)}"/>`);
  }

  // Sun / moon with glow
  const sx = W * (0.18 + r() * 0.64);
  const sy = H * (0.2 + r() * 0.18);
  const sr = W * (0.05 + r() * 0.035);
  parts.push(`<circle cx="${sx}" cy="${sy}" r="${sr * 4}" fill="url(#sunGlow)"/>`);
  parts.push(`<circle cx="${sx}" cy="${sy}" r="${sr}" fill="${mix(c2, '#ffffff', 0.35)}"/>`);

  // Far silhouettes (3 layers)
  for (let layer = 0; layer < 3; layer++) {
    const yBase = horizon + layer * H * 0.05;
    const col = mix(mix(c0, c1, 0.25 + layer * 0.1), '#000000', 0.25 + layer * 0.15);
    const op = (0.55 + layer * 0.15).toFixed(2);
    let d = `M0 ${H} L0 ${yBase}`;
    if (m === 'city' || m === 'column' || m === 'circuit' || m === 'film') {
      let x = 0;
      while (x < W) {
        const bw = W * (0.025 + r() * 0.05);
        const bh = H * (0.05 + r() * (0.22 - layer * 0.05));
        d += ` L${x.toFixed(0)} ${(yBase - bh).toFixed(0)} L${(x + bw).toFixed(0)} ${(yBase - bh).toFixed(0)} L${(x + bw).toFixed(0)} ${yBase.toFixed(0)}`;
        x += bw + W * 0.004;
      }
    } else if (m === 'waves' || m === 'drop' || m === 'wing') {
      const amp = H * (0.02 + layer * 0.01);
      for (let x = 0; x <= W; x += W / 60) d += ` L${x.toFixed(0)} ${(yBase + Math.sin(x / (W / (6 + layer * 2)) + r()) * amp).toFixed(0)}`;
    } else {
      let x = 0;
      while (x < W) {
        const step = W * (0.06 + r() * 0.08);
        const peak = H * (0.04 + r() * (m === 'mountain' ? 0.24 : 0.1) - layer * 0.02);
        d += ` L${(x + step / 2).toFixed(0)} ${(yBase - peak).toFixed(0)} L${(x + step).toFixed(0)} ${yBase.toFixed(0)}`;
        x += step;
      }
    }
    d += ` L${W} ${H} Z`;
    parts.push(`<path d="${d}" fill="${col}" opacity="${op}"/>`);
  }

  // Ground: gradient plain with a soft glow under the island
  const gy = horizon + H * 0.12;
  parts.push(`<linearGradient id="ground" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(mix(c0, c1, 0.2), -0.45)}"/><stop offset="1" stop-color="${shade(c0, -0.75)}"/></linearGradient>`);
  parts.push(`<rect y="${gy}" width="${W}" height="${H - gy}" fill="url(#ground)"/>`);
  parts.push(`<ellipse cx="${W / 2}" cy="${H * 0.86}" rx="${W * 0.42}" ry="${H * 0.08}" fill="${c1}" opacity="0.16" filter="url(#blur)"/>`);

  // Floating isometric island
  const cx = W / 2;
  const cy = H * 0.66;
  const iw = W * 0.26;
  const ih = iw * 0.5;
  const depth = H * 0.11;
  const top = `M${cx} ${cy - ih} L${cx + iw} ${cy} L${cx} ${cy + ih} L${cx - iw} ${cy} Z`;
  const left = `M${cx - iw} ${cy} L${cx} ${cy + ih} L${cx} ${cy + ih + depth} L${cx - iw} ${cy + depth} Z`;
  const right = `M${cx + iw} ${cy} L${cx} ${cy + ih} L${cx} ${cy + ih + depth} L${cx + iw} ${cy + depth} Z`;
  parts.push(`<ellipse cx="${cx}" cy="${cy + ih + depth + H * 0.05}" rx="${iw * 0.9}" ry="${ih * 0.25}" fill="#000" opacity="0.35" filter="url(#blur)"/>`);
  parts.push(`<path d="${left}" fill="url(#left)"/><path d="${right}" fill="url(#right)"/><path d="${top}" fill="url(#top)"/>`);
  // Grid on the island top (the FlatMeta cells)
  const n = 6;
  const lines: string[] = [];
  for (let i = 1; i < n; i++) {
    const t = i / n;
    lines.push(`M${cx - iw + iw * t} ${cy - ih * t} L${cx + iw * t} ${cy + ih - ih * t}`);
    lines.push(`M${cx + iw - iw * t} ${cy - ih * t} L${cx - iw * t} ${cy + ih - ih * t}`);
  }
  parts.push(`<path d="${lines.join(' ')}" stroke="#ffffff" stroke-opacity="0.18" stroke-width="${W * 0.0015}" fill="none"/>`);
  parts.push(`<path d="${top}" fill="none" stroke="${mix(c1, '#ffffff', 0.5)}" stroke-opacity="0.7" stroke-width="${W * 0.002}"/>`);

  // Props on the island: little buildings and trees standing on grid cells
  const cellPoint = (u: number, v: number) => ({ x: cx - iw + iw * (u + v), y: cy - ih * (u - v) });
  const props: { x: number; y: number; kind: 'b' | 't'; h: number }[] = [];
  const slots = [0.12, 0.28, 0.72, 0.88];
  for (const u of slots) {
    for (const v of slots) {
      if (r() > 0.42) continue;
      // Keep the centre clear for the emblem's light beam.
      if (u > 0.3 && u < 0.7 && v > 0.3 && v < 0.7) continue;
      const pt = cellPoint(u, v);
      props.push({ x: pt.x, y: pt.y, kind: r() > 0.5 ? 'b' : 't', h: 0.4 + r() * 0.9 });
    }
  }
  props.sort((a, b) => a.y - b.y);
  const ps = iw / 12;
  for (const pr of props) {
    if (pr.kind === 'b') {
      const h = ps * 2.2 * pr.h;
      const { x, y } = pr;
      parts.push(
        `<path d="M${x - ps} ${y} L${x} ${y + ps / 2} L${x} ${y + ps / 2 - h} L${x - ps} ${y - h} Z" fill="${shade(c0, 0.05)}"/>` +
          `<path d="M${x + ps} ${y} L${x} ${y + ps / 2} L${x} ${y + ps / 2 - h} L${x + ps} ${y - h} Z" fill="${shade(c0, -0.3)}"/>` +
          `<path d="M${x} ${y - h - ps / 2} L${x + ps} ${y - h} L${x} ${y + ps / 2 - h} L${x - ps} ${y - h} Z" fill="${mix(c2, c1, 0.5)}"/>` +
          `<rect x="${x - ps * 0.6}" y="${y - h * 0.7}" width="${ps * 0.25}" height="${ps * 0.35}" fill="${c2}" opacity="0.9"/>`,
      );
    } else {
      const h = ps * 2.4 * pr.h;
      parts.push(
        `<path d="M${pr.x} ${pr.y - h} L${pr.x + ps * 0.75} ${pr.y} L${pr.x - ps * 0.75} ${pr.y} Z" fill="${mix(c1, '#16a34a', 0.45)}"/>` +
          `<path d="M${pr.x} ${pr.y - h} L${pr.x + ps * 0.75} ${pr.y} L${pr.x} ${pr.y} Z" fill="${shade(mix(c1, '#16a34a', 0.45), -0.3)}"/>`,
      );
    }
  }

  // Small floating cubes
  for (let i = 0; i < 6; i++) {
    const bx = cx + (r() - 0.5) * W * 0.8;
    const by = H * (0.35 + r() * 0.3);
    const s = W * (0.008 + r() * 0.014);
    if (Math.abs(bx - cx) < iw * 0.8 && by > cy - ih * 2) continue;
    parts.push(
      `<g opacity="${(0.5 + r() * 0.4).toFixed(2)}"><path d="M${bx} ${by - s / 2} L${bx + s} ${by} L${bx} ${by + s / 2} L${bx - s} ${by} Z" fill="${shade(c1, 0.2)}"/><path d="M${bx - s} ${by} L${bx} ${by + s / 2} L${bx} ${by + s * 1.3} L${bx - s} ${by + s * 0.8} Z" fill="${shade(c0, -0.2)}"/><path d="M${bx + s} ${by} L${bx} ${by + s / 2} L${bx} ${by + s * 1.3} L${bx + s} ${by + s * 0.8} Z" fill="${shade(c0, -0.45)}"/></g>`,
    );
  }

  // Emblem (motif glyph) floating above the island
  const es = W * 0.17;
  const ex = cx - es / 2;
  const ey = cy - ih - es * 0.95;
  parts.push(`<circle cx="${cx}" cy="${ey + es / 2}" r="${es * 0.95}" fill="url(#emblemGlow)"/>`);
  parts.push(
    `<g transform="translate(${ex} ${ey}) scale(${es / 100})" fill="none" stroke="${mix(c2, '#ffffff', 0.25)}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" opacity="0.35" filter="url(#blur)">${GLYPHS[m]}</g>`,
  );
  parts.push(
    `<g transform="translate(${ex} ${ey}) scale(${es / 100})" fill="none" stroke="${mix(c2, '#ffffff', 0.55)}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round">${GLYPHS[m]}</g>`,
  );
  // Light beam from island to emblem
  parts.push(`<path d="M${cx - iw * 0.08} ${cy - ih * 0.2} L${cx - es * 0.2} ${ey + es} L${cx + es * 0.2} ${ey + es} L${cx + iw * 0.08} ${cy - ih * 0.2} Z" fill="${c1}" opacity="0.18"/>`);

  // Particles
  for (let i = 0; i < 40; i++) {
    const px = cx + (r() - 0.5) * iw * 2.4;
    const py = cy - r() * H * 0.45;
    parts.push(`<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${(r() * 3 + 1).toFixed(1)}" fill="${r() > 0.5 ? c2 : c1}" opacity="${(0.3 + r() * 0.6).toFixed(2)}"/>`);
  }
  parts.push(`<rect width="${W}" height="${H}" fill="url(#vignette)"/>`);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
}

export function proceduralPng(input: ProceduralInput): Buffer {
  const svg = proceduralSvg(input);
  return Buffer.from(new Resvg(svg, { fitTo: { mode: 'original' } }).render().asPng());
}

export function pickPalette(seed: string): string[] {
  const r = rng(seed);
  return [...PALETTES[Math.floor(r() * PALETTES.length)]!];
}

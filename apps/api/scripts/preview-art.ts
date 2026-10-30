/** Renders a grid of procedural art samples: `npx tsx scripts/preview-art.ts out.png [motif…]` */
import sharp from 'sharp';
import { writeFileSync } from 'node:fs';
import { MOTIFS, proceduralPng } from '../src/ai/image/procedural.js';

const out = process.argv[2] ?? 'art-preview.png';
const motifs = process.argv.slice(3).length ? process.argv.slice(3) : [...MOTIFS].slice(0, 4);
const tiles = await Promise.all(
  motifs.map((m, i) => sharp(proceduralPng({ seed: `preview-${i}-${m}`, motif: m })).resize(768, 512).png().toBuffer()),
);
const cols = 2;
const rows = Math.ceil(tiles.length / cols);
const grid = await sharp({ create: { width: 768 * cols, height: 512 * rows, channels: 3, background: '#000' } })
  .composite(tiles.map((input, i) => ({ input, left: (i % cols) * 768, top: Math.floor(i / cols) * 512 })))
  .png()
  .toBuffer();
writeFileSync(out, grid);
console.log(`Wrote ${out}`);

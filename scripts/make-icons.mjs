// Renders the PWA icons from the logo mark. Run with `npm run icons` (output is committed).
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const mark = (pad) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2DE2C4"/><stop offset=".6" stop-color="#8B7CFF"/><stop offset="1" stop-color="#FFC94D"/></linearGradient>
    <radialGradient id="bg" cx=".5" cy=".35" r=".8"><stop offset="0" stop-color="#1A2A66"/><stop offset="1" stop-color="#0B1020"/></radialGradient>
  </defs>
  <rect width="64" height="64" fill="url(#bg)"/>
  <g transform="translate(${pad} ${pad}) scale(${(64 - pad * 2) / 64})">
    <path d="M32 6 58 21 32 36 6 21Z" fill="url(#g)"/><path d="M6 21 32 36v22L6 43Z" fill="#1B2550"/><path d="M58 21 32 36v22l26-15Z" fill="#121A38"/>
  </g>
</svg>`;

mkdirSync('public/icons', { recursive: true });
const jobs = [
  ['public/icons/icon-192.png', 192, 6],
  ['public/icons/icon-512.png', 512, 6],
  ['public/icons/maskable-512.png', 512, 14],
  ['public/icons/apple-touch-icon.png', 180, 8],
];
for (const [out, size, pad] of jobs) {
  await sharp(Buffer.from(mark(pad)), { density: 600 }).resize(size, size).png().toFile(out);
  console.log('wrote', out);
}

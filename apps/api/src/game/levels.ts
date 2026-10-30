export const MAX_LEVEL = 50;

/** Total XP needed to reach level n (level 1 needs 0). */
export const xpForLevel = (n: number) => (n <= 1 ? 0 : Math.round(50 * Math.pow(n, 1.8)));

export function levelForXp(xp: number): number {
  let level = 1;
  while (level < MAX_LEVEL && xp >= xpForLevel(level + 1)) level++;
  return level;
}

const TITLES: [number, string][] = [
  [50, 'World-Shaper'],
  [40, 'Archon'],
  [30, 'Governor'],
  [20, 'Landholder'],
  [15, 'Cartographer'],
  [10, 'Pathfinder'],
  [5, 'Settler'],
  [1, 'Wanderer'],
];
export const levelTitle = (level: number) => TITLES.find(([l]) => level >= l)?.[1] ?? 'Wanderer';

export function levelProgress(xp: number) {
  const level = levelForXp(xp);
  const current = xpForLevel(level);
  const next = level >= MAX_LEVEL ? current : xpForLevel(level + 1);
  return {
    level,
    title: levelTitle(level),
    xp,
    levelXp: current,
    nextLevelXp: next,
    progress: next === current ? 1 : (xp - current) / (next - current),
  };
}

/** Cosmetic plot frames unlocked by level. */
export const FRAMES: { key: string; name: string; level: number; plan?: 'plus' }[] = [
  { key: 'none', name: 'Clean', level: 1 },
  { key: 'glow', name: 'Soft glow', level: 2 },
  { key: 'gold', name: 'Gilded', level: 5 },
  { key: 'neon', name: 'Neon', level: 8 },
  { key: 'aurora', name: 'Aurora', level: 12 },
  { key: 'pixel', name: 'Pixel', level: 15 },
  { key: 'royal', name: 'Royal', level: 20 },
  { key: 'cosmic', name: 'Cosmic', level: 30 },
  { key: 'prism', name: 'Prism (Plus)', level: 1, plan: 'plus' },
  { key: 'holo', name: 'Hologram (Plus)', level: 1, plan: 'plus' },
];

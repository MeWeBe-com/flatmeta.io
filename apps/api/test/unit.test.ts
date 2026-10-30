import { describe, expect, it } from 'vitest';
import { cellToLngLat, lngLatToCell, rectAround, rectCells, threeWords } from '../src/lib/grid.js';
import { homesteadEligible, quote, tierAt } from '../src/lib/pricing.js';
import { levelForXp, xpForLevel } from '../src/game/levels.js';
import { currentQuests } from '../src/game/quests.js';
import { weekKey } from '../src/game/dates.js';
import { heuristicModeration } from '../src/ai/moderation.js';
import { heuristicIntent } from '../src/ai/search.js';
import { emailMatchesWebsite } from '../src/services/showcase-claim.js';
import { proceduralSvg } from '../src/ai/image/procedural.js';

const prices = { S: 2500, A: 900, B: 400, C: 200, O: 100 };

describe('grid', () => {
  it('round-trips a coordinate to its cell', () => {
    const c = lngLatToCell(-0.1278, 51.5074);
    const nw = cellToLngLat(c.gx, c.gy);
    const se = cellToLngLat(c.gx + 1, c.gy + 1);
    expect(nw.lng).toBeLessThanOrEqual(-0.1278);
    expect(se.lng).toBeGreaterThan(-0.1278);
    expect(nw.lat).toBeGreaterThanOrEqual(51.5074);
    expect(se.lat).toBeLessThan(51.5074);
  });
  it('builds centred rectangles', () => {
    const r = rectAround(2.35, 48.85, 3, 2);
    expect(rectCells(r)).toBe(6);
  });
  it('gives deterministic 3-word addresses', () => {
    expect(threeWords(10, 20)).toBe(threeWords(10, 20));
    expect(threeWords(10, 20).split('.')).toHaveLength(3);
  });
});

describe('pricing', () => {
  it('assigns tiers by distance to featured cities', () => {
    expect(tierAt(51.5074, -0.1278)).toBe('S'); // central London
    expect(tierAt(51.3762, -0.0982)).toBe('B'); // Croydon
    expect(tierAt(54.46, -3.09)).toBe('C'); // Lake District
    expect(tierAt(40, -40)).toBe('O'); // Atlantic
  });
  it('applies Homestead rules', () => {
    expect(homesteadEligible('S', 1)).toBe(false);
    expect(homesteadEligible('A', 1)).toBe(true);
    expect(homesteadEligible('A', 2)).toBe(false);
    expect(homesteadEligible('C', 4)).toBe(true);
    expect(homesteadEligible('C', 5)).toBe(false);
  });
  it('quotes paid land with Plus discount and minimum charge', () => {
    const rect = rectAround(-3.09, 54.46, 3, 3); // tier C, 9 cells
    const free = quote({ rect, prices, plan: 'free', homesteadAvailable: false });
    expect(free.totalCents).toBe(1800);
    const plus = quote({ rect, prices, plan: 'plus', homesteadAvailable: false });
    expect(plus.totalCents).toBe(1620);
    const small = quote({ rect: rectAround(-40, 40, 1, 1), prices, plan: 'free', homesteadAvailable: false });
    expect(small.totalCents).toBe(200); // ocean 1 cell = $1 → minimum $2
    const tooBig = quote({ rect: rectAround(-3, 54, 11, 2), prices, plan: 'free', homesteadAvailable: false });
    expect(tooBig.tooLarge).toBe(true);
  });
});

describe('game rules', () => {
  it('has a smooth level curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(174);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(174)).toBe(2);
    expect(levelForXp(10_000_000)).toBe(50);
  });
  it('picks 3 daily + 3 weekly quests deterministically', () => {
    const a = currentQuests('user-1', new Date('2026-10-28T10:00:00Z'));
    const b = currentQuests('user-1', new Date('2026-10-28T22:00:00Z'));
    expect(a.map((q) => q.def.key)).toEqual(b.map((q) => q.def.key));
    expect(a.filter((q) => q.def.period === 'daily')).toHaveLength(3);
    expect(a.filter((q) => q.def.period === 'weekly')).toHaveLength(3);
  });
  it('computes ISO weeks', () => {
    expect(weekKey(new Date('2026-01-01T12:00:00Z'))).toBe('2026-W01');
    expect(weekKey(new Date('2026-10-28T12:00:00Z'))).toBe('2026-W44');
  });
});

describe('ai fallbacks', () => {
  it('moderates obvious abuse without a provider', () => {
    expect(heuristicModeration('Lovely little café with great coffee').flagged).toBe(false);
    expect(heuristicModeration('double your bitcoin today!!!').score).toBeGreaterThanOrEqual(0.9);
  });
  it('parses search intent heuristically', () => {
    const i = heuristicIntent('best coffee in Lisbon');
    expect(i.place?.toLowerCase()).toBe('lisbon');
    expect(i.category).toBe('food & drink');
    expect(i.sort).toBe('loved');
  });
  it('matches work emails to brand domains', () => {
    expect(emailMatchesWebsite('jane@britishmuseum.org', 'https://www.britishmuseum.org')).toBe(true);
    expect(emailMatchesWebsite('jane@shop.bbc.co.uk', 'https://www.bbc.co.uk/')).toBe(true);
    expect(emailMatchesWebsite('jane@gmail.com', 'https://www.bbc.co.uk/')).toBe(false);
  });
  it('renders text-free procedural art', () => {
    const svg = proceduralSvg({ seed: 'x', motif: 'city' });
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).not.toContain('<text');
  });
});

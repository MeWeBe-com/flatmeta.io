import { and, count, gte, lte } from 'drizzle-orm';
import { z } from 'zod';
import { CITIES } from '../data/cities.js';
import { db, schema } from '../db/client.js';
import type { User } from '../db/schema.js';
import { countryName, haversineKm } from '../lib/geo.js';
import { lngLatToCell, type Rect } from '../lib/grid.js';
import { quoteFor, type QuoteResult } from '../services/plots.js';
import { generateJson } from './text/index.js';

export interface Suggestion {
  rect: Rect;
  center: { lat: number; lng: number };
  quote: QuoteResult;
  near: string;
  neighbours: number;
  score: number;
  reason: string;
}

async function density(r: Rect, by = 25): Promise<number> {
  const P = schema.plots;
  const [row] = await db
    .select({ n: count() })
    .from(P)
    .where(and(lte(P.minGx, r.maxGx + by), gte(P.maxGx, r.minGx - by), lte(P.minGy, r.maxGy + by), gte(P.maxGy, r.minGy - by)));
  return row?.n ?? 0;
}

const wantsBudget = (goal: string) => /\b(cheap|budget|free|low cost|affordable)\b/i.test(goal);
const wantsPrime = (goal: string) => /\b(centre|center|downtown|prime|heart|busy|visible|flagship|shop|store|caf[eé]|restaurant|business)\b/i.test(goal);
const wantsQuiet = (goal: string) => /\b(quiet|calm|nature|countryside|beach|sea|ocean|remote|peaceful)\b/i.test(goal);
const wantsSocial = (goal: string) => /\b(neighbour|neighbor|community|friends|social|busy)\b/i.test(goal);

/**
 * "Where should I claim?": scores free spots around anchor cities (or a given point)
 * on price fit, visibility (tier) and neighbourhood life; AI writes the reasons when available.
 */
export async function suggestPlots(user: User | null, input: { goal: string; lat?: number; lng?: number; country?: string; size?: number }): Promise<{ suggestions: Suggestion[]; provider: string }> {
  const size = Math.max(1, Math.min(input.size ?? 2, 5));
  let anchors: { name: string; lat: number; lng: number }[];
  if (input.lat !== undefined && input.lng !== undefined) {
    anchors = [{ name: 'your spot', lat: input.lat, lng: input.lng }, ...CITIES.map((c) => ({ c, d: haversineKm(input.lat!, input.lng!, c.lat, c.lng) })).sort((a, b) => a.d - b.d).slice(0, 2).map(({ c }) => ({ name: c.name, lat: c.lat, lng: c.lng }))];
  } else {
    const code = input.country?.toUpperCase() ?? user?.homeCountry ?? 'GB';
    anchors = CITIES.filter((c) => c.country === code).sort((a, b) => b.population - a.population).slice(0, 3).map((c) => ({ name: c.name, lat: c.lat, lng: c.lng }));
    if (!anchors.length) anchors = CITIES.filter((c) => c.tier === 'S').slice(0, 3).map((c) => ({ name: c.name, lat: c.lat, lng: c.lng }));
  }
  // Ring offsets in cells: centre (prime), mid (city), far (quiet/cheap).
  const offsets = wantsQuiet(input.goal) || wantsBudget(input.goal) ? [60, 140, 260] : wantsPrime(input.goal) ? [0, 8, 20] : [4, 25, 80];
  const candidates: Suggestion[] = [];
  for (const a of anchors) {
    const c = lngLatToCell(a.lng, a.lat);
    for (const [i, off] of offsets.entries()) {
      const angle = (i * 2.1 + a.lat) % (Math.PI * 2);
      const gx = c.gx + Math.round(Math.cos(angle) * off);
      const gy = c.gy + Math.round(Math.sin(angle) * off);
      const rect = { minGx: gx, minGy: gy, maxGx: gx + size - 1, maxGy: gy + size - 1 };
      const quote = await quoteFor(user, rect);
      if (quote.conflicts.length) continue;
      const nb = await density(rect);
      let score = 50;
      if (wantsBudget(input.goal)) score += quote.free ? 40 : Math.max(0, 30 - quote.totalCents / 100);
      if (wantsPrime(input.goal)) score += { S: 35, A: 28, B: 15, C: 5, O: 0 }[quote.tier];
      if (wantsQuiet(input.goal)) score += { S: 0, A: 5, B: 15, C: 25, O: 20 }[quote.tier];
      if (wantsSocial(input.goal)) score += Math.min(30, nb * 3);
      else score += Math.min(10, nb);
      if (quote.free) score += 10;
      candidates.push({
        rect,
        center: quote.center,
        quote,
        near: a.name,
        neighbours: nb,
        score,
        reason: `${quote.tier === 'S' || quote.tier === 'A' ? 'Prime, highly visible' : quote.tier === 'B' ? 'Lively city' : 'Quiet, affordable'} spot near ${a.name}${quote.countryCode ? `, ${countryName(quote.countryCode)}` : ''}. ${nb ? `${nb} plots nearby.` : 'Be the first settler here.'} ${quote.free ? 'Free as your Homestead.' : `$${(quote.totalCents / 100).toFixed(0)} one-time.`}`,
      });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const top = candidates.slice(0, 5);
  if (top.length) {
    const out = await generateJson({
      schema: z.object({ reasons: z.array(z.string().max(220)).length(top.length) }),
      fast: true,
      maxTokens: 1200,
      system: 'You explain FlatMeta plot suggestions in one friendly, concrete sentence each (≤ 30 words), tied to the user goal. Mention the area and the trade-off (price, visibility, neighbours). No invented facts.',
      prompt: `Goal: ${input.goal}\nSuggestions:\n${top.map((s, i) => `${i + 1}. near ${s.near}, tier ${s.quote.tier}, ${s.neighbours} plots nearby, price ${s.quote.free ? 'free (homestead)' : `$${(s.quote.totalCents / 100).toFixed(0)}`}`).join('\n')}`,
    });
    if (out) {
      top.forEach((s, i) => (s.reason = out.reasons[i] ?? s.reason));
      return { suggestions: top, provider: 'ai' };
    }
  }
  return { suggestions: top, provider: 'heuristic' };
}

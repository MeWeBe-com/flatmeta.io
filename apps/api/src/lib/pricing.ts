import { CITIES } from '../data/cities.js';
import { countryAt, haversineKm, nearestCity } from './geo.js';
import { type Rect, cellToLngLat, rectCells, rectCenter, rectHeight, rectWidth } from './grid.js';

export type Tier = 'S' | 'A' | 'B' | 'C' | 'O';
export const TIER_ORDER: Tier[] = ['S', 'A', 'B', 'C', 'O'];

export const DEFAULT_TIERS: { tier: Tier; label: string; priceCents: number; description: string }[] = [
  { tier: 'S', label: 'Icon', priceCents: 2500, description: 'The heart of a world-icon city' },
  { tier: 'A', label: 'Prime', priceCents: 900, description: 'Central areas of major cities' },
  { tier: 'B', label: 'City', priceCents: 400, description: 'Greater metro areas' },
  { tier: 'C', label: 'Land', priceCents: 200, description: 'Everywhere else on land' },
  { tier: 'O', label: 'Ocean', priceCents: 100, description: 'Open water' },
];

export const TIER_RADIUS_KM = { S: 2.5, A: 8, B: 25 } as const;

export const PLANS = {
  free: { aiCredits: 3, maxPlots: 3, maxSide: 10, discount: 0 },
  plus: { aiCredits: 30, maxPlots: 10, maxSide: 10, discount: 0.1 },
  business: { aiCredits: 100, maxPlots: 25, maxSide: 20, discount: 0 },
  brand: { aiCredits: 500, maxPlots: 100, maxSide: 20, discount: 0 },
  enterprise: { aiCredits: 2000, maxPlots: 1000, maxSide: 20, discount: 0 },
} as const;
export type PlanKey = keyof typeof PLANS;

export const UPGRADES = {
  spotlight: { label: 'Spotlight (7 days)', priceCents: 900, days: 7 },
  beacon: { label: 'Beacon (24 hours)', priceCents: 300, days: 1 },
  credits: { label: 'AI Design Pack (+25 designs)', priceCents: 500, credits: 25 },
} as const;
export type UpgradeKind = keyof typeof UPGRADES;

export const LANDMARK_PRICE_CENTS = 99000;
export const MIN_CHARGE_CENTS = 200;
export const HOMESTEAD_MAX_CELLS = 4;

export const SUBSCRIPTION_PRICES = {
  plus: { month: 500, year: 4800 },
  business: { month: 2900, year: 29000 },
  brand: { month: 24900, year: 249000 },
} as const;

export function tierAt(lat: number, lng: number): Tier {
  for (const c of CITIES) {
    if (c.tier !== 'S' || Math.abs(c.lat - lat) > 0.1 || Math.abs(c.lng - lng) > 0.15) continue;
    if (haversineKm(lat, lng, c.lat, c.lng) <= TIER_RADIUS_KM.S) return 'S';
  }
  const near = nearestCity(lat, lng, TIER_RADIUS_KM.B);
  if (near) return near.km <= TIER_RADIUS_KM.A ? 'A' : 'B';
  return countryAt(lat, lng) ? 'C' : 'O';
}

/** Highest tier among the plot's corners and centre. */
export function tierOfRect(r: Rect): Tier {
  const pts = [
    cellToLngLat(r.minGx, r.minGy),
    cellToLngLat(r.maxGx + 1, r.minGy),
    cellToLngLat(r.minGx, r.maxGy + 1),
    cellToLngLat(r.maxGx + 1, r.maxGy + 1),
    rectCenter(r),
  ];
  let best: Tier = 'O';
  for (const p of pts) {
    const t = tierAt(p.lat, p.lng);
    if (TIER_ORDER.indexOf(t) < TIER_ORDER.indexOf(best)) best = t;
  }
  return best;
}

export interface QuoteInput {
  rect: Rect;
  prices: Record<Tier, number>;
  plan: PlanKey;
  homesteadAvailable: boolean;
}

export interface Quote {
  cells: number;
  width: number;
  height: number;
  tier: Tier;
  unitCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  homesteadEligible: boolean;
  free: boolean;
  tooLarge: boolean;
  maxSide: number;
}

export function homesteadEligible(tier: Tier, cells: number): boolean {
  if (tier === 'S') return false;
  if (tier === 'A') return cells === 1;
  return cells <= HOMESTEAD_MAX_CELLS;
}

export function quote({ rect, prices, plan, homesteadAvailable }: QuoteInput): Quote {
  const cells = rectCells(rect);
  const tier = tierOfRect(rect);
  const unitCents = prices[tier];
  const subtotalCents = cells * unitCents;
  const discountCents = Math.round(subtotalCents * PLANS[plan].discount);
  const eligible = homesteadAvailable && homesteadEligible(tier, cells);
  const totalCents = eligible ? 0 : Math.max(MIN_CHARGE_CENTS, subtotalCents - discountCents);
  const maxSide = PLANS[plan].maxSide;
  return {
    cells,
    width: rectWidth(rect),
    height: rectHeight(rect),
    tier,
    unitCents,
    subtotalCents,
    discountCents: eligible ? subtotalCents : discountCents,
    totalCents,
    homesteadEligible: eligible,
    free: eligible,
    tooLarge: rectWidth(rect) > maxSide || rectHeight(rect) > maxSide,
    maxSide,
  };
}

export const formatUsd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;

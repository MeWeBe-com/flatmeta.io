/**
 * Creates FlatMeta's subscription products and prices in Stripe from our plans config
 * (src/lib/pricing.ts → SUBSCRIPTION_PRICES), if they are missing. Safe to run again: it only reports.
 *
 *   npm run stripe:sync                         # dry run: shows what exists and what would be created
 *   npm run stripe:sync -- --apply              # create missing products/prices (test key)
 *   npm run stripe:sync -- --apply --live       # same with a live key (required as a second confirmation)
 *   npm run stripe:sync -- --apply --update-prices   # a plan's amount changed: create a new price and move
 *                                               # the lookup key to it (existing subscribers keep theirs)
 *
 * Products get fixed IDs (<prefix>_<plan>, e.g. flatmeta_plus); prices get lookup keys
 * (<prefix>_<plan>_<interval>, e.g. flatmeta_plus_month). The API finds prices by lookup key, so no price IDs
 * need to be copied into .env (STRIPE_PRICE_* still override when set). Reads STRIPE_SECRET_KEY from .env;
 * never prints it.
 */
import type Stripe from 'stripe';
import { config, stripeMode } from '../src/config.js';
import { SUBSCRIPTION_PRICES } from '../src/lib/pricing.js';

export type Plan = keyof typeof SUBSCRIPTION_PRICES;
export type Interval = 'month' | 'year';
const NAMES: Record<Plan, { name: string; description: string }> = {
  plus: { name: 'FlatMeta Plus', description: 'Personal plan: more AI designs, frames and plots.' },
  business: { name: 'FlatMeta Business', description: 'For local businesses: organisation plan with team and analytics.' },
  brand: { name: 'FlatMeta Brand', description: 'For brands and organisations: verified Landmarks, more plots and seats.' },
};

export interface ExistingPrice {
  id: string;
  lookupKey: string;
  unitAmount: number | null;
  currency: string;
  interval: string | null;
  active: boolean;
}
export type Action =
  | { kind: 'ok'; plan: Plan; interval: Interval; lookupKey: string; priceId: string }
  | { kind: 'create'; plan: Plan; interval: Interval; lookupKey: string; amount: number }
  | { kind: 'changed'; plan: Plan; interval: Interval; lookupKey: string; priceId: string; have: number | null; want: number };

/** What has to happen for each plan × interval, given the prices Stripe already has (pure, unit-tested). */
export function planSync(existing: ExistingPrice[], opts: { prefix: string; currency: string }): Action[] {
  const out: Action[] = [];
  for (const plan of Object.keys(SUBSCRIPTION_PRICES) as Plan[]) {
    for (const interval of ['month', 'year'] as Interval[]) {
      const lookupKey = `${opts.prefix}_${plan}_${interval}`;
      const want = SUBSCRIPTION_PRICES[plan][interval];
      const have = existing.find((p) => p.lookupKey === lookupKey && p.active);
      if (!have) out.push({ kind: 'create', plan, interval, lookupKey, amount: want });
      else if (have.unitAmount !== want || have.currency !== opts.currency || have.interval !== interval) out.push({ kind: 'changed', plan, interval, lookupKey, priceId: have.id, have: have.unitAmount, want });
      else out.push({ kind: 'ok', plan, interval, lookupKey, priceId: have.id });
    }
  }
  return out;
}

const money = (cents: number | null) => (cents === null ? '?' : `${(cents / 100).toFixed(2)} ${config.CURRENCY.toUpperCase()}`);

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has('--apply');
  const mode = stripeMode();
  if (mode === 'none') {
    console.error('STRIPE_SECRET_KEY is not set (in .env). Nothing to do.');
    process.exit(1);
  }
  if (apply && mode === 'live' && !args.has('--live')) {
    console.error('This is a LIVE key. Re-run with --apply --live to create live products and prices.');
    process.exit(1);
  }
  const { default: StripeCtor } = await import('stripe');
  const s: Stripe = new StripeCtor(config.STRIPE_SECRET_KEY!);
  const prefix = config.STRIPE_LOOKUP_PREFIX;
  const keys = (Object.keys(SUBSCRIPTION_PRICES) as Plan[]).flatMap((p) => [`${prefix}_${p}_month`, `${prefix}_${p}_year`]);
  const found = await s.prices.list({ lookup_keys: keys, active: true, limit: 100 });
  const existing: ExistingPrice[] = found.data.map((p) => ({ id: p.id, lookupKey: p.lookup_key ?? '', unitAmount: p.unit_amount, currency: p.currency, interval: p.recurring?.interval ?? null, active: p.active }));
  const actions = planSync(existing, { prefix, currency: config.CURRENCY });

  console.log(`Stripe ${mode.toUpperCase()} mode · currency ${config.CURRENCY} · lookup prefix "${prefix}" · ${apply ? 'APPLY' : 'dry run'}\n`);
  const ensureProduct = async (plan: Plan) => {
    const id = `${prefix}_${plan}`;
    try {
      return await s.products.retrieve(id);
    } catch {
      if (!apply) return null;
      return s.products.create({ id, name: NAMES[plan].name, description: NAMES[plan].description, metadata: { app: 'flatmeta', plan } });
    }
  };
  const envLines: string[] = [];
  for (const a of actions) {
    const label = `${a.plan}/${a.interval}`.padEnd(15);
    if (a.kind === 'ok') {
      console.log(`  ok        ${label} ${a.lookupKey} → ${a.priceId}`);
      envLines.push(`STRIPE_PRICE_${a.plan.toUpperCase()}_${a.interval.toUpperCase()}=${a.priceId}`);
      continue;
    }
    if (a.kind === 'changed' && !args.has('--update-prices')) {
      console.log(`  CHANGED   ${label} ${a.lookupKey} is ${money(a.have)}, config says ${money(a.want)} (re-run with --apply --update-prices to switch new sign-ups)`);
      envLines.push(`STRIPE_PRICE_${a.plan.toUpperCase()}_${a.interval.toUpperCase()}=${a.priceId}`);
      continue;
    }
    const amount = a.kind === 'create' ? a.amount : a.want;
    if (!apply) {
      console.log(`  create    ${label} ${a.lookupKey} at ${money(amount)}/${a.interval}`);
      continue;
    }
    const product = await ensureProduct(a.plan);
    const price = await s.prices.create({
      product: product!.id,
      currency: config.CURRENCY,
      unit_amount: amount,
      recurring: { interval: a.interval },
      lookup_key: a.lookupKey,
      transfer_lookup_key: a.kind === 'changed', // the old price keeps serving existing subscribers
      nickname: `${NAMES[a.plan].name} (${a.interval}ly)`,
      tax_behavior: 'exclusive',
      metadata: { app: 'flatmeta', plan: a.plan, interval: a.interval },
    });
    console.log(`  created   ${label} ${a.lookupKey} → ${price.id} at ${money(amount)}/${a.interval}`);
    envLines.push(`STRIPE_PRICE_${a.plan.toUpperCase()}_${a.interval.toUpperCase()}=${price.id}`);
  }
  console.log('\nThe API finds these by lookup key. Optional: pin them in .env instead:');
  for (const l of envLines) console.log(`  ${l}`);
  if (!apply && actions.some((a) => a.kind !== 'ok')) console.log('\nDry run: nothing was changed. Add --apply to create.');
}

if (process.argv[1]?.endsWith('stripe-sync.ts')) {
  main().catch((err) => {
    console.error(`stripe-sync failed: ${(err as Error).message}`);
    process.exit(1);
  });
}

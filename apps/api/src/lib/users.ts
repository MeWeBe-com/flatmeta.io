import { count, eq, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import type { User } from '../db/schema.js';
import { PLANS, type PlanKey } from './pricing.js';
import { slugify } from './slug.js';
import { monthKey } from '../game/dates.js';

const ADJ = ['brave', 'sunny', 'swift', 'quiet', 'lucky', 'bold', 'merry', 'misty', 'cosmic', 'golden', 'wild', 'gentle'];
const NOUN = ['otter', 'falcon', 'maple', 'comet', 'harbor', 'meadow', 'lynx', 'river', 'summit', 'willow', 'atlas', 'ember'];

async function freeUsername(base: string): Promise<string> {
  let root = slugify(base, 20).replace(/-/g, '_') || 'explorer';
  if (root.length < 3) root = `${root}_${ADJ[Math.floor(Math.random() * ADJ.length)]}`;
  for (let i = 0; i < 50; i++) {
    const candidate = i === 0 ? root : `${root}${Math.floor(Math.random() * 9000 + 100)}`;
    const [hit] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, candidate));
    if (!hit) return candidate;
  }
  return `${root}_${Date.now().toString(36)}`;
}

export function randomDisplayName(): string {
  const a = ADJ[Math.floor(Math.random() * ADJ.length)]!;
  const n = NOUN[Math.floor(Math.random() * NOUN.length)]!;
  return `${a[0]!.toUpperCase()}${a.slice(1)} ${n[0]!.toUpperCase()}${n.slice(1)}`;
}

export async function findOrCreateUser(email: string, opts: { displayName?: string; homeCountry?: string | null; role?: string } = {}): Promise<{ user: User; isNew: boolean }> {
  const normal = email.trim().toLowerCase();
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, normal));
  if (existing) return { user: existing, isNew: false };
  const displayName = opts.displayName?.trim() || randomDisplayName();
  const username = await freeUsername(normal.split('@')[0] ?? displayName);
  const [user] = await db
    .insert(schema.users)
    .values({
      email: normal,
      username,
      displayName,
      homeCountry: opts.homeCountry?.toUpperCase().slice(0, 2) ?? null,
      role: opts.role ?? 'user',
      aiPeriod: monthKey(),
    })
    .onConflictDoNothing()
    .returning();
  if (!user) {
    const [again] = await db.select().from(schema.users).where(eq(schema.users.email, normal));
    return { user: again!, isNew: false };
  }
  return { user, isNew: true };
}

export async function userCount(): Promise<number> {
  const [r] = await db.select({ n: count() }).from(schema.users);
  return r?.n ?? 0;
}

/** The best plan a user can act with: their own (free/plus) or an organisation's. */
export async function effectivePlan(user: User, orgId?: string | null): Promise<PlanKey> {
  if (orgId) {
    const [o] = await db.select({ plan: schema.organizations.plan }).from(schema.organizations).where(eq(schema.organizations.id, orgId));
    return (o?.plan as PlanKey) ?? 'free';
  }
  return (user.plan as PlanKey) ?? 'free';
}

export async function aiCreditsStatus(user: User) {
  const orgPlans = await db
    .select({ plan: schema.organizations.plan })
    .from(schema.orgMembers)
    .innerJoin(schema.organizations, eq(schema.orgMembers.orgId, schema.organizations.id))
    .where(eq(schema.orgMembers.userId, user.id));
  const limits = [PLANS[(user.plan as PlanKey) ?? 'free'].aiCredits, ...orgPlans.map((o) => PLANS[(o.plan as PlanKey) ?? 'free'].aiCredits)];
  const monthly = Math.max(...limits);
  const period = monthKey();
  const used = user.aiPeriod === period ? user.aiCreditsUsed : 0;
  const unlimited = user.role === 'admin';
  return { monthly, used, bonus: user.aiCreditsBonus, remaining: unlimited ? 9999 : Math.max(0, monthly - used) + user.aiCreditsBonus, period, unlimited };
}

/** Uses one AI credit (monthly first, then bonus). Returns false when none are left. */
export async function consumeAiCredit(user: User): Promise<boolean> {
  const s = await aiCreditsStatus(user);
  if (s.unlimited) return true;
  if (s.remaining <= 0) return false;
  if (s.used < s.monthly) {
    await db
      .update(schema.users)
      .set({
        aiCreditsUsed: user.aiPeriod === s.period ? sql`${schema.users.aiCreditsUsed} + 1` : 1,
        aiPeriod: s.period,
      })
      .where(eq(schema.users.id, user.id));
  } else {
    await db.update(schema.users).set({ aiCreditsBonus: sql`greatest(0, ${schema.users.aiCreditsBonus} - 1)` }).where(eq(schema.users.id, user.id));
  }
  return true;
}

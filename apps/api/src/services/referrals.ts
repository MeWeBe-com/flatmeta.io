import { randomInt } from 'node:crypto';
import { and, eq, gte, isNull, sql } from 'drizzle-orm';
import { config } from '../config.js';
import { db, schema } from '../db/client.js';
import type { User } from '../db/schema.js';
import { notify } from '../game/activity.js';

/**
 * Referrals (G11). Everyone has a short code; flatmeta.io/?ref=CODE remembers it on the device, and a new account
 * created within a day takes it. When the invited friend claims their first land, both get REFERRAL_BONUS_CELLS free
 * squares (the referrer at most REFERRAL_MAX_PER_DAY times a day). No self-referrals, no changing referrer later.
 */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const code = () => Array.from({ length: 8 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

export async function ensureReferralCode(userId: string): Promise<string> {
  const [u] = await db.select({ c: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, userId));
  if (u?.c) return u.c;
  for (let i = 0; i < 5; i++) {
    const c = code();
    try {
      const [row] = await db
        .update(schema.users)
        .set({ referralCode: c })
        .where(and(eq(schema.users.id, userId), isNull(schema.users.referralCode)))
        .returning({ c: schema.users.referralCode });
      if (row?.c) return row.c;
      const [again] = await db.select({ c: schema.users.referralCode }).from(schema.users).where(eq(schema.users.id, userId));
      if (again?.c) return again.c;
    } catch {
      /* unique clash: try another code */
    }
  }
  throw new Error('Could not create a referral code');
}

export const REFERRAL_WINDOW_MS = 24 * 3600_000;

/** Links a new account to the friend who invited it. Returns whether it was linked. */
export async function attachReferrer(user: Pick<User, 'id' | 'createdAt' | 'referredBy'>, rawCode: string): Promise<boolean> {
  const c = rawCode.trim().toLowerCase();
  if (!/^[a-z0-9]{8}$/.test(c) || user.referredBy) return false;
  if (Date.now() - new Date(user.createdAt).getTime() > REFERRAL_WINDOW_MS) return false;
  const [ref] = await db.select({ id: schema.users.id, bannedAt: schema.users.bannedAt }).from(schema.users).where(eq(schema.users.referralCode, c));
  if (!ref || ref.id === user.id || ref.bannedAt) return false;
  const [row] = await db
    .update(schema.users)
    .set({ referredBy: ref.id })
    .where(and(eq(schema.users.id, user.id), isNull(schema.users.referredBy)))
    .returning({ id: schema.users.id });
  return !!row;
}

/** Called after a successful claim: rewards both sides once, on the invitee's first land. */
export async function rewardReferral(inviteeId: string): Promise<{ rewarded: boolean; referrerRewarded: boolean }> {
  const bonus = config.REFERRAL_BONUS_CELLS;
  const [claimed] = await db
    .update(schema.users)
    .set({ referralRewardedAt: new Date() })
    .where(and(eq(schema.users.id, inviteeId), isNull(schema.users.referralRewardedAt), sql`${schema.users.referredBy} is not null`))
    .returning({ referredBy: schema.users.referredBy });
  if (!claimed?.referredBy || bonus <= 0) return { rewarded: false, referrerRewarded: false };
  await db.update(schema.users).set({ bonusCells: sql`${schema.users.bonusCells} + ${bonus}` }).where(eq(schema.users.id, inviteeId));
  await notify(inviteeId, 'referral_bonus', { cells: bonus, role: 'invitee' });
  const since = new Date(Date.now() - 24 * 3600_000);
  const [today] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(and(eq(schema.users.referredBy, claimed.referredBy), gte(schema.users.referralRewardedAt, since)));
  if ((today?.n ?? 0) > config.REFERRAL_MAX_PER_DAY) return { rewarded: true, referrerRewarded: false };
  await db.update(schema.users).set({ bonusCells: sql`${schema.users.bonusCells} + ${bonus}` }).where(eq(schema.users.id, claimed.referredBy));
  await notify(claimed.referredBy, 'referral_bonus', { cells: bonus, role: 'referrer' });
  return { rewarded: true, referrerRewarded: true };
}

/** Free squares a person may hold while paid land is off: the standard allowance plus earned bonus squares. */
export function freeLimitFor(user: Pick<User, 'bonusCells'> | null, orgId?: string | null): number {
  return config.FREE_LAND_CELLS + (user && !orgId ? user.bonusCells : 0);
}

export async function referralStats(userId: string) {
  const [row] = await db
    .select({
      invited: sql<number>`count(*)::int`,
      claimed: sql<number>`count(*) filter (where ${schema.users.referralRewardedAt} is not null)::int`,
    })
    .from(schema.users)
    .where(eq(schema.users.referredBy, userId));
  const [me] = await db.select({ bonusCells: schema.users.bonusCells, bonusCellsUsed: schema.users.bonusCellsUsed }).from(schema.users).where(eq(schema.users.id, userId));
  return { invited: row?.invited ?? 0, claimed: row?.claimed ?? 0, bonusCells: me?.bonusCells ?? 0, bonusCellsUsed: me?.bonusCellsUsed ?? 0 };
}

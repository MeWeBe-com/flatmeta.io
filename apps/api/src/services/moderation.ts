import { db, schema } from '../db/client.js';
import { HIDE_THRESHOLD, moderate, type ModerationResult } from '../ai/moderation.js';

export type ModerationStatus = 'ok' | 'pending' | 'flagged';

/** Runs moderation and records a flag when needed. `flagged` content should be hidden; `pending` stays visible but is queued. */
export async function checkContent(targetType: 'plot' | 'guestbook' | 'media' | 'user', targetId: string, text: string, imageUrl?: string): Promise<{ status: ModerationStatus; result: ModerationResult }> {
  const result = await moderate(text, imageUrl);
  if (!result.flagged) return { status: 'ok', result };
  const status: ModerationStatus = result.score >= HIDE_THRESHOLD ? 'flagged' : 'pending';
  await db.insert(schema.moderationFlags).values({
    targetType,
    targetId,
    source: 'ai',
    reason: `${result.provider}: ${result.reason || result.categories.join(', ') || 'flagged'}`.slice(0, 500),
    score: result.score,
  });
  return { status, result };
}

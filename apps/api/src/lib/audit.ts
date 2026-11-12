import { db, schema } from '../db/client.js';

/** One audit-log row: who did what to which object (H3: every plot content change is recorded). */
export async function audit(actorId: string | null, action: string, targetType: string | null, targetId: string | null, meta: Record<string, unknown> = {}) {
  await db.insert(schema.auditLog).values({ actorId, action, targetType, targetId, meta });
}

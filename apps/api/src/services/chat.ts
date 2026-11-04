import { and, desc, eq, gt, inArray, lt, or, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import type { User } from '../db/schema.js';
import { heuristicModeration } from '../ai/moderation.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { stripText } from '../lib/markdown.js';
import { key, publish, redis } from '../lib/redis.js';
import { logger } from '../lib/logger.js';
import { notify } from '../game/activity.js';
import { recordAction } from '../game/engine.js';

export const CHAT_CHANNEL = () => key('chat');
export const NEARBY_RADIUS_KM = 2;
export const MAX_MESSAGE_LEN = 280;
/** Nearby rooms are ~5 km squares so history can be fetched with a few cheap queries. */
export const geocell = (lat: number, lng: number) => `${Math.floor(lat * 20)}:${Math.floor(lng * 20)}`;
export const nearbyRoom = (lat: number, lng: number) => `nearby:${geocell(lat, lng)}`;
export const dmRoom = (a: string, b: string) => `dm:${[a, b].sort().join(':')}`;
export const clanRoom = (clanId: string) => `clan:${clanId}`;

export interface ChatOut {
  id: number;
  room: string;
  senderId: string | null;
  senderName: string;
  /** Sender's @username, so private threads can be keyed without loading the friends list. */
  senderUsername?: string | null;
  /** For private messages: the recipient's @username. */
  toUsername?: string | null;
  avatar: { face: string; color: string; accessory?: string } | null;
  body: string;
  createdAt: string;
  /** Where the message was sent from (nearby delivery uses it). */
  lat?: number;
  lng?: number;
}

// ─── Connections ─────────────────────────────────────────────────────────────

/** The relation between two users, from `a`'s point of view. */
export async function relation(a: string, b: string): Promise<{ id: string | null; status: 'none' | 'pending_out' | 'pending_in' | 'accepted' | 'blocked_by_me' | 'blocked_me' }> {
  const rows = await db
    .select()
    .from(schema.connections)
    .where(or(and(eq(schema.connections.requesterId, a), eq(schema.connections.addresseeId, b)), and(eq(schema.connections.requesterId, b), eq(schema.connections.addresseeId, a))));
  const mine = rows.find((r) => r.requesterId === a);
  const theirs = rows.find((r) => r.requesterId === b);
  if (mine?.status === 'blocked') return { id: mine.id, status: 'blocked_by_me' };
  if (theirs?.status === 'blocked') return { id: theirs.id, status: 'blocked_me' };
  const accepted = rows.find((r) => r.status === 'accepted');
  if (accepted) return { id: accepted.id, status: 'accepted' };
  if (mine?.status === 'pending') return { id: mine.id, status: 'pending_out' };
  if (theirs?.status === 'pending') return { id: theirs.id, status: 'pending_in' };
  return { id: null, status: 'none' };
}

async function userByName(username: string): Promise<User> {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.username, username));
  if (!u || u.bannedAt) throw notFound('Player');
  return u;
}

export async function requestConnection(me: User, username: string) {
  const other = await userByName(username);
  if (other.id === me.id) throw badRequest('That’s you!');
  const rel = await relation(me.id, other.id);
  if (rel.status === 'blocked_me' || rel.status === 'blocked_by_me') throw forbidden('You can’t connect with this player.');
  if (rel.status === 'accepted') throw conflict('You are already connected.');
  if (rel.status === 'pending_out') throw conflict('Request already sent.');
  if (rel.status === 'pending_in') return acceptConnection(me, rel.id!); // they asked first: just accept
  const [recent] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(schema.connections)
    .where(and(eq(schema.connections.requesterId, me.id), gt(schema.connections.createdAt, new Date(Date.now() - 3600_000))));
  if ((recent?.n ?? 0) >= 20) throw badRequest('Too many requests this hour. Try again later.');
  const [row] = await db.insert(schema.connections).values({ requesterId: me.id, addresseeId: other.id }).returning();
  await notify(other.id, 'connection_request', { connectionId: row!.id, from: { username: me.username, displayName: me.displayName } });
  return { id: row!.id, status: 'pending' as const, with: other.username };
}

export async function acceptConnection(me: User, connectionId: string) {
  const [row] = await db
    .update(schema.connections)
    .set({ status: 'accepted', updatedAt: new Date() })
    .where(and(eq(schema.connections.id, connectionId), eq(schema.connections.addresseeId, me.id), eq(schema.connections.status, 'pending')))
    .returning();
  if (!row) throw notFound('Request');
  await notify(row.requesterId, 'connection_accepted', { by: { username: me.username, displayName: me.displayName } });
  await recordAction(me.id, 'follow', { ref: row.id }).catch(() => undefined);
  const [other] = await db.select({ username: schema.users.username }).from(schema.users).where(eq(schema.users.id, row.requesterId));
  return { id: row.id, status: 'accepted' as const, with: other?.username ?? '' };
}

export async function removeConnection(me: User, connectionId: string) {
  const res = await db
    .delete(schema.connections)
    .where(and(eq(schema.connections.id, connectionId), or(eq(schema.connections.requesterId, me.id), eq(schema.connections.addresseeId, me.id)), sql`${schema.connections.status} <> 'blocked'`))
    .returning({ id: schema.connections.id });
  if (!res.length) throw notFound('Connection');
}

export async function blockUser(me: User, username: string) {
  const other = await userByName(username);
  if (other.id === me.id) throw badRequest('You can’t block yourself.');
  await db
    .delete(schema.connections)
    .where(or(and(eq(schema.connections.requesterId, me.id), eq(schema.connections.addresseeId, other.id)), and(eq(schema.connections.requesterId, other.id), eq(schema.connections.addresseeId, me.id))));
  await db.insert(schema.connections).values({ requesterId: me.id, addresseeId: other.id, status: 'blocked' });
}

export async function unblockUser(me: User, username: string) {
  const other = await userByName(username);
  await db.delete(schema.connections).where(and(eq(schema.connections.requesterId, me.id), eq(schema.connections.addresseeId, other.id), eq(schema.connections.status, 'blocked')));
}

export async function listConnections(me: User) {
  const rows = await db
    .select()
    .from(schema.connections)
    .where(or(eq(schema.connections.requesterId, me.id), eq(schema.connections.addresseeId, me.id)));
  const ids = [...new Set(rows.flatMap((r) => [r.requesterId, r.addresseeId]).filter((x) => x !== me.id))];
  const users = ids.length ? await db.select().from(schema.users).where(inArray(schema.users.id, ids)) : [];
  const um = new Map(users.map((u) => [u.id, u]));
  const view = (id: string) => {
    const u = um.get(id);
    return u ? { id: u.id, username: u.username, displayName: u.displayName, avatar: u.avatar ?? null, avatarUrl: u.avatarUrl, level: u.level } : null;
  };
  return {
    friends: rows.filter((r) => r.status === 'accepted').map((r) => ({ connectionId: r.id, user: view(r.requesterId === me.id ? r.addresseeId : r.requesterId) })).filter((x) => x.user),
    incoming: rows.filter((r) => r.status === 'pending' && r.addresseeId === me.id).map((r) => ({ connectionId: r.id, user: view(r.requesterId), at: r.createdAt })).filter((x) => x.user),
    outgoing: rows.filter((r) => r.status === 'pending' && r.requesterId === me.id).map((r) => ({ connectionId: r.id, user: view(r.addresseeId), at: r.createdAt })).filter((x) => x.user),
    blocked: rows.filter((r) => r.status === 'blocked' && r.requesterId === me.id).map((r) => ({ connectionId: r.id, user: view(r.addresseeId) })).filter((x) => x.user),
  };
}

// ─── Messages ────────────────────────────────────────────────────────────────

export interface SendInput {
  room: string;
  body: string;
  lat?: number;
  lng?: number;
}

/**
 * Validates, moderates, stores and publishes one message. Returns the stored message or throws
 * a user-facing error. Used by both the WebSocket and the REST fallbacks.
 */
export async function sendMessage(sender: User, input: SendInput): Promise<ChatOut> {
  if (sender.bannedAt) throw forbidden('This account is suspended.');
  const body = stripText(input.body, MAX_MESSAGE_LEN).trim();
  if (!body) throw badRequest('Say something first.');

  // Access rules per room kind.
  let dmTo: { id: string; username: string } | null = null;
  if (input.room.startsWith('dm:')) {
    const [, a, b] = input.room.split(':');
    if (![a, b].includes(sender.id)) throw forbidden();
    const other = a === sender.id ? b! : a!;
    const [o] = await db.select({ id: schema.users.id, username: schema.users.username }).from(schema.users).where(eq(schema.users.id, other));
    if (!o) throw notFound('Player');
    dmTo = o;
    const rel = await relation(sender.id, other);
    if (rel.status !== 'accepted') throw forbidden(rel.status.startsWith('blocked') ? 'You can’t message this player.' : 'Connect with this player first to chat privately.');
  } else if (input.room.startsWith('clan:')) {
    const [m] = await db.select().from(schema.clanMembers).where(and(eq(schema.clanMembers.userId, sender.id), eq(schema.clanMembers.clanId, input.room.slice(5))));
    if (!m) throw forbidden('Only clan members can chat here.');
  } else if (!input.room.startsWith('nearby:')) {
    throw badRequest('Unknown chat room');
  }

  // Slow mode: 5 messages per 10 seconds per user, across all processes.
  const rlKey = key('chat', 'rl', sender.id);
  const n = await redis.incr(rlKey);
  if (n === 1) await redis.expire(rlKey, 10);
  if (n > 5) throw badRequest('Slow down a little: you can send 5 messages every 10 seconds.');

  const mod = heuristicModeration(body);
  if (mod.flagged && mod.score >= 0.9) {
    await db.insert(schema.moderationFlags).values({ targetType: 'chat', targetId: sender.id, source: 'ai', reason: `chat: ${mod.reason}`.slice(0, 500), score: mod.score });
    throw badRequest('That message can’t be sent. Please keep chat friendly.');
  }

  const [row] = await db
    .insert(schema.chatMessages)
    .values({ room: input.room, senderId: sender.id, senderName: sender.displayName, body, moderationStatus: mod.flagged ? 'flagged' : 'ok' })
    .returning();
  const out: ChatOut = {
    id: row!.id,
    room: row!.room,
    senderId: sender.id,
    senderName: sender.displayName,
    senderUsername: sender.username,
    toUsername: dmTo?.username ?? null,
    avatar: sender.avatar ?? null,
    body,
    createdAt: row!.createdAt.toISOString(),
    lat: input.lat,
    lng: input.lng,
  };
  if (!mod.flagged) {
    const receivers = await publish(CHAT_CHANNEL(), JSON.stringify(out));
    logger.debug({ channel: CHAT_CHANNEL(), room: out.room.split(':')[0], id: out.id, receivers }, 'live: published chat message');
    // Private messages also land in the recipient's notifications (one entry per sender while unread).
    if (dmTo) await notify(dmTo.id, 'dm', { from: sender.displayName, fromUsername: sender.username, preview: body.slice(0, 80) }, { collapseBy: 'fromUsername' });
  }
  return out;
}

export async function history(rooms: string[], opts: { before?: number; limit?: number; since?: Date } = {}): Promise<ChatOut[]> {
  const rows = await db
    .select()
    .from(schema.chatMessages)
    .where(
      and(
        inArray(schema.chatMessages.room, rooms),
        eq(schema.chatMessages.moderationStatus, 'ok'),
        opts.before ? lt(schema.chatMessages.id, opts.before) : undefined,
        opts.since ? gt(schema.chatMessages.createdAt, opts.since) : undefined,
      ),
    )
    .orderBy(desc(schema.chatMessages.id))
    .limit(opts.limit ?? 50);
  const senders = [...new Set(rows.map((r) => r.senderId).filter((x): x is string => !!x))];
  const users = senders.length ? await db.select({ id: schema.users.id, avatar: schema.users.avatar, username: schema.users.username }).from(schema.users).where(inArray(schema.users.id, senders)) : [];
  const am = new Map(users.map((u) => [u.id, u]));
  return rows.reverse().map((r) => {
    const u = r.senderId ? am.get(r.senderId) : undefined;
    return { id: r.id, room: r.room, senderId: r.senderId, senderName: r.senderName, senderUsername: u?.username ?? null, avatar: u?.avatar ?? null, body: r.body, createdAt: r.createdAt.toISOString() };
  });
}

/** The 3×3 block of nearby rooms around a point, for chat history. */
export function nearbyRooms(lat: number, lng: number): string[] {
  const [cy, cx] = [Math.floor(lat * 20), Math.floor(lng * 20)];
  const out: string[] = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) out.push(`nearby:${cy + dy}:${cx + dx}`);
  return out;
}

export async function reportMessage(reporter: User, messageId: number, reason: string) {
  const [msg] = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.id, messageId));
  if (!msg) throw notFound('Message');
  await db.insert(schema.moderationFlags).values({ targetType: 'chat', targetId: String(messageId), source: 'user', reason: `reported by ${reporter.username}: ${reason}`.slice(0, 500), score: 0.6 });
}

/** Nearby chat is kept 24 hours; private and clan chat are kept. */
export async function purgeOldNearby(): Promise<number> {
  const res = await db
    .delete(schema.chatMessages)
    .where(and(sql`${schema.chatMessages.room} like 'nearby:%'`, lt(schema.chatMessages.createdAt, new Date(Date.now() - 24 * 3600_000))))
    .returning({ id: schema.chatMessages.id });
  return res.length;
}

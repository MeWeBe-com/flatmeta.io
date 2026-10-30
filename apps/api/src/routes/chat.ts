import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { App } from '../app.js';
import { db, schema } from '../db/client.js';
import { requireUser } from '../lib/auth.js';
import { notFound } from '../lib/errors.js';
import { acceptConnection, blockUser, dmRoom, history, listConnections, nearbyRooms, relation, removeConnection, reportMessage, requestConnection, sendMessage, unblockUser, clanRoom } from '../services/chat.js';

export default async function chatRoutes(app: App) {
  const tags = ['social'];
  const fullUser = async (id: string) => (await db.select().from(schema.users).where(eq(schema.users.id, id)))[0]!;

  app.get('/v1/connections', { schema: { tags, summary: 'My connections, requests and blocked players' } }, async (req) => listConnections(await fullUser(requireUser(req).id)));

  app.post(
    '/v1/connections',
    { config: { rateLimit: { max: 20, timeWindow: '1 minute' } }, schema: { tags, summary: 'Ask a player to connect (accepts if they already asked you)', body: z.object({ username: z.string().min(3).max(20) }) } },
    async (req) => requestConnection(await fullUser(requireUser(req).id), req.body.username),
  );

  app.post('/v1/connections/:id/accept', { schema: { tags, summary: 'Accept a connection request', params: z.object({ id: z.uuid() }) } }, async (req) => acceptConnection(await fullUser(requireUser(req).id), req.params.id));

  app.delete('/v1/connections/:id', { schema: { tags, summary: 'Decline a request or remove a connection', params: z.object({ id: z.uuid() }) } }, async (req) => {
    await removeConnection(await fullUser(requireUser(req).id), req.params.id);
    return { ok: true };
  });

  app.post('/v1/users/:username/block', { schema: { tags, summary: 'Block a player', params: z.object({ username: z.string().max(20) }) } }, async (req) => {
    await blockUser(await fullUser(requireUser(req).id), req.params.username);
    return { ok: true };
  });

  app.delete('/v1/users/:username/block', { schema: { tags, summary: 'Unblock a player', params: z.object({ username: z.string().max(20) }) } }, async (req) => {
    await unblockUser(await fullUser(requireUser(req).id), req.params.username);
    return { ok: true };
  });

  app.get('/v1/users/:username/relation', { schema: { tags, summary: 'How I am connected to a player', params: z.object({ username: z.string().max(20) }) } }, async (req) => {
    const me = requireUser(req);
    const [other] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, req.params.username));
    if (!other) throw notFound('Player');
    return relation(me.id, other.id);
  });

  // ── Chat (history over REST; live delivery and sending are on the WebSocket, with REST send as a fallback) ──
  app.get(
    '/v1/chat/nearby',
    { schema: { tags, summary: 'Last day of chat near a point', querystring: z.object({ lat: z.coerce.number().min(-85).max(85), lng: z.coerce.number().min(-180).max(180), before: z.coerce.number().int().optional() }) } },
    async (req) => ({ messages: await history(nearbyRooms(req.query.lat, req.query.lng), { before: req.query.before, since: new Date(Date.now() - 24 * 3600_000) }) }),
  );

  app.get('/v1/chat/dm/:username', { schema: { tags, summary: 'Private chat history with a connection', params: z.object({ username: z.string().max(20) }), querystring: z.object({ before: z.coerce.number().int().optional() }) } }, async (req) => {
    const me = requireUser(req);
    const [other] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, req.params.username));
    if (!other) throw notFound('Player');
    const rel = await relation(me.id, other.id);
    if (rel.status !== 'accepted') return { messages: [], relation: rel.status };
    return { messages: await history([dmRoom(me.id, other.id)], { before: req.query.before }), relation: rel.status };
  });

  app.post(
    '/v1/chat/dm/:username',
    { schema: { tags, summary: 'Send a private message (REST fallback)', params: z.object({ username: z.string().max(20) }), body: z.object({ body: z.string().min(1).max(600) }) } },
    async (req) => {
      const me = await fullUser(requireUser(req).id);
      const [other] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.username, req.params.username));
      if (!other) throw notFound('Player');
      return { message: await sendMessage(me, { room: dmRoom(me.id, other.id), body: req.body.body }) };
    },
  );

  app.get('/v1/chat/clan', { schema: { tags, summary: 'My clan’s chat history', querystring: z.object({ before: z.coerce.number().int().optional() }) } }, async (req) => {
    const me = requireUser(req);
    const [m] = await db.select().from(schema.clanMembers).where(eq(schema.clanMembers.userId, me.id));
    if (!m) return { messages: [] };
    return { messages: await history([clanRoom(m.clanId)], { before: req.query.before }) };
  });

  app.get('/v1/chat/unread', { schema: { tags, summary: 'Pending connection requests' } }, async (req) => {
    const me = requireUser(req);
    const rows = await db.select({ id: schema.connections.id }).from(schema.connections).where(and(eq(schema.connections.addresseeId, me.id), eq(schema.connections.status, 'pending')));
    return { requests: rows.length };
  });

  app.post('/v1/chat/messages/:id/report', { schema: { tags, summary: 'Report a chat message', params: z.object({ id: z.coerce.number().int() }), body: z.object({ reason: z.string().min(2).max(200) }) } }, async (req) => {
    await reportMessage(await fullUser(requireUser(req).id), req.params.id, req.body.reason);
    return { ok: true };
  });
}

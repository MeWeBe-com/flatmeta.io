import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { db, pool, schema } from '../src/db/client.js';
import { closeRedis } from '../src/lib/redis.js';
import { clanRoom, history, sendMessage } from '../src/services/chat.js';
import type { App } from '../src/app.js';
import { getApp, login } from './helpers.js';

let app: App;
beforeAll(async () => {
  app = await getApp();
});
afterAll(async () => {
  await app.close();
  await pool.end();
  await closeRedis();
});
const json = (res: { body: string }) => JSON.parse(res.body);
const post = (url: string, headers: Record<string, string>, payload?: unknown) => app.inject({ method: 'POST', url, headers, payload: payload as object });
const uniq = () => Math.random().toString(36).slice(2, 7).toUpperCase();

async function levelled() {
  const u = await login();
  await db.update(schema.users).set({ xp: 600, level: 3 }).where(eq(schema.users.id, u.user.id));
  return u;
}

describe('clans', () => {
  it('needs level 2 to found, then founds, rejects duplicates, and records achievements', async () => {
    const rookie = await login();
    const tag = uniq().slice(0, 4);
    const early = await post('/v1/clans', rookie.headers, { name: `Rookies ${tag}`, tag });
    expect(early.statusCode).toBe(403);

    const leader = await levelled();
    const name = `Pathfinders ${uniq()}`;
    const res = await post('/v1/clans', leader.headers, { name, tag });
    expect(res.statusCode).toBe(200);
    const clan = json(res).clan;
    expect(clan.memberCount).toBe(1);
    const again = await post('/v1/clans', leader.headers, { name: `Another ${uniq()}`, tag: uniq().slice(0, 4) });
    expect(again.body).toContain('already in a clan'); // already in one
    expect(again.statusCode).toBe(409);
    const other = await levelled();
    expect((await post('/v1/clans', other.headers, { name: name.toLowerCase(), tag: uniq().slice(0, 4) })).statusCode).toBe(409); // name taken
    const got = await db.select().from(schema.userAchievements).where(eq(schema.userAchievements.userId, leader.user.id));
    expect(got.map((a) => a.key)).toContain('clan-founder');
  });

  it('runs the join-request, invite, roles, kick and leadership flows', async () => {
    const leader = await levelled();
    const clan = json(await post('/v1/clans', leader.headers, { name: `Flow ${uniq()}`, tag: uniq().slice(0, 4) })).clan;
    const a = await login();
    const b = await login();
    const c = await login();

    // a asks to join, only staff can answer
    const req = json(await post(`/v1/clans/${clan.slug}/join`, a.headers));
    expect((await post(`/v1/clan-requests/${req.id}/accept`, b.headers)).statusCode).toBe(403);
    expect((await post(`/v1/clan-requests/${req.id}/accept`, leader.headers)).statusCode).toBe(200);
    const detail = json(await app.inject({ url: `/v1/clans/${clan.slug}`, headers: leader.headers }));
    expect(detail.members).toHaveLength(2);
    expect(detail.myRole).toBe('leader');

    // b is invited, and only b can accept the invite
    expect((await post(`/v1/clans/${clan.slug}/invite`, leader.headers, { username: b.user.username })).statusCode).toBe(200);
    const mine = json(await app.inject({ url: '/v1/clans/mine', headers: b.headers }));
    expect(mine.invites).toHaveLength(1);
    expect((await post(`/v1/clan-requests/${mine.invites[0].id}/accept`, c.headers)).statusCode).toBe(403);
    expect((await post(`/v1/clan-requests/${mine.invites[0].id}/accept`, b.headers)).statusCode).toBe(200);
    expect(json(await app.inject({ url: '/v1/clans/mine', headers: b.headers })).clan.memberCount).toBe(3);

    // promote a to officer; an officer may kick a member but not the leader
    expect((await app.inject({ method: 'PUT', url: `/v1/clans/${clan.slug}/members/${a.user.username}/role`, headers: leader.headers, payload: { role: 'officer' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'PUT', url: `/v1/clans/${clan.slug}/members/${b.user.username}/role`, headers: a.headers, payload: { role: 'officer' } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/v1/clans/${clan.slug}/members/${leader.user.username}`, headers: a.headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'DELETE', url: `/v1/clans/${clan.slug}/members/${b.user.username}`, headers: a.headers })).statusCode).toBe(200);

    // the leader leaves: the officer takes over; the last member leaving disbands the clan
    expect((await post('/v1/clans/leave', leader.headers)).statusCode).toBe(200);
    const after = json(await app.inject({ url: `/v1/clans/${clan.slug}` }));
    expect(after.members.find((m: { role: string }) => m.role === 'leader').username).toBe(a.user.username);
    expect(json(await post('/v1/clans/leave', a.headers)).disbanded).toBe(true);
    expect((await app.inject({ url: `/v1/clans/${clan.slug}` })).statusCode).toBe(404);
  });

  it('ranks clans by member XP and keeps clan chat private to members', async () => {
    const leader = await levelled();
    const clan = json(await post('/v1/clans', leader.headers, { name: `Chatty ${uniq()}`, tag: uniq().slice(0, 4) })).clan;
    await db.update(schema.users).set({ xp: 123456 }).where(eq(schema.users.id, leader.user.id));
    const board = json(await app.inject({ url: '/v1/clans/leaderboard' })).clans;
    expect(board[0].slug).toBe(clan.slug);
    expect(board[0].xp).toBeGreaterThanOrEqual(123456);

    const [full] = await db.select().from(schema.users).where(eq(schema.users.id, leader.user.id));
    await sendMessage(full!, { room: clanRoom(clan.id), body: 'Clan HQ is open' });
    const msgs = json(await app.inject({ url: '/v1/chat/clan', headers: leader.headers })).messages;
    expect(msgs.map((m: { body: string }) => m.body)).toContain('Clan HQ is open');
    const stranger = await login();
    const [fs] = await db.select().from(schema.users).where(eq(schema.users.id, stranger.user.id));
    await expect(sendMessage(fs!, { room: clanRoom(clan.id), body: 'let me in' })).rejects.toThrow(/Only clan members/);
    expect(json(await app.inject({ url: '/v1/chat/clan', headers: stranger.headers })).messages).toEqual([]);
    expect((await history([clanRoom(clan.id)])).length).toBe(1);
  });
});

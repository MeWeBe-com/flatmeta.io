import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * scripts/server/cloudflare-zone.sh against a local stand-in for the Cloudflare API: the token only travels in the
 * Authorization header (never in the output), a dry run changes nothing, a real run changes only what is missing,
 * and a second run changes nothing.
 */
const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../scripts/server/cloudflare-zone.sh');
const TOKEN = 'cf_SECRET_token_value_123456';
let base = '';
let server: Server;
const state = { obfuscation: 'on', routing: false, txt: [] as { name: string; content: string }[], writes: [] as string[], auth: new Set<string>() };

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
      state.auth.add(String(req.headers.authorization));
      const url = new URL(req.url ?? '/', 'http://x');
      const send = (o: object) => res.end(JSON.stringify({ success: true, errors: [], ...o }));
      if (req.method !== 'GET') state.writes.push(`${req.method} ${url.pathname}`);
      if (url.pathname === '/zones') return send({ result: url.searchParams.get('name') === 'flatmeta.io' ? [{ id: 'z1' }] : [] });
      if (url.pathname === '/zones/z1/settings/email_obfuscation') {
        if (req.method === 'PATCH') state.obfuscation = JSON.parse(body).value;
        return send({ result: { value: state.obfuscation } });
      }
      if (url.pathname === '/zones/z1/email/routing') return send({ result: { enabled: state.routing } });
      if (url.pathname === '/zones/z1/email/routing/enable') {
        state.routing = true;
        state.txt.push({ name: 'flatmeta.io', content: 'v=spf1 include:_spf.mx.cloudflare.net ~all' });
        return send({ result: { enabled: true } });
      }
      if (url.pathname === '/zones/z1/dns_records') {
        if (req.method === 'POST') {
          state.txt.push(JSON.parse(body));
          return send({ result: {} });
        }
        return send({ result: state.txt.filter((t) => t.name === url.searchParams.get('name')) });
      }
      res.statusCode = 404;
      res.end('{}');
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

const run = (...args: string[]) =>
  new Promise<{ code: number | null; out: string }>((resolve) => {
    const p = spawn('bash', [SCRIPT, ...args], { env: { PATH: process.env.PATH, CLOUDFLARE_API_TOKEN: TOKEN, CF_API_BASE: base, NO_PROXY: '127.0.0.1', no_proxy: '127.0.0.1' } });
    let out = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    p.on('close', (code) => resolve({ code, out }));
  });

describe('cloudflare-zone.sh', () => {
  it('dry run: lists the changes, changes nothing, never prints the token', async () => {
    const r = await run('--dry-run');
    expect(r.code, r.out).toBe(0);
    expect(r.out).toMatch(/would: turn it off/);
    expect(r.out).toMatch(/would: turn Email Routing on/);
    expect(r.out).toMatch(/would: add TXT _dmarc\.flatmeta\.io "v=DMARC1; p=none; rua=mailto:dmarc@flatmeta\.io; fo=1"/);
    expect(state.writes).toEqual([]);
    expect(r.out).not.toContain(TOKEN);
    expect([...state.auth]).toEqual([`Bearer ${TOKEN}`]);
  });

  it('applies only what is missing; a second run changes nothing', async () => {
    const r = await run();
    expect(r.code, r.out).toBe(0);
    expect(r.out).toContain('ALL OK');
    expect(state.obfuscation).toBe('off');
    expect(state.routing).toBe(true);
    expect(state.txt.map((t) => t.name).sort()).toEqual(['_dmarc.flatmeta.io', 'flatmeta.io']);
    // SPF came with Email Routing, so the script did not add a second one.
    expect(state.txt.filter((t) => t.name === 'flatmeta.io')).toHaveLength(1);
    expect(r.out).not.toContain(TOKEN);
    const writes = state.writes.length;
    const again = await run();
    expect(again.code).toBe(0);
    expect(state.writes.length).toBe(writes);
    expect(again.out).toMatch(/OK +already off/);
  });

  it('stops with a clear message without a token or for an unknown zone', async () => {
    const noToken = await new Promise<string>((resolve) => {
      const p = spawn('bash', [SCRIPT], { env: { PATH: process.env.PATH } });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.on('close', () => resolve(out));
    });
    expect(noToken).toMatch(/CLOUDFLARE_API_TOKEN is not set/);
    const r = await run('--zone', 'example.org');
    expect(r.code).toBe(1);
    expect(r.out).toMatch(/zone example\.org not found/);
  });
});

import { lookup } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';

/**
 * Outbound fetches for company logos and contact pages (H1, H2). Every hop is checked: http(s) only, default ports,
 * the host must pass `allow` (the company's official domain, or the Wikimedia hosts), DNS answers in private,
 * loopback or link-local ranges are refused (the check runs inside the connection's own lookup, so the address that
 * was checked is the one connected to), at most 3 redirects (each checked again), a body limit and a timeout.
 */
export interface SafeResponse {
  status: number;
  url: string;
  contentType: string;
  body: Buffer;
}
export interface FetchOpts {
  allow: (host: string) => boolean;
  maxBytes?: number;
  timeoutMs?: number;
  accept?: string;
}
export type Hop = (url: URL, opts: Required<Pick<FetchOpts, 'maxBytes' | 'timeoutMs'>> & { accept: string }) => Promise<{ status: number; location?: string; contentType: string; body: Buffer }>;

export class BlockedUrlError extends Error {}

const V4_PRIVATE: [number, number][] = [
  [0x00000000, 8], // 0.0.0.0/8
  [0x0a000000, 8], // 10/8
  [0x64400000, 10], // 100.64/10 (CGNAT)
  [0x7f000000, 8], // 127/8
  [0xa9fe0000, 16], // 169.254/16 (link-local, cloud metadata)
  [0xac100000, 12], // 172.16/12
  [0xc0000000, 24], // 192.0.0/24
  [0xc0a80000, 16], // 192.168/16
  [0xc6120000, 15], // 198.18/15
  [0xe0000000, 3], // multicast + reserved
];

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const n = ip.split('.').reduce((a, b) => (a << 8) + Number(b), 0) >>> 0;
    return V4_PRIVATE.some(([base, bits]) => (n >>> (32 - bits)) === (base >>> (32 - bits)));
  }
  const v6 = ip.toLowerCase();
  if (v6 === '::' || v6 === '::1') return true;
  const mapped = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1]!);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v6);
}

/** A DNS lookup that refuses private answers: used by the real connection, so there is no check-then-connect gap. */
export const guardedLookup: typeof lookup = ((host: string, options: object, cb: (err: Error | null, address: string | { address: string; family: number }[], family?: number) => void) => {
  lookup(host, { ...options, all: true }, (err, addresses) => {
    if (err) return cb(err, '', 0);
    const list = addresses as unknown as { address: string; family: number }[];
    if (!list.length || list.some((a) => isPrivateAddress(a.address))) return cb(new BlockedUrlError(`${host} resolves to a private address`), '', 0);
    if ((options as { all?: boolean }).all) return cb(null, list);
    cb(null, list[0]!.address, list[0]!.family);
  });
}) as unknown as typeof lookup;

/** One real HTTP request (no redirects followed). */
export const realHop: Hop = (url, opts) =>
  new Promise((resolve, reject) => {
    const mod = url.protocol === 'https:' ? https : http;
    const req = mod.get(
      url,
      { lookup: guardedLookup, timeout: opts.timeoutMs, headers: { accept: opts.accept, 'user-agent': 'FlatMetaBot/1.0 (+https://www.flatmeta.io/about/facts)' } },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (c: Buffer) => {
          size += c.length;
          if (size > opts.maxBytes) {
            req.destroy(new BlockedUrlError(`larger than ${opts.maxBytes} bytes`));
            return;
          }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, location: res.headers.location, contentType: String(res.headers['content-type'] ?? ''), body: Buffer.concat(chunks) }));
        res.on('error', reject);
      },
    );
    req.on('timeout', () => req.destroy(new BlockedUrlError('timed out')));
    req.on('error', reject);
    setTimeout(() => req.destroy(new BlockedUrlError('timed out')), opts.timeoutMs * 2).unref();
  });

let hop: Hop = realHop;
/** Tests replace the network. */
export function setHop(h: Hop | null) {
  hop = h ?? realHop;
}

export function checkUrl(raw: string, allow: (host: string) => boolean): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError('not a URL');
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new BlockedUrlError(`scheme ${u.protocol} not allowed`);
  if (u.username || u.password) throw new BlockedUrlError('credentials in URL');
  if (u.port && u.port !== '80' && u.port !== '443') throw new BlockedUrlError(`port ${u.port} not allowed`);
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (isIP(host.replace(/^\[|\]$/g, ''))) throw new BlockedUrlError('IP addresses are not allowed');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) throw new BlockedUrlError('local host');
  if (!allow(host)) throw new BlockedUrlError(`${host} is not an allowed host`);
  return u;
}

export async function safeFetch(raw: string, o: FetchOpts): Promise<SafeResponse> {
  const maxBytes = o.maxBytes ?? 1_000_000;
  const timeoutMs = o.timeoutMs ?? 8000;
  let url = checkUrl(raw, o.allow);
  for (let i = 0; i <= 3; i++) {
    const r = await hop(url, { maxBytes, timeoutMs, accept: o.accept ?? '*/*' });
    if (r.body.length > maxBytes) throw new BlockedUrlError(`larger than ${maxBytes} bytes`);
    if (r.status >= 300 && r.status < 400 && r.location) {
      url = checkUrl(new URL(r.location, url).toString(), o.allow);
      continue;
    }
    return { status: r.status, url: url.toString(), contentType: r.contentType.toLowerCase(), body: r.body };
  }
  throw new BlockedUrlError('too many redirects');
}

/** The official domain and its subdomains (www., cdn., …): nothing else. */
export const onDomain = (domain: string) => (host: string) => host === domain || host.endsWith(`.${domain}`);

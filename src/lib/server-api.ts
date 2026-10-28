import 'server-only';
import { cookies } from 'next/headers';

const API = process.env.API_INTERNAL_URL ?? 'http://127.0.0.1:4000';

/** Server-side API call (forwards the visitor's session cookie). Returns null on 404. */
export async function serverApi<T>(path: string, opts: { revalidate?: number; auth?: boolean } = {}): Promise<T | null> {
  const headers: Record<string, string> = {};
  if (opts.auth !== false) {
    const jar = await cookies();
    const session = jar.get('fm_session');
    if (session) headers.cookie = `fm_session=${session.value}`;
  }
  const res = await fetch(`${API}/v1${path}`, {
    headers,
    ...(opts.auth === false && opts.revalidate !== undefined ? { next: { revalidate: opts.revalidate } } : { cache: 'no-store' as const }),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return (await res.json()) as T;
}

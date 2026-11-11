'use client';
/** Browser API client: same-origin /api/v1 (session cookie). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api/v1${path}`, {
    credentials: 'same-origin',
    ...rest,
    headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    // G13: a paid feature answers 402 with the plan that unlocks it; the upgrade dialog (overlays.tsx) picks it up.
    if (res.status === 402 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fm:paywall', { detail: { message: err.message, upsell: err.details?.upsell ?? 'plus' } }));
    }
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? `Request failed (${res.status})`, err.details);
  }
  return data as T;
}

export const post = <T = unknown>(path: string, json?: unknown) => api<T>(path, { method: 'POST', json: json ?? {} });
export const patch = <T = unknown>(path: string, json: unknown) => api<T>(path, { method: 'PATCH', json });
export const put = <T = unknown>(path: string, json: unknown) => api<T>(path, { method: 'PUT', json });
export const del = <T = unknown>(path: string) => api<T>(path, { method: 'DELETE' });

export async function upload<T = unknown>(path: string, file: File): Promise<T> {
  const fd = new FormData();
  fd.append('file', file);
  return api<T>(path, { method: 'POST', body: fd });
}

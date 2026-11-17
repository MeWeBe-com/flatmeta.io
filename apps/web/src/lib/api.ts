'use client';
/** Browser API client: same-origin /api/v1 (session cookie). */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

/**
 * R3g: the message people see when the server gives none (a proxy error page, a timeout, rate limits, offline).
 * Every case says what happened and what to do next; never "Request failed (502)" or a JSON parse error.
 */
export function friendlyError(status: number): string {
  if (status === 0) return 'You seem to be offline. Check your connection and try again.';
  if (status === 401) return 'Please sign in to continue.';
  if (status === 403) return 'You don’t have access to this.';
  if (status === 404) return 'We couldn’t find that. It may have been moved or removed.';
  if (status === 413) return 'That file is too big. Try one under 8 MB.';
  if (status === 429) return 'That was a lot of tries. Please wait a minute and try again.';
  if (status >= 500) return 'Something went wrong on our side. Please try again in a moment; if it keeps happening, email us.';
  return 'That didn’t work. Please check what you entered and try again.';
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      credentials: 'same-origin',
      ...rest,
      headers: { ...(json !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'network', friendlyError(0));
  }
  const text = await res.text();
  let data: { error?: { code?: string; message?: string; details?: { upsell?: string } } } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON (an HTML error page from a proxy): the status decides the message.
    if (!res.ok) throw new ApiError(res.status, 'error', friendlyError(res.status));
    throw new ApiError(res.status, 'bad_response', friendlyError(500));
  }
  if (!res.ok) {
    const err = data?.error ?? {};
    // G13: a paid feature answers 402 with the plan that unlocks it; the upgrade dialog (overlays.tsx) picks it up.
    if (res.status === 402 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('fm:paywall', { detail: { message: err.message, upsell: err.details?.upsell ?? 'plus' } }));
    }
    throw new ApiError(res.status, err.code ?? 'error', err.message ?? friendlyError(res.status), err.details);
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

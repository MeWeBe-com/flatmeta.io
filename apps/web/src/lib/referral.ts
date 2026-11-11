/**
 * G11: remembers a friend's invite code from flatmeta.io/?ref=CODE on this device for 30 days, so it can be sent
 * with the sign-up. Nothing is sent anywhere until the person signs up.
 */
const KEY = 'fm-ref';
const DAYS = 30;

export function captureReferral(search: string) {
  try {
    const code = new URLSearchParams(search).get('ref')?.trim().toLowerCase();
    if (code && /^[a-z0-9]{8}$/.test(code)) localStorage.setItem(KEY, JSON.stringify({ code, at: Date.now() }));
  } catch {
    /* private mode */
  }
}

export function storedReferral(): string | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const { code, at } = JSON.parse(raw) as { code: string; at: number };
    if (Date.now() - at > DAYS * 86400_000 || !/^[a-z0-9]{8}$/.test(code)) return null;
    return code;
  } catch {
    return null;
  }
}

export function clearReferral() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

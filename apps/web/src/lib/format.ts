export const usd = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);

export const compact = (n: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

export function timeAgo(iso: string | Date): string {
  const s = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export const flag = (code?: string | null) => (code ? code.toUpperCase().replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0))) : '🌊');

export const TIER_LABEL: Record<string, string> = { S: 'Icon', A: 'Prime', B: 'City', C: 'Land', O: 'Ocean' };
export const TIER_COLOR: Record<string, string> = { S: '#FFC94D', A: '#FF8FB1', B: '#8B7CFF', C: '#2DE2C4', O: '#3FA9F5' };

export const RARITY_COLOR: Record<string, string> = { common: '#9AA5C7', rare: '#3FA9F5', epic: '#8B7CFF', legendary: '#FFC94D' };

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
/** "Open now" from business hours in the plot's timezone. */
export function openNow(hours: Partial<Record<string, [string, string][]>> | undefined, timezone = 'UTC'): boolean | null {
  if (!hours || !Object.keys(hours).length) return null;
  try {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-GB', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
    const wd = parts.find((p) => p.type === 'weekday')?.value.toLowerCase().slice(0, 3) ?? DAYS[now.getDay()];
    const hhmm = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
    return (hours[wd!] ?? []).some(([a, b]) => hhmm >= a && hhmm < b);
  } catch {
    return null;
  }
}

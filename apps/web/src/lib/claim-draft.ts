/**
 * C1: the plot a guest drew, kept on this device while they sign in. The email code can take a minute and an app
 * switch (a phone may reload the tab), and Google sign-in leaves the page, so page memory alone loses the plot.
 * Saved when a guest presses "Claim"; the map reopens it on the next load; cleared once claimed or cancelled.
 * Nothing is sent anywhere: only the cell rectangle and the name typed so far.
 */
import type { Rect } from './grid';

const KEY = 'fm-claim-draft';
const HOURS = 24;

export interface ClaimDraft {
  rect: Rect;
  title?: string;
}

const isRect = (r: unknown): r is Rect =>
  !!r && typeof r === 'object' && (['minGx', 'minGy', 'maxGx', 'maxGy'] as const).every((k) => Number.isInteger((r as Record<string, unknown>)[k]));

export function saveClaimDraft(rect: Rect, title?: string) {
  try {
    const t = title?.trim().slice(0, 80);
    localStorage.setItem(KEY, JSON.stringify({ rect, ...(t ? { title: t } : {}), at: Date.now() }));
  } catch {
    /* private mode */
  }
}

export function loadClaimDraft(): ClaimDraft | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as { rect?: unknown; title?: unknown; at?: unknown };
    if (typeof d.at !== 'number' || Date.now() - d.at > HOURS * 3600_000 || !isRect(d.rect)) {
      localStorage.removeItem(KEY);
      return null;
    }
    return { rect: d.rect, ...(typeof d.title === 'string' && d.title ? { title: d.title } : {}) };
  } catch {
    return null;
  }
}

export function clearClaimDraft() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

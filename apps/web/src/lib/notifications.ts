/** One stored notification, as returned by GET /v1/me/notifications and pushed on the live socket. */
export interface AppNotification {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  readAt?: string | null;
  createdAt: string;
}

const s = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');
const person = (p: Record<string, unknown>, key: string) => {
  const v = p[key];
  if (v && typeof v === 'object') return s((v as { displayName?: string }).displayName) || `@${s((v as { username?: string }).username)}`;
  return s(v) || 'Someone';
};

/** Plain-language text for a notification (bell list, toasts and the dashboard). */
export function describeNotification(n: Pick<AppNotification, 'kind' | 'payload'>): string {
  const p = n.payload ?? {};
  switch (n.kind) {
    case 'follow': return `${person(p, 'from')} started following you`;
    case 'connection_request': return `${person(p, 'from')} wants to connect`;
    case 'connection_accepted': return `${person(p, 'by')} accepted your connection request`;
    case 'dm': {
      const count = typeof p.count === 'number' && p.count > 1 ? ` (${p.count})` : '';
      return `New message from ${person(p, 'from')}${count}${p.preview ? `: “${s(p.preview)}”` : ''}`;
    }
    case 'clan_invite': return `${person(p, 'by')} invited you to join ${s(p.clan)}`;
    case 'clan_request': return `${person(p, 'from')} asked to join ${s(p.clan)}`;
    case 'clan_member': return `${person(p, 'who')} joined ${s(p.clan)}`;
    case 'clan_accepted': return `You are now a member of ${s(p.clan)}`;
    case 'clan_declined': return `Your request to join ${s(p.clan)} was declined`;
    case 'clan_removed': return `You were removed from ${s(p.clan)}`;
    case 'clan_leader': return `You now lead ${s(p.clan)}`;
    case 'like': return `${person(p, 'from')} liked ${s(p.plotTitle)}`;
    case 'wave': return `${person(p, 'from')} waved at ${s(p.plotTitle)} 👋`;
    case 'guestbook': return `${person(p, 'from')} signed ${s(p.plotTitle)}: “${s(p.body)}”`;
    case 'achievement': return `Achievement unlocked: ${s(p.name)}`;
    case 'level_up': return `Level ${s(p.level)}! You are now a ${s(p.title)}`;
    case 'quest_completed': return `Quest complete: ${s(p.title)}. Claim your reward!`;
    case 'broken_links': return `Some links on ${s(p.plotTitle)} look broken`;
    case 'dormant_soon': return `${s(p.plotTitle)} has been quiet for a while. Give it a refresh?`;
    case 'landmark': return `${s(p.title)} is now your verified Landmark`;
    case 'sold': return `${s(p.title)} sold on the marketplace`;
    case 'purchased': return `${s(p.title)} is yours`;
    case 'payout': return 'Your payout is on its way';
    case 'payout_failed': return 'A payout failed. Check your payout details in Billing.';
    case 'refund': return s(p.reason) || 'You have been refunded';
    case 'payment_failed': return `Payment failed for your ${s(p.plan)} plan. Update your card in Billing.`;
    default: return n.kind.replace(/_/g, ' ');
  }
}

/** Where tapping a notification goes (null: it is handled in place, e.g. Accept). */
export function notificationHref(n: Pick<AppNotification, 'kind' | 'payload'>): string | null {
  const p = n.payload ?? {};
  switch (n.kind) {
    case 'follow':
    case 'connection_accepted':
      return s(p.fromUsername) ? `/u/${s(p.fromUsername)}` : null;
    case 'clan_invite':
      return '/clans';
    case 'clan_request':
    case 'clan_member':
    case 'clan_accepted':
    case 'clan_leader':
      return s(p.slug) ? `/clans/${s(p.slug)}` : '/clans';
    case 'sold':
    case 'payout':
    case 'payout_failed':
    case 'payment_failed':
      return '/dashboard/billing';
    case 'purchased':
    case 'landmark':
      return s(p.slug) ? `/p/${s(p.slug)}` : '/dashboard/plots';
    case 'level_up':
    case 'achievement':
    case 'quest_completed':
      return '/dashboard/progress';
    default:
      return null;
  }
}

/** Kinds that are already celebrated by their own toast (XP, achievements) and need no second one. */
export const QUIET_KINDS = new Set(['achievement', 'level_up', 'quest_completed']);

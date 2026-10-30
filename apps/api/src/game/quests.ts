import type { Action } from './actions.js';
import { dayKey, weekKey } from './dates.js';

export interface QuestDef {
  key: string;
  period: 'onboarding' | 'daily' | 'weekly';
  title: string;
  description: string;
  action: Action;
  target: number;
  xp: number;
  credits?: number;
  icon: string;
  order?: number;
}

export const QUESTS: QuestDef[] = [
  // Onboarding chain: "Your first day"
  { key: 'take-tour', period: 'onboarding', order: 1, title: 'Take the tour', description: 'Follow the quick tour of the map.', action: 'take_tour', target: 1, xp: 25, icon: 'compass' },
  { key: 'find-your-city', period: 'onboarding', order: 2, title: 'Find your city', description: 'Open the page of a city you love.', action: 'visit_region', target: 1, xp: 25, icon: 'building' },
  { key: 'claim-homestead', period: 'onboarding', order: 3, title: 'Plant your flag', description: 'Claim your free Homestead plot.', action: 'claim_plot', target: 1, xp: 100, icon: 'flag' },
  { key: 'design-with-ai', period: 'onboarding', order: 4, title: 'Design it with AI', description: 'Let the AI Designer dress up your plot.', action: 'design', target: 1, xp: 50, credits: 2, icon: 'sparkles' },
  { key: 'publish-plot', period: 'onboarding', order: 5, title: 'Go live', description: 'Publish your plot for the world to see.', action: 'publish', target: 1, xp: 50, icon: 'rocket' },
  { key: 'share-plot', period: 'onboarding', order: 6, title: 'Tell a friend', description: 'Share your plot on any app.', action: 'share', target: 1, xp: 50, icon: 'share' },
  { key: 'wave-neighbour', period: 'onboarding', order: 7, title: 'Say hello', description: 'Wave at a neighbour or any plot you like.', action: 'wave', target: 1, xp: 50, icon: 'hand' },

  // Daily pool (3 per day)
  { key: 'd-visit-5', period: 'daily', title: 'Sightseer', description: 'Visit 5 plots.', action: 'visit_plot', target: 5, xp: 30, icon: 'eye' },
  { key: 'd-like-3', period: 'daily', title: 'Spread the love', description: 'Like 3 plots.', action: 'like', target: 3, xp: 30, icon: 'heart' },
  { key: 'd-wave-2', period: 'daily', title: 'Friendly neighbour', description: 'Wave at 2 plots.', action: 'wave', target: 2, xp: 30, icon: 'hand' },
  { key: 'd-guestbook-1', period: 'daily', title: 'Leave a note', description: 'Sign a guestbook.', action: 'guestbook', target: 1, xp: 35, icon: 'pen' },
  { key: 'd-country-1', period: 'daily', title: 'Passport stamp', description: 'Visit a country you have not explored yet.', action: 'visit_country', target: 1, xp: 40, icon: 'globe' },
  { key: 'd-share-1', period: 'daily', title: 'Town crier', description: 'Share any plot.', action: 'share', target: 1, xp: 30, icon: 'share' },
  { key: 'd-city-2', period: 'daily', title: 'City hopper', description: 'Open 2 city pages.', action: 'visit_region', target: 2, xp: 30, icon: 'building' },
  { key: 'd-checkin', period: 'daily', title: 'Daily check-in', description: 'Check in today to grow your streak.', action: 'checkin', target: 1, xp: 25, icon: 'calendar' },
  { key: 'd-design-1', period: 'daily', title: 'Fresh coat', description: 'Generate a design with the AI Designer.', action: 'design', target: 1, xp: 35, icon: 'sparkles' },
  { key: 'd-edit-1', period: 'daily', title: 'Tidy up', description: 'Update one of your plots.', action: 'edit_plot', target: 1, xp: 25, icon: 'brush' },
  { key: 'd-follow-1', period: 'daily', title: 'Make a friend', description: 'Follow another explorer.', action: 'follow', target: 1, xp: 25, icon: 'user-plus' },
  { key: 'd-showcase-3', period: 'daily', title: 'Window shopping', description: 'Visit 3 showcase plots.', action: 'visit_showcase', target: 3, xp: 30, icon: 'star' },

  // Weekly pool (3 per week)
  { key: 'w-visit-30', period: 'weekly', title: 'Grand tour', description: 'Visit 30 plots this week.', action: 'visit_plot', target: 30, xp: 150, icon: 'map' },
  { key: 'w-like-20', period: 'weekly', title: 'Patron of the arts', description: 'Like 20 plots this week.', action: 'like', target: 20, xp: 120, icon: 'heart' },
  { key: 'w-guestbook-5', period: 'weekly', title: 'Pen pal', description: 'Sign 5 guestbooks this week.', action: 'guestbook', target: 5, xp: 150, icon: 'pen' },
  { key: 'w-countries-3', period: 'weekly', title: 'Globetrotter week', description: 'Visit 3 new countries this week.', action: 'visit_country', target: 3, xp: 200, credits: 2, icon: 'globe' },
  { key: 'w-claim-1', period: 'weekly', title: 'Expansionist', description: 'Claim or buy a new plot this week.', action: 'claim_plot', target: 1, xp: 250, icon: 'flag' },
  { key: 'w-wave-5', period: 'weekly', title: 'Block party', description: 'Wave at 5 plots this week.', action: 'wave', target: 5, xp: 120, icon: 'hand' },
  { key: 'w-share-3', period: 'weekly', title: 'Influencer', description: 'Share 3 times this week.', action: 'share', target: 3, xp: 150, icon: 'share' },
  { key: 'w-quests-10', period: 'weekly', title: 'Quest master', description: 'Complete 10 daily quests this week.', action: 'quest_complete', target: 10, xp: 250, credits: 3, icon: 'trophy' },
];

export const questByKey = new Map(QUESTS.map((q) => [q.key, q]));

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function pick<T>(pool: T[], n: number, seed: string): T[] {
  return [...pool].sort((a, b) => hash(seed + JSON.stringify(a)) - hash(seed + JSON.stringify(b))).slice(0, n);
}

/** The quests a user has right now: onboarding + 3 daily + 3 weekly, with their period keys. */
export function currentQuests(userId: string, now = new Date()): { def: QuestDef; periodKey: string }[] {
  const day = dayKey(now);
  const week = weekKey(now);
  const daily = pick(QUESTS.filter((q) => q.period === 'daily'), 3, `${userId}:${day}`);
  const weekly = pick(QUESTS.filter((q) => q.period === 'weekly'), 3, `${userId}:${week}`);
  return [
    ...QUESTS.filter((q) => q.period === 'onboarding').map((def) => ({ def, periodKey: 'onboarding' })),
    ...daily.map((def) => ({ def, periodKey: day })),
    ...weekly.map((def) => ({ def, periodKey: week })),
  ];
}

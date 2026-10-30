import type { Action } from './actions.js';

export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type Stat =
  | 'plots_owned'
  | 'cells_owned'
  | 'designs'
  | 'published'
  | 'countries_visited'
  | 'waves_sent'
  | 'guestbook_received'
  | 'likes_received'
  | 'following'
  | 'plots_visited'
  | 'likes_given'
  | 'guestbook_posts'
  | 'shares'
  | 'quests_completed'
  | 'level'
  | 'streak';

export interface AchievementDef {
  key: string;
  name: string;
  description: string;
  icon: string;
  rarity: Rarity;
  xp: number;
  /** Threshold achievements: unlocked when `stat >= threshold`, checked after these actions. */
  stat?: Stat;
  threshold?: number;
  triggers?: Action[];
  /** Special achievements are unlocked directly by the code that knows the condition. */
  special?: true;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first-flag', name: 'First Flag', description: 'Claim your first plot.', icon: 'flag', rarity: 'common', xp: 50, stat: 'plots_owned', threshold: 1, triggers: ['claim_plot'] },
  { key: 'homesteader', name: 'Homesteader', description: 'Claim your free Homestead.', icon: 'home', rarity: 'common', xp: 25, special: true },
  { key: 'landlord', name: 'Landlord', description: 'Own 10 cells of land.', icon: 'grid', rarity: 'rare', xp: 100, stat: 'cells_owned', threshold: 10, triggers: ['claim_plot'] },
  { key: 'baron', name: 'Baron', description: 'Own 50 cells of land.', icon: 'castle', rarity: 'epic', xp: 250, stat: 'cells_owned', threshold: 50, triggers: ['claim_plot'] },
  { key: 'magnate', name: 'Magnate', description: 'Own 200 cells of land.', icon: 'crown', rarity: 'legendary', xp: 500, stat: 'cells_owned', threshold: 200, triggers: ['claim_plot'] },
  { key: 'designer', name: 'Designer', description: 'Create your first AI design.', icon: 'sparkles', rarity: 'common', xp: 50, stat: 'designs', threshold: 1, triggers: ['design'] },
  { key: 'art-director', name: 'Art Director', description: 'Create 10 AI designs.', icon: 'palette', rarity: 'rare', xp: 100, stat: 'designs', threshold: 10, triggers: ['design'] },
  { key: 'publisher', name: 'Publisher', description: 'Publish a plot.', icon: 'rocket', rarity: 'common', xp: 30, stat: 'published', threshold: 1, triggers: ['publish'] },
  { key: 'globetrotter', name: 'Globetrotter', description: 'Visit 10 countries.', icon: 'globe', rarity: 'rare', xp: 100, stat: 'countries_visited', threshold: 10, triggers: ['visit_country'] },
  { key: 'world-tourist', name: 'World Tourist', description: 'Visit 30 countries.', icon: 'plane', rarity: 'epic', xp: 300, stat: 'countries_visited', threshold: 30, triggers: ['visit_country'] },
  { key: 'neighbourly', name: 'Neighbourly', description: 'Wave 5 times.', icon: 'hand', rarity: 'common', xp: 30, stat: 'waves_sent', threshold: 5, triggers: ['wave'] },
  { key: 'guest-of-honour', name: 'Guest of Honour', description: 'Receive 10 guestbook notes.', icon: 'book', rarity: 'rare', xp: 100, stat: 'guestbook_received', threshold: 10, triggers: ['receive_guestbook'] },
  { key: 'loved', name: 'Loved', description: 'Receive 10 likes.', icon: 'heart', rarity: 'common', xp: 50, stat: 'likes_received', threshold: 10, triggers: ['receive_like'] },
  { key: 'beloved', name: 'Beloved', description: 'Receive 100 likes.', icon: 'hearts', rarity: 'epic', xp: 300, stat: 'likes_received', threshold: 100, triggers: ['receive_like'] },
  { key: 'trendsetter', name: 'Trendsetter', description: 'Have a plot in the top 10 of its country.', icon: 'trending', rarity: 'epic', xp: 250, special: true },
  { key: 'streak-3', name: 'On a Roll', description: 'Check in 3 days in a row.', icon: 'flame', rarity: 'common', xp: 30, stat: 'streak', threshold: 3, triggers: ['checkin'] },
  { key: 'streak-7', name: 'Week Warrior', description: 'Check in 7 days in a row.', icon: 'flame', rarity: 'rare', xp: 100, stat: 'streak', threshold: 7, triggers: ['checkin'] },
  { key: 'streak-30', name: 'Unstoppable', description: 'Check in 30 days in a row.', icon: 'flame', rarity: 'legendary', xp: 500, stat: 'streak', threshold: 30, triggers: ['checkin'] },
  { key: 'night-owl', name: 'Night Owl', description: 'Do something on FlatMeta between midnight and 4am (UTC).', icon: 'moon', rarity: 'rare', xp: 40, special: true },
  { key: 'early-settler', name: 'Early Settler', description: 'Be the first to claim land in a country.', icon: 'compass', rarity: 'legendary', xp: 300, special: true },
  { key: 'founder', name: 'Founder', description: 'One of the first 10,000 explorers.', icon: 'gem', rarity: 'epic', xp: 100, special: true },
  { key: 'business-verified', name: 'Open for Business', description: 'Verify a business organisation.', icon: 'store', rarity: 'rare', xp: 100, special: true },
  { key: 'brand-verified', name: 'Landmark', description: 'Claim a showcase landmark for your organisation.', icon: 'landmark', rarity: 'legendary', xp: 500, special: true },
  { key: 'spotlight', name: 'In the Spotlight', description: 'Put a plot in the Spotlight.', icon: 'sun', rarity: 'rare', xp: 50, special: true },
  { key: 'social', name: 'Social Butterfly', description: 'Follow 5 explorers.', icon: 'users', rarity: 'common', xp: 30, stat: 'following', threshold: 5, triggers: ['follow'] },
  { key: 'explorer', name: 'Explorer', description: 'Visit 50 plots.', icon: 'binoculars', rarity: 'rare', xp: 100, stat: 'plots_visited', threshold: 50, triggers: ['visit_plot'] },
  { key: 'collector', name: 'Collector', description: 'Like 50 plots.', icon: 'gem', rarity: 'rare', xp: 100, stat: 'likes_given', threshold: 50, triggers: ['like'] },
  { key: 'curator', name: 'Curator', description: 'Sign 5 guestbooks.', icon: 'pen', rarity: 'common', xp: 40, stat: 'guestbook_posts', threshold: 5, triggers: ['guestbook'] },
  { key: 'shareable', name: 'Shareable', description: 'Share 5 times.', icon: 'share', rarity: 'common', xp: 40, stat: 'shares', threshold: 5, triggers: ['share'] },
  { key: 'quest-master', name: 'Quest Master', description: 'Complete 20 quests.', icon: 'trophy', rarity: 'epic', xp: 200, stat: 'quests_completed', threshold: 20, triggers: ['quest_complete'] },
  { key: 'level-10', name: 'Pathfinder', description: 'Reach level 10.', icon: 'star', rarity: 'rare', xp: 0, stat: 'level', threshold: 10 },
  { key: 'level-25', name: 'Cartographer Supreme', description: 'Reach level 25.', icon: 'stars', rarity: 'legendary', xp: 0, stat: 'level', threshold: 25 },
];

export const achievementByKey = new Map(ACHIEVEMENTS.map((a) => [a.key, a]));

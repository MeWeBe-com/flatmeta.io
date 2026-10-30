/**
 * Every game-relevant action. XP amounts and daily caps follow the brief (§8).
 * `self` actions (on your own plot) never earn XP; the routes check that.
 */
export type Action =
  | 'claim_plot'
  | 'design'
  | 'apply_design'
  | 'publish'
  | 'edit_plot'
  | 'share'
  | 'visit_country'
  | 'visit_region'
  | 'visit_plot'
  | 'visit_showcase'
  | 'like'
  | 'guestbook'
  | 'wave'
  | 'follow'
  | 'receive_like'
  | 'receive_guestbook'
  | 'receive_wave'
  | 'checkin'
  | 'take_tour'
  | 'quest_complete'
  | 'upgrade'
  | 'org_verified';

export const XP_TABLE: Partial<Record<Action, { xp: number; dailyCap?: number }>> = {
  claim_plot: { xp: 100 },
  apply_design: { xp: 20, dailyCap: 5 },
  publish: { xp: 30, dailyCap: 5 },
  share: { xp: 10, dailyCap: 3 },
  visit_country: { xp: 15 },
  visit_region: { xp: 5, dailyCap: 10 },
  visit_plot: { xp: 2, dailyCap: 40 },
  like: { xp: 2, dailyCap: 20 },
  guestbook: { xp: 5, dailyCap: 10 },
  wave: { xp: 3, dailyCap: 10 },
  follow: { xp: 2, dailyCap: 10 },
  receive_like: { xp: 3, dailyCap: 100 },
  receive_guestbook: { xp: 5, dailyCap: 50 },
  receive_wave: { xp: 1, dailyCap: 50 },
  take_tour: { xp: 20 },
  upgrade: { xp: 25 },
};

/** First AI design ever is worth +50 (awarded once via the achievement-like ref "first"). */
export const FIRST_DESIGN_XP = 50;

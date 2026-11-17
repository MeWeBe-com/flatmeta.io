/**
 * R3d: customer stories and logos, shown on /business and /pricing ONLY with written permission.
 *
 * To add one (owner): use docs/golive/case-study-template.md, send the customer the permission email in it, keep
 * their written "yes" (email or signed form), then add an entry below with `permission` filled in. Every number in
 * `result` must be one the customer confirmed or that comes from their FlatMeta analytics.
 * An entry without `permission.grantedBy` and `permission.date` is never shown (see publishableStories).
 */
export interface CustomerStory {
  slug: string;
  company: string;
  /** The customer's published FlatMeta plot. */
  plotSlug: string;
  person: string;
  role: string;
  quote: string;
  /** Optional, confirmed by the customer: e.g. "38 bookings from the map in the first month". */
  result?: string;
  /** Logo URL, only if the permission covers the logo. */
  logoUrl?: string;
  permission: { grantedBy: string; date: string; covers: ('quote' | 'name' | 'logo' | 'result')[] } | null;
}

export const CUSTOMER_STORIES: CustomerStory[] = [];

/** Only stories whose permission is recorded and covers the quote and the name. Logos only when the permission says so. */
export function publishableStories(list: CustomerStory[]): CustomerStory[] {
  return list
    .filter((s) => s.permission && s.permission.grantedBy.trim() && /^\d{4}-\d{2}-\d{2}$/.test(s.permission.date) && s.permission.covers.includes('quote') && s.permission.covers.includes('name'))
    .map((s) => ({ ...s, logoUrl: s.permission!.covers.includes('logo') ? s.logoUrl : undefined, result: s.permission!.covers.includes('result') ? s.result : undefined }));
}

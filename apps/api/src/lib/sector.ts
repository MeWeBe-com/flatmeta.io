/**
 * M7: one spelling per sector. Sectors come from the showcase generator ("tech", "food"), the company-land job
 * ("Technology", "Food & drink"), admin edits and older rows; they are stored and shown through this, so /brands never
 * shows "tech" next to "Technology" or "FINANCE".
 */
const LABELS: Record<string, string> = {
  tech: 'Technology',
  technology: 'Technology',
  software: 'Technology',
  food: 'Food & drink',
  drink: 'Food & drink',
  'food & drink': 'Food & drink',
  'food and drink': 'Food & drink',
  auto: 'Automotive',
  automotive: 'Automotive',
  travel: 'Travel',
  tourism: 'Travel',
  finance: 'Finance',
  retail: 'Retail',
  fashion: 'Retail',
  media: 'Media',
  entertainment: 'Media',
  culture: 'Culture',
  education: 'Education',
  sport: 'Sport',
  sports: 'Sport',
  nonprofit: 'Nonprofit',
  'non-profit': 'Nonprofit',
  energy: 'Energy',
  health: 'Health',
  healthcare: 'Health',
  logistics: 'Logistics',
  industry: 'Industry',
  business: 'Business',
};

/** The display label for a stored sector: a known sector's one spelling, else sentence case ("REAL estate" → "Real estate"). */
export function sectorLabel(raw: string | null | undefined): string | null {
  const s = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  const known = LABELS[s.toLowerCase()];
  if (known) return known;
  const lower = s.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

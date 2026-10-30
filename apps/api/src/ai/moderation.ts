import { z } from 'zod';
import { config, moderationProvider } from '../config.js';
import { logger } from '../lib/logger.js';
import { generateJson } from './text/index.js';

export interface ModerationResult {
  flagged: boolean;
  /** 0..1 — ≥ 0.9 hides content, 0.5–0.9 queues for review. */
  score: number;
  categories: string[];
  reason: string;
  provider: string;
}

export const HIDE_THRESHOLD = 0.9;
export const REVIEW_THRESHOLD = 0.5;

const BASE_BLOCKLIST = [
  'porn', 'xxx', 'nude', 'nudes', 'onlyfans', 'escort', 'camgirl', 'sex cam',
  'crypto giveaway', 'double your bitcoin', 'bitcoin doubler', 'free money', 'wire transfer fee', 'seed phrase',
  'kill yourself', 'kys', 'heil hitler', 'white power', 'buy followers', 'casino bonus', 'viagra',
];
const SUSPICIOUS_TLDS = /\.(zip|mov|xyz|top|click|loan|work|gq|tk|ml|cf)(\/|$)/i;

export function heuristicModeration(text: string): ModerationResult {
  const t = text.toLowerCase();
  const extra = config.MODERATION_BLOCKLIST.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const hits = [...BASE_BLOCKLIST, ...extra].filter((w) => new RegExp(`(^|\\W)${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\W|$)`, 'i').test(t));
  const links = (t.match(/https?:\/\//g) ?? []).length;
  const letters = text.replace(/[^A-Za-z]/g, '');
  const caps = letters.length > 20 ? letters.replace(/[^A-Z]/g, '').length / letters.length : 0;
  const categories: string[] = [];
  let score = 0;
  if (hits.length) {
    score = Math.max(score, 0.95);
    categories.push('blocklist');
  }
  if (links > 6) {
    score = Math.max(score, 0.6);
    categories.push('spam');
  }
  if (SUSPICIOUS_TLDS.test(t)) {
    score = Math.max(score, 0.55);
    categories.push('suspicious-link');
  }
  if (caps > 0.8) {
    score = Math.max(score, 0.5);
    categories.push('shouting');
  }
  return { flagged: score >= REVIEW_THRESHOLD, score, categories, reason: hits.length ? `Contains: ${hits.slice(0, 3).join(', ')}` : categories.join(', '), provider: 'heuristic' };
}

async function openaiModeration(text: string, imageUrl?: string): Promise<ModerationResult> {
  const { default: OpenAI } = await import('openai');
  const client = new OpenAI({ apiKey: config.OPENAI_API_KEY });
  const input: ({ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } })[] = [];
  if (text) input.push({ type: 'text', text });
  if (imageUrl) input.push({ type: 'image_url', image_url: { url: imageUrl } });
  const res = await client.moderations.create({ model: 'omni-moderation-latest', input });
  const r = res.results[0];
  const scores = (r?.category_scores ?? {}) as unknown as Record<string, number>;
  const max = Math.max(0, ...Object.values(scores));
  const categories = Object.entries((r?.categories ?? {}) as unknown as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k);
  return { flagged: !!r?.flagged || max >= REVIEW_THRESHOLD, score: r?.flagged ? Math.max(max, HIDE_THRESHOLD) : max, categories, reason: categories.join(', '), provider: 'openai' };
}

const ClaudeVerdict = z.object({
  flagged: z.boolean(),
  score: z.number().min(0).max(1),
  categories: z.array(z.string()),
  reason: z.string(),
});

async function claudeModeration(text: string): Promise<ModerationResult | null> {
  const v = await generateJson({
    schema: ClaudeVerdict,
    fast: true,
    maxTokens: 1000,
    system:
      'You are the content moderator for FlatMeta, a public, family-friendly world map where people publish small pages about places, businesses and themselves. Classify user-submitted text. Flag: sexual content, hate or harassment, threats or self-harm encouragement, violent extremism, illegal goods, scams/phishing, spam, doxxing, impersonation of a real organisation (claiming to be official), and malicious links. Normal business promotion, opinions, mild language and real brand names used descriptively are fine. score: probability the text breaks the rules (0..1).',
    prompt: `Text to review:\n"""\n${text.slice(0, 6000)}\n"""`,
  });
  return v ? { ...v, flagged: v.flagged || v.score >= REVIEW_THRESHOLD, provider: 'anthropic' } : null;
}

/** Moderates text (and optionally an image by absolute URL). Never throws: falls back to heuristics. */
export async function moderate(text: string, imageUrl?: string): Promise<ModerationResult> {
  const clean = text.trim();
  const heuristic = heuristicModeration(clean);
  if (heuristic.score >= HIDE_THRESHOLD) return heuristic;
  const provider = moderationProvider();
  try {
    if (provider === 'openai' && config.OPENAI_API_KEY) {
      const r = await openaiModeration(clean, imageUrl && /^https?:/.test(imageUrl) ? imageUrl : undefined);
      return r.score >= heuristic.score ? r : heuristic;
    }
    if (provider === 'anthropic' && config.ANTHROPIC_API_KEY && clean) {
      const r = await claudeModeration(clean);
      if (r) return r.score >= heuristic.score ? r : heuristic;
    }
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'Moderation provider failed; using heuristics');
  }
  return heuristic;
}

import { z } from 'zod';

const bool = z
  .string()
  .optional()
  .transform((v) => v === 'true' || v === '1');
const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() !== '' ? v.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  APP_NAME: z.string().default('FlatMeta'),
  HOST: z.string().default('127.0.0.1'),
  // 3000, 3010 and 3100 are taken on the shared server, so every default stays clear of them.
  PORT: z.coerce.number().default(3201),
  MCP_PORT: z.coerce.number().optional(),
  WORKER_HEALTH_PORT: z.coerce.number().default(3203),
  LOG_LEVEL: z.string().default('info'),
  TRUST_PROXY: bool,

  // Public origin of the site. Every absolute URL, redirect, email link and share card is built from it.
  APP_URL: z.string().default('http://localhost:3200'),
  // Public base of the API (docs, MCP, webhooks). Defaults to APP_URL + /api (the proxy strips the prefix).
  API_URL: z.string().default(''),
  PRODUCTION_DOMAIN: z.string().default('flatmeta.io'),
  STAGING_DOMAIN: z.string().default('staging.flatmeta.io'),

  DATABASE_URL: z.string().default('postgres://flatmeta:flatmeta@localhost:5432/flatmeta'),
  DATABASE_URL_TEST: z.string().default('postgres://flatmeta:flatmeta@localhost:5432/flatmeta_test'),
  REDIS_URL: z.string().default('redis://localhost:6379/0'),
  REDIS_PREFIX: z.string().default('fm'),

  SESSION_SECRET: z.string().default('dev-only-insecure-secret'),
  COOKIE_DOMAIN: optional,
  COOKIE_SECURE: bool,
  SEED_ADMIN_EMAIL: z.string().default('admin@flatmeta.io'),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,

  SMTP_HOST: optional,
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  SMTP_SECURE: bool,
  MAIL_FROM: z.string().default('FlatMeta <hello@flatmeta.io>'),
  MAIL_REPLY_TO: optional,
  // Resend (https://resend.com) is the primary email provider; SMTP is the fallback; neither = log only.
  RESEND_API_KEY: optional,
  RESEND_WEBHOOK_SECRET: optional, // whsec_… from the Resend webhook; enables /v1/email/webhooks/resend
  EMAIL_QUEUE: z.enum(['auto', 'true', 'false']).default('auto'), // auto = queue through the worker whenever a real provider is set
  EMAIL_RATE_PER_SECOND: z.coerce.number().int().min(1).max(100).default(2), // Resend's default API limit is 2 requests/s
  ADMIN_EMAILS: z.string().default(''), // extra comma-separated addresses for admin notifications (admins in the DB are always included)

  STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
  MEDIA_DIR: z.string().default('./storage/media'),
  MEDIA_PUBLIC_URL: z.string().default('/media'),
  S3_ENDPOINT: optional,
  S3_REGION: z.string().default('auto'),
  S3_BUCKET: optional,
  S3_ACCESS_KEY_ID: optional,
  S3_SECRET_ACCESS_KEY: optional,
  S3_PUBLIC_URL: optional,

  STRIPE_SECRET_KEY: optional,
  STRIPE_WEBHOOK_SECRET: optional,
  STRIPE_PRICE_PLUS_MONTH: optional,
  STRIPE_PRICE_PLUS_YEAR: optional,
  STRIPE_PRICE_BUSINESS_MONTH: optional,
  STRIPE_PRICE_BUSINESS_YEAR: optional,
  STRIPE_PRICE_BRAND_MONTH: optional,
  STRIPE_PRICE_BRAND_YEAR: optional,
  STRIPE_AUTOMATIC_TAX: bool,
  CURRENCY: z.string().default('usd'),
  // Show sign-in codes on screen (and in the log) instead of emailing them. auto = only when no SMTP is set
  // and APP_ENV is not production. Never allowed in production.
  DEV_CODE_ECHO: z.enum(['auto', 'true', 'false']).default('auto'),
  PAYMENTS_MOCK: z
    .string()
    .optional()
    .transform((v) => v !== 'false' && v !== '0'),

  AI_TEXT_PROVIDER: z.enum(['anthropic', 'openai', 'gemini', 'heuristic', '']).optional(),
  ANTHROPIC_API_KEY: optional,
  ANTHROPIC_MODEL: z.string().default('claude-opus-5-5'),
  ANTHROPIC_MODEL_FAST: z.string().default('claude-opus-5-5'),
  OPENAI_API_KEY: optional,
  OPENAI_MODEL: z.string().default('gpt-5'),
  OPENAI_IMAGE_MODEL: z.string().default('gpt-image-1'),
  GEMINI_API_KEY: optional,
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  GEMINI_IMAGE_MODEL: z.string().default('imagen-4.0-generate-001'),
  AI_IMAGE_PROVIDER: z.enum(['procedural', 'openai', 'gemini', 'external']).default('procedural'),
  EXTERNAL_IMAGE_DIR: z.string().default('./storage/external'),
  AI_MODERATION_PROVIDER: z.enum(['openai', 'anthropic', 'heuristic', '']).optional(),
  MODERATION_BLOCKLIST: z.string().default(''),

  GEOCODER_URL: z.string().default('https://photon.komoot.io/api'),
  GEOCODER_USER_AGENT: z.string().default('FlatMeta/2.0 (hello@flatmeta.io)'),

  // Marketplace (Phase 1 §12.4)
  MARKETPLACE_FEE_BPS: z.coerce.number().int().min(0).max(5000).default(1000), // 10%
  MARKETPLACE_MIN_HOLD_DAYS: z.coerce.number().min(0).default(7), // a plot must be held this long before resale
  MARKETPLACE_PRICE_CAP_MULT: z.coerce.number().min(1).default(50), // x tier price, during the cap window
  MARKETPLACE_PRICE_CAP_DAYS: z.coerce.number().min(0).default(30),
  MARKETPLACE_MIN_PRICE_CENTS: z.coerce.number().int().min(50).default(200),
  PAYOUT_MIN_CENTS: z.coerce.number().int().min(0).default(500),

  RATE_LIMIT_PER_MINUTE: z.coerce.number().default(300),
});

export type Config = z.infer<typeof schema>;

function load(): Config {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment:\n${issues}`);
  }
  const c = parsed.data;
  c.APP_URL = c.APP_URL.replace(/\/+$/, '');
  c.API_URL = (c.API_URL || `${c.APP_URL}/api`).replace(/\/+$/, '');
  if (c.NODE_ENV === 'test') c.DATABASE_URL = c.DATABASE_URL_TEST;
  if (c.NODE_ENV === 'production' && c.APP_ENV === 'development') {
    // A production build that doesn't say what it is gets the safe answer: production rules (no fake checkout,
    // no on-screen codes). Staging must say APP_ENV=staging to get its test conveniences.
    console.warn('[config] NODE_ENV=production without APP_ENV: treating as APP_ENV=production. Set APP_ENV=staging on staging.');
    c.APP_ENV = 'production';
  }
  if (c.APP_ENV === 'production') {
    if (c.DEV_CODE_ECHO === 'true') throw new Error('DEV_CODE_ECHO=true is not allowed when APP_ENV=production');
    c.PAYMENTS_MOCK = false; // real money only
  }
  if (c.NODE_ENV === 'production') {
    if (/\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(c.APP_URL) || /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(c.API_URL)) {
      throw new Error('APP_URL / API_URL must be the public https origin in production, not localhost');
    }
    if (c.SESSION_SECRET === 'dev-only-insecure-secret') throw new Error('SESSION_SECRET must be set in production');
  }
  return c;
}

export const config = load();

type Policy = Pick<Config, 'APP_ENV' | 'SMTP_HOST' | 'STRIPE_SECRET_KEY' | 'PAYMENTS_MOCK' | 'DEV_CODE_ECHO'>;


/**
 * Fake checkout: only without Stripe keys, only when PAYMENTS_MOCK is on, and never when APP_ENV=production.
 * Keyed on APP_ENV (not NODE_ENV) so staging, which runs a production build, can still be tested end to end.
 */
export const allowPaymentsMock = (c: Policy) => !c.STRIPE_SECRET_KEY && c.PAYMENTS_MOCK && c.APP_ENV !== 'production';
export const paymentsMock = () => allowPaymentsMock(config);

/** Which email provider is active: Resend if keyed, else SMTP, else log-only. */
export const emailProviderFor = (c: Pick<Config, 'RESEND_API_KEY' | 'SMTP_HOST'>): 'resend' | 'smtp' | 'log' => (c.RESEND_API_KEY ? 'resend' : c.SMTP_HOST ? 'smtp' : 'log');
export const emailProvider = () => emailProviderFor(config);

/** Show sign-in codes on screen when email can't be sent (no provider) outside production. */
export const allowDevCodeEcho = (c: Policy & Partial<Pick<Config, 'RESEND_API_KEY'>>) => {
  if (c.APP_ENV === 'production' || c.DEV_CODE_ECHO === 'false') return false;
  return c.DEV_CODE_ECHO === 'true' || emailProviderFor({ RESEND_API_KEY: c.RESEND_API_KEY, SMTP_HOST: c.SMTP_HOST }) === 'log';
};
export const devCodeEcho = () => allowDevCodeEcho(config);

export const textProvider = (): 'anthropic' | 'openai' | 'gemini' | 'heuristic' => {
  if (config.AI_TEXT_PROVIDER) return config.AI_TEXT_PROVIDER;
  if (config.ANTHROPIC_API_KEY) return 'anthropic';
  if (config.OPENAI_API_KEY) return 'openai';
  if (config.GEMINI_API_KEY) return 'gemini';
  return 'heuristic';
};

export const moderationProvider = (): 'openai' | 'anthropic' | 'heuristic' => {
  if (config.AI_MODERATION_PROVIDER) return config.AI_MODERATION_PROVIDER;
  if (config.OPENAI_API_KEY) return 'openai';
  if (config.ANTHROPIC_API_KEY) return 'anthropic';
  return 'heuristic';
};

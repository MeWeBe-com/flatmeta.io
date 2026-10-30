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
  STAGING_DOMAIN: z.string().default('flatmeta.mewebe.net'), // placeholder until confirmed

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
  if (c.NODE_ENV === 'production') {
    if (/\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(c.APP_URL) || /\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(c.API_URL)) {
      throw new Error('APP_URL / API_URL must be the public https origin in production, not localhost');
    }
    if (c.SESSION_SECRET === 'dev-only-insecure-secret') throw new Error('SESSION_SECRET must be set in production');
    if (!c.STRIPE_SECRET_KEY) c.PAYMENTS_MOCK = false;
  }
  return c;
}

export const config = load();

/** True when checkout should use the local mock instead of Stripe. */
export const paymentsMock = () => !config.STRIPE_SECRET_KEY && config.PAYMENTS_MOCK && config.NODE_ENV !== 'production';

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

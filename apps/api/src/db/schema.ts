import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  date,
  doublePrecision,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  customType,
  bigserial,
  char,
} from 'drizzle-orm/pg-core';

const citext = customType<{ data: string }>({ dataType: () => 'citext' });
const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const ts = (name: string) => timestamp(name, { withTimezone: true });

export type PlotLink = { label: string; url: string };
export type PlotCta = { label: string; url: string } | null;
export type PlotTheme = { primary: string; accent: string };
export type BusinessInfo = {
  phone?: string;
  email?: string;
  address?: string;
  hours?: Record<string, [string, string][]>; // mon..sun → [["09:00","17:00"]]
  timezone?: string;
  bookingUrl?: string;
  offer?: string;
};
export type ShowcaseInfo = {
  brand: string;
  website: string;
  sector: string;
  kind: string;
  city: string;
  useCase: string;
  highlights: string[];
  imagePrompt: string;
  palette: string[];
  motif: string;
  batchId?: string;
  approved: boolean;
};

// ─── Users & auth ────────────────────────────────────────────────────────────

export const users = pgTable(
  'users',
  {
    id: id(),
    email: citext('email').notNull().unique(),
    username: citext('username').notNull().unique(),
    displayName: text('display_name').notNull(),
    avatarUrl: text('avatar_url'),
    bio: text('bio'),
    role: text('role').notNull().default('user'), // user | moderator | admin
    plan: text('plan').notNull().default('free'), // free | plus
    xp: integer('xp').notNull().default(0),
    level: integer('level').notNull().default(1),
    streak: integer('streak').notNull().default(0),
    lastCheckin: date('last_checkin'),
    homeCountry: char('home_country', { length: 2 }),
    homesteadUsed: boolean('homestead_used').notNull().default(false),
    aiCreditsUsed: integer('ai_credits_used').notNull().default(0),
    aiCreditsBonus: integer('ai_credits_bonus').notNull().default(0),
    aiPeriod: text('ai_period'),
    stripeCustomerId: text('stripe_customer_id'),
    bannedAt: ts('banned_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('users_xp_idx').on(t.xp)],
);

export const loginCodes = pgTable(
  'login_codes',
  {
    id: id(),
    email: citext('email').notNull(),
    codeHash: text('code_hash').notNull(),
    purpose: text('purpose').notNull().default('login'), // login | claim
    ref: text('ref'),
    expiresAt: ts('expires_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
    consumedAt: ts('consumed_at'),
    createdAt: createdAt(),
  },
  (t) => [index('login_codes_email_idx').on(t.email, t.createdAt)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    expiresAt: ts('expires_at').notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const organizations = pgTable('organizations', {
  id: id(),
  slug: citext('slug').notNull().unique(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('business'), // business | brand | nonprofit | other
  website: text('website'),
  domain: text('domain'),
  description: text('description'),
  logoUrl: text('logo_url'),
  plan: text('plan').notNull().default('free'), // free | business | brand | enterprise
  planUntil: ts('plan_until'),
  verifiedAt: ts('verified_at'),
  stripeCustomerId: text('stripe_customer_id'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const orgMembers = pgTable(
  'org_members',
  {
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('editor'), // owner | admin | editor
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.orgId, t.userId] }), index('org_members_user_idx').on(t.userId)],
);

export const orgInvites = pgTable('org_invites', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  email: citext('email').notNull(),
  role: text('role').notNull().default('editor'),
  tokenHash: text('token_hash').notNull().unique(),
  invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
  expiresAt: ts('expires_at').notNull(),
  acceptedAt: ts('accepted_at'),
  createdAt: createdAt(),
});

export const apiKeys = pgTable('api_keys', {
  id: id(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  prefix: text('prefix').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
  lastUsedAt: ts('last_used_at'),
  revokedAt: ts('revoked_at'),
  createdAt: createdAt(),
});

// ─── World ───────────────────────────────────────────────────────────────────

export const countries = pgTable('countries', {
  code: char('code', { length: 2 }).primaryKey(),
  name: text('name').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  continent: text('continent'),
  bbox: jsonb('bbox').$type<[number, number, number, number]>(),
  plotCount: integer('plot_count').notNull().default(0),
  cellCount: integer('cell_count').notNull().default(0),
  showcaseCount: integer('showcase_count').notNull().default(0),
});

export const regions = pgTable(
  'regions',
  {
    slug: text('slug').primaryKey(),
    name: text('name').notNull(),
    countryCode: char('country_code', { length: 2 }).notNull(),
    lat: doublePrecision('lat').notNull(),
    lng: doublePrecision('lng').notNull(),
    tier: char('tier', { length: 1 }).notNull(), // S | A
    population: integer('population'),
  },
  (t) => [index('regions_country_idx').on(t.countryCode)],
);

export const pricingTiers = pgTable('pricing_tiers', {
  tier: char('tier', { length: 1 }).primaryKey(),
  label: text('label').notNull(),
  priceCents: integer('price_cents').notNull(),
  description: text('description').notNull().default(''),
  sort: integer('sort').notNull().default(0),
});

export const plots = pgTable(
  'plots',
  {
    id: id(),
    slug: citext('slug').notNull().unique(),
    ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
    ownerOrgId: uuid('owner_org_id').references(() => organizations.id, { onDelete: 'set null' }),
    kind: text('kind').notNull().default('standard'), // standard | homestead | showcase | landmark
    status: text('status').notNull().default('active'), // pending_payment | active | showcase | hidden | released
    minGx: integer('min_gx').notNull(),
    minGy: integer('min_gy').notNull(),
    maxGx: integer('max_gx').notNull(),
    maxGy: integer('max_gy').notNull(),
    cellCount: integer('cell_count').notNull(),
    centerLat: doublePrecision('center_lat').notNull(),
    centerLng: doublePrecision('center_lng').notNull(),
    countryCode: char('country_code', { length: 2 }),
    regionSlug: text('region_slug'),
    tier: char('tier', { length: 1 }).notNull(),
    title: text('title').notNull(),
    tagline: text('tagline'),
    descriptionMd: text('description_md'),
    coverImageUrl: text('cover_image_url'),
    thumbUrl: text('thumb_url'),
    gallery: jsonb('gallery').$type<string[]>().notNull().default([]),
    links: jsonb('links').$type<PlotLink[]>().notNull().default([]),
    cta: jsonb('cta').$type<PlotCta>(),
    category: text('category'),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    theme: jsonb('theme').$type<PlotTheme>(),
    frame: text('frame').notNull().default('none'),
    business: jsonb('business').$type<BusinessInfo>(),
    showcase: jsonb('showcase').$type<ShowcaseInfo>(),
    moderationStatus: text('moderation_status').notNull().default('ok'), // ok | pending | flagged | rejected
    likesCount: integer('likes_count').notNull().default(0),
    visitsCount: integer('visits_count').notNull().default(0),
    guestbookCount: integer('guestbook_count').notNull().default(0),
    spotlightUntil: ts('spotlight_until'),
    beaconUntil: ts('beacon_until'),
    brokenLinks: jsonb('broken_links').$type<string[]>().notNull().default([]),
    linksCheckedAt: ts('links_checked_at'),
    holdExpiresAt: ts('hold_expires_at'),
    publishedAt: ts('published_at'),
    lastEditedAt: ts('last_edited_at'),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce(title,'')), 'A') || setweight(to_tsvector('simple', coalesce(tagline,'') || ' ' || coalesce(category,'') || ' ' || coalesce(region_slug,'')), 'B') || setweight(to_tsvector('simple', coalesce(description_md,'')), 'C')`,
    ),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index('plots_bbox_idx').on(t.minGx, t.maxGx, t.minGy, t.maxGy),
    index('plots_country_idx').on(t.countryCode, t.status),
    index('plots_owner_user_idx').on(t.ownerUserId),
    index('plots_owner_org_idx').on(t.ownerOrgId),
    index('plots_search_idx').using('gin', t.search),
    index('plots_title_trgm_idx').using('gin', sql`${t.title} gin_trgm_ops`),
    index('plots_created_idx').on(t.createdAt),
  ],
);

export const plotCells = pgTable(
  'plot_cells',
  {
    gx: integer('gx').notNull(),
    gy: integer('gy').notNull(),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.gx, t.gy] }), index('plot_cells_plot_idx').on(t.plotId)],
);

export const plotLikes = pgTable(
  'plot_likes',
  {
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.plotId, t.userId] })],
);

export const plotVisitDays = pgTable(
  'plot_visit_days',
  {
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    visits: integer('visits').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.plotId, t.day] })],
);

export const userCountryVisits = pgTable(
  'user_country_visits',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    countryCode: char('country_code', { length: 2 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.countryCode] })],
);

export const guestbookEntries = pgTable(
  'guestbook_entries',
  {
    id: id(),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    moderationStatus: text('moderation_status').notNull().default('ok'),
    deletedAt: ts('deleted_at'),
    createdAt: createdAt(),
  },
  (t) => [index('guestbook_plot_idx').on(t.plotId, t.createdAt)],
);

export const follows = pgTable(
  'follows',
  {
    followerId: uuid('follower_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    followeeId: uuid('followee_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.followerId, t.followeeId] })],
);

export const waves = pgTable(
  'waves',
  {
    id: id(),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    plotId: uuid('plot_id')
      .notNull()
      .references(() => plots.id, { onDelete: 'cascade' }),
    day: date('day').notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('waves_unique_day').on(t.fromUserId, t.plotId, t.day)],
);

// ─── Game ────────────────────────────────────────────────────────────────────

export const xpEvents = pgTable(
  'xp_events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    amount: integer('amount').notNull(),
    ref: text('ref').notNull().default(''),
    day: date('day').notNull(),
    countryCode: char('country_code', { length: 2 }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('xp_events_idem').on(t.userId, t.kind, t.ref, t.day),
    index('xp_events_created_idx').on(t.createdAt),
    index('xp_events_user_kind_day_idx').on(t.userId, t.kind, t.day),
  ],
);

export const userAchievements = pgTable(
  'user_achievements',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    unlockedAt: ts('unlocked_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const userQuests = pgTable(
  'user_quests',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    questKey: text('quest_key').notNull(),
    periodKey: text('period_key').notNull(),
    progress: integer('progress').notNull().default(0),
    target: integer('target').notNull(),
    completedAt: ts('completed_at'),
    claimedAt: ts('claimed_at'),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('user_quests_unique').on(t.userId, t.questKey, t.periodKey)],
);

export const activity = pgTable(
  'activity',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: text('kind').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'set null' }),
    plotId: uuid('plot_id').references(() => plots.id, { onDelete: 'cascade' }),
    countryCode: char('country_code', { length: 2 }),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('activity_created_idx').on(t.createdAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    readAt: ts('read_at'),
    createdAt: createdAt(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

// ─── Money ───────────────────────────────────────────────────────────────────

export type OrderItem = { type: string; description: string; amountCents: number; quantity?: number; meta?: Record<string, unknown> };

export const orders = pgTable(
  'orders',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(), // land | upgrade | landmark | credits
    status: text('status').notNull().default('pending'), // pending | paid | failed | expired | refunded
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('usd'),
    items: jsonb('items').$type<OrderItem[]>().notNull().default([]),
    plotId: uuid('plot_id').references(() => plots.id, { onDelete: 'set null' }),
    stripeSessionId: text('stripe_session_id').unique(),
    stripePaymentIntent: text('stripe_payment_intent'),
    paidAt: ts('paid_at'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('orders_user_idx').on(t.userId), index('orders_status_idx').on(t.status, t.createdAt)],
);

export const subscriptions = pgTable('subscriptions', {
  id: id(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
  plan: text('plan').notNull(), // plus | business | brand
  interval: text('interval').notNull(), // month | year
  status: text('status').notNull(),
  stripeSubscriptionId: text('stripe_subscription_id').notNull().unique(),
  currentPeriodEnd: ts('current_period_end'),
  cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const stripeEvents = pgTable('stripe_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  processedAt: ts('processed_at').notNull().defaultNow(),
});

// ─── Content, AI & moderation ────────────────────────────────────────────────

export const media = pgTable('media', {
  id: id(),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'set null' }),
  path: text('path').notNull(),
  url: text('url').notNull(),
  thumbUrl: text('thumb_url').notNull(),
  mime: text('mime').notNull(),
  width: integer('width').notNull(),
  height: integer('height').notNull(),
  bytes: integer('bytes').notNull(),
  source: text('source').notNull(), // upload | ai | procedural | external
  prompt: text('prompt'),
  createdAt: createdAt(),
});

export const aiJobs = pgTable(
  'ai_jobs',
  {
    id: id(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    kind: text('kind').notNull(), // design | showcase
    status: text('status').notNull().default('queued'), // queued | running | done | failed
    input: jsonb('input').$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb('output').$type<Record<string, unknown>>(),
    provider: text('provider'),
    error: text('error'),
    finishedAt: ts('finished_at'),
    createdAt: createdAt(),
  },
  (t) => [index('ai_jobs_user_idx').on(t.userId, t.createdAt)],
);

export const moderationFlags = pgTable(
  'moderation_flags',
  {
    id: id(),
    targetType: text('target_type').notNull(), // plot | guestbook | media | user
    targetId: text('target_id').notNull(),
    source: text('source').notNull(), // ai | report | system
    reason: text('reason').notNull(),
    score: doublePrecision('score'),
    status: text('status').notNull().default('open'), // open | actioned | dismissed
    reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    resolvedAt: ts('resolved_at'),
    createdAt: createdAt(),
  },
  (t) => [index('moderation_flags_status_idx').on(t.status, t.createdAt)],
);

export const claimRequests = pgTable('claim_requests', {
  id: id(),
  plotId: uuid('plot_id')
    .notNull()
    .references(() => plots.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'set null' }),
  email: citext('email').notNull(),
  orgName: text('org_name').notNull(),
  status: text('status').notNull(), // pending_email | verified | manual_review | approved | rejected | completed
  note: text('note'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const takedownRequests = pgTable('takedown_requests', {
  id: id(),
  plotId: uuid('plot_id')
    .notNull()
    .references(() => plots.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  email: citext('email').notNull(),
  organisation: text('organisation'),
  message: text('message').notNull(),
  status: text('status').notNull().default('open'), // open | removed | rejected
  createdAt: createdAt(),
});

export const showcaseBatches = pgTable('showcase_batches', {
  id: id(),
  countries: text('countries').array().notNull(),
  status: text('status').notNull().default('queued'),
  params: jsonb('params').$type<Record<string, unknown>>().notNull().default({}),
  stats: jsonb('stats').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: createdAt(),
  finishedAt: ts('finished_at'),
});

export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index('audit_log_created_idx').on(t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Plot = typeof plots.$inferSelect;
export type Organization = typeof organizations.$inferSelect;
export type Order = typeof orders.$inferSelect;

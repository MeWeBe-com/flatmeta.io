/**
 * Seeds reference data (pricing tiers, countries, featured cities), the admin
 * user and the FlatMeta HQ plot. Outside production it also adds demo community
 * plots (users @demo.flatmeta.io) so the world feels lived-in while developing.
 *
 *   npm run db:seed            # reference data + admin + HQ (+ demo outside production)
 *   npm run db:seed -- --demo  # force demo data
 *   npm run db:seed -- --no-demo
 */
import { eq, sql } from 'drizzle-orm';
import { config } from '../src/config.js';
import { CITIES } from '../src/data/cities.js';
import { db, pool, schema } from '../src/db/client.js';
import type { Plot } from '../src/db/schema.js';
import { allCountries, nearestCity, resolveCountry } from '../src/lib/geo.js';
import { rectAround } from '../src/lib/grid.js';
import { DEFAULT_TIERS, tierOfRect } from '../src/lib/pricing.js';
import { closeRedis } from '../src/lib/redis.js';
import { findOrCreateUser } from '../src/lib/users.js';
import { generateImage } from '../src/ai/image/index.js';
import { createPlot, recountCountry } from '../src/services/plots.js';
import { publishActivity } from '../src/game/activity.js';
import { recordAction } from '../src/game/engine.js';

const args = new Set(process.argv.slice(2));
const withDemo = args.has('--demo') || (!args.has('--no-demo') && config.NODE_ENV !== 'production');

async function seedReference() {
  for (const [i, t] of DEFAULT_TIERS.entries()) {
    await db.insert(schema.pricingTiers).values({ ...t, sort: i }).onConflictDoNothing();
  }
  const countries = allCountries();
  for (let i = 0; i < countries.length; i += 100) {
    await db
      .insert(schema.countries)
      .values(countries.slice(i, i + 100).map((c) => ({ code: c.code, name: c.name, lat: c.lat, lng: c.lng, bbox: c.bbox })))
      .onConflictDoUpdate({ target: schema.countries.code, set: { name: sql`excluded.name`, lat: sql`excluded.lat`, lng: sql`excluded.lng`, bbox: sql`excluded.bbox` } });
  }
  // Countries that only appear through featured cities (e.g. tiny states missing at 1:50m).
  for (const c of CITIES) {
    await db.insert(schema.countries).values({ code: c.country, name: c.country, lat: c.lat, lng: c.lng }).onConflictDoNothing();
  }
  await db
    .insert(schema.regions)
    .values(CITIES.map((c) => ({ slug: c.slug, name: c.name, countryCode: c.country, lat: c.lat, lng: c.lng, tier: c.tier, population: Math.round(c.population * 1_000_000) })))
    .onConflictDoUpdate({ target: schema.regions.slug, set: { name: sql`excluded.name`, lat: sql`excluded.lat`, lng: sql`excluded.lng`, tier: sql`excluded.tier`, population: sql`excluded.population` } });
  console.log(`Reference data: ${DEFAULT_TIERS.length} tiers, ${countries.length} countries, ${CITIES.length} cities`);
}

async function seedPlot(input: {
  lat: number;
  lng: number;
  w: number;
  h: number;
  title: string;
  slug: string;
  ownerUserId: string;
  kind: 'standard' | 'homestead' | 'landmark';
  tagline: string;
  description: string;
  category: string;
  tags: string[];
  palette: [string, string, string];
  motif: string;
  links?: { label: string; url: string }[];
  frame?: string;
}): Promise<Plot | null> {
  const [existing] = await db.select().from(schema.plots).where(eq(schema.plots.slug, input.slug));
  if (existing) return existing;
  const rect = rectAround(input.lng, input.lat, input.w, input.h);
  const countryCode = resolveCountry(input.lat, input.lng);
  let plot: Plot;
  try {
    plot = await createPlot({
      rect,
      title: input.title,
      slugBase: input.slug,
      kind: input.kind,
      status: 'active',
      ownerUserId: input.ownerUserId,
      tier: tierOfRect(rect),
      countryCode,
      regionSlug: nearestCity(input.lat, input.lng, 40)?.city.slug ?? null,
      extra: {
        tagline: input.tagline,
        descriptionMd: input.description,
        category: input.category,
        tags: input.tags,
        theme: { primary: input.palette[1], accent: input.palette[2] },
        links: input.links ?? [],
        frame: input.frame ?? 'glow',
        publishedAt: new Date(),
      },
    });
  } catch (err) {
    console.warn(`  ! ${input.title}: ${(err as Error).message}`);
    return null;
  }
  const img = await generateImage({ id: `seed-${input.slug}`, prompt: input.title, palette: input.palette, motif: input.motif, provider: 'procedural', ownerUserId: input.ownerUserId });
  const [updated] = await db.update(schema.plots).set({ coverImageUrl: img.url, thumbUrl: img.thumbUrl }).where(eq(schema.plots.id, plot.id)).returning();
  await recountCountry(countryCode);
  return updated!;
}

async function seedAdminAndHq() {
  const { user: admin } = await findOrCreateUser(config.SEED_ADMIN_EMAIL, { displayName: 'FlatMeta Team', homeCountry: 'GB', role: 'admin' });
  await db.update(schema.users).set({ role: 'admin', username: admin.username === 'admin' ? 'flatmeta' : admin.username }).where(eq(schema.users.id, admin.id));
  const hq = await seedPlot({
    lat: 51.5033,
    lng: -0.1196,
    w: 4,
    h: 3,
    title: 'FlatMeta HQ',
    slug: 'flatmeta-hq',
    ownerUserId: admin.id,
    kind: 'landmark',
    tagline: 'Welcome to the world map you can own a piece of.',
    description:
      "This is where FlatMeta lives. **Explore** the globe, **claim** your free Homestead, let the **AI Designer** dress it up, and climb the leaderboards with your city.\n\n- Tap any glowing plot to visit it\n- Press **Claim land** to plant your flag\n- Wave at your neighbours and sign their guestbooks\n\nGot ideas? Sign our guestbook. We read every note.",
    category: 'community',
    tags: ['flatmeta', 'welcome', 'help'],
    palette: ['#0B1B3F', '#2DE2C4', '#FFC94D'],
    motif: 'globe',
    links: [{ label: 'How FlatMeta works', url: `${config.APP_URL}/about` }],
    frame: 'gold',
  });
  console.log(`Admin: ${config.SEED_ADMIN_EMAIL} · HQ plot: ${hq?.slug ?? 'skipped'}`);
  return admin;
}

const DEMO: {
  user: string;
  name: string;
  country: string;
  plot: Omit<Parameters<typeof seedPlot>[0], 'ownerUserId' | 'kind'> & { kind?: 'standard' | 'homestead' };
}[] = [
  { user: 'maya', name: 'Maya Costa', country: 'PT', plot: { lat: 38.7139, lng: -9.1334, w: 2, h: 2, title: 'Maya’s Rooftop Garden', slug: 'mayas-rooftop-garden', tagline: 'Tomatoes, sunsets and the best view of the Tagus.', description: 'A tiny rooftop jungle above Alfama. I post what is growing each week and swap seeds with neighbours.\n\n- Seed swap every first Sunday\n- Sunset playlist in the links', category: 'nature', tags: ['garden', 'lisbon', 'seeds'], palette: ['#0E2A1F', '#4ADE80', '#FDE68A'], motif: 'leaf' } },
  { user: 'kofi', name: 'Kofi Mensah', country: 'GH', plot: { lat: 5.5571, lng: -0.1969, w: 2, h: 2, title: 'Kofi’s Beat Lab', slug: 'kofis-beat-lab', tagline: 'Afrobeats, highlife and late-night sessions from Accra.', description: 'Producer and DJ. New beat every Friday. Leave a note in the guestbook with your favourite track and I might sample it.', category: 'music', tags: ['music', 'accra', 'afrobeats'], palette: ['#2A0F2E', '#FF6B6B', '#FFD27A'], motif: 'music' } },
  { user: 'hana', name: 'Hana Sato', country: 'JP', plot: { lat: 35.6595, lng: 139.7005, w: 2, h: 2, title: 'Night Ramen Club', slug: 'night-ramen-club', tagline: 'A field guide to Tokyo’s best late-night bowls.', description: 'I rank one ramen shop a week, from Shibuya to Shimokitazawa. Vote for the next one in my guestbook.', category: 'food & drink', tags: ['ramen', 'tokyo', 'food'], palette: ['#1A1040', '#8B7CFF', '#FF8FB1'], motif: 'plate' } },
  { user: 'lars', name: 'Lars Nilsson', country: 'SE', plot: { lat: 59.3326, lng: 18.0649, w: 3, h: 2, title: 'Café Aurora', slug: 'cafe-aurora-stockholm', tagline: 'Fika, cardamom buns and northern lights on the walls.', description: 'Independent café in Norrmalm. Show this plot at the counter for a free bun with any coffee this month.', category: 'food & drink', tags: ['coffee', 'stockholm', 'fika'], palette: ['#102030', '#22D3EE', '#F0ABFC'], motif: 'cup' } },
  { user: 'ana', name: 'Ana Ríos', country: 'MX', plot: { lat: 19.4204, lng: -99.1625, w: 2, h: 2, title: 'Casa de Colores', slug: 'casa-de-colores', tagline: 'Street art walks through Roma Norte.', description: 'I map murals in Mexico City. Join the Saturday walk and add your favourite wall to the list.', category: 'arts', tags: ['street art', 'cdmx', 'murals'], palette: ['#2B1A0E', '#FB923C', '#FEF3C7'], motif: 'star' } },
  { user: 'sam', name: 'Sam Patel', country: 'GB', plot: { lat: 51.5246, lng: -0.0786, w: 2, h: 2, title: 'Shoreditch Code Club', slug: 'shoreditch-code-club', tagline: 'Free coding nights for curious beginners.', description: 'Every Wednesday we build something silly and learn something real. Laptops provided. All welcome.', category: 'technology', tags: ['coding', 'london', 'community'], palette: ['#0B1B3F', '#3FA9F5', '#FFE08A'], motif: 'circuit' } },
  { user: 'zoe', name: 'Zoe Martin', country: 'FR', plot: { lat: 48.8867, lng: 2.3431, w: 2, h: 2, title: 'Montmartre Sketchbook', slug: 'montmartre-sketchbook', tagline: 'One drawing of Paris every day.', description: 'Watercolour sketches from the hill. Request a street in the guestbook and I will draw it.', category: 'arts', tags: ['art', 'paris', 'watercolour'], palette: ['#1B1B3A', '#F472B6', '#A5F3FC'], motif: 'star' } },
  { user: 'diego', name: 'Diego Alves', country: 'BR', plot: { lat: -22.9711, lng: -43.1822, w: 3, h: 2, title: 'Copacabana Surf School', slug: 'copacabana-surf-school', tagline: 'First wave guaranteed, or your next lesson is on us.', description: 'Small-group surf lessons at Posto 5. Boards, wetsuits and açaí included.', category: 'sport', tags: ['surf', 'rio', 'beach'], palette: ['#08243A', '#3FA9F5', '#FFE08A'], motif: 'waves' } },
  { user: 'aisha', name: 'Aisha Khan', country: 'AE', plot: { lat: 25.2285, lng: 55.2867, w: 2, h: 2, title: 'Desert Reads', slug: 'desert-reads', tagline: 'A tiny book swap with a big view.', description: 'Bring a book, take a book. This month we are reading Gulf fiction. Leave your recommendation below.', category: 'education', tags: ['books', 'dubai', 'swap'], palette: ['#2B1A0E', '#FB923C', '#FEF3C7'], motif: 'book' } },
  { user: 'ben', name: 'Ben Walker', country: 'AU', plot: { lat: -33.8915, lng: 151.2767, w: 2, h: 2, title: 'Bondi Sunrise Crew', slug: 'bondi-sunrise-crew', tagline: 'Ocean swims at 6am. Coffee at 7.', description: 'A free, friendly swim group. All speeds welcome. Wave if you are in!', category: 'sport', tags: ['swim', 'sydney', 'community'], palette: ['#102030', '#22D3EE', '#F0ABFC'], motif: 'sun' } },
  { user: 'priya', name: 'Priya Nair', country: 'IN', plot: { lat: 12.9719, lng: 77.6412, w: 2, h: 2, title: 'Indiranagar Plant Lab', slug: 'indiranagar-plant-lab', tagline: 'Rescued houseplants looking for new homes.', description: 'I nurse plants back to health and give them away. Tell me about your windowsill and I will match you with a plant.', category: 'nature', tags: ['plants', 'bengaluru', 'green'], palette: ['#0E2A1F', '#4ADE80', '#FDE68A'], motif: 'leaf' } },
  { user: 'jonas', name: 'Jonas Becker', country: 'DE', plot: { lat: 52.4996, lng: 13.4199, w: 2, h: 2, title: 'Kreuzberg Vinyl Corner', slug: 'kreuzberg-vinyl-corner', tagline: 'Second-hand records and Sunday listening sessions.', description: 'Bring a record you love. We play it on the big speakers and talk about why it matters.', category: 'music', tags: ['vinyl', 'berlin', 'music'], palette: ['#1A1040', '#8B7CFF', '#FF8FB1'], motif: 'music' } },
  { user: 'lucia', name: 'Lucía Gómez', country: 'ES', plot: { lat: 41.4036, lng: 2.1744, w: 2, h: 2, title: 'Gràcia Tapas Trail', slug: 'gracia-tapas-trail', tagline: 'Seven bars, seven tapas, one perfect evening.', description: 'My hand-picked route through Gràcia. Follow it in order and finish with vermut at the plaza.', category: 'food & drink', tags: ['tapas', 'barcelona', 'food'], palette: ['#2A0F2E', '#FF6B6B', '#FFD27A'], motif: 'plate' } },
  { user: 'noah', name: 'Noah Brooks', country: 'US', plot: { lat: 40.7265, lng: -73.9815, w: 2, h: 2, title: 'East Village Chess Corner', slug: 'east-village-chess-corner', tagline: 'Blitz games in the park, rain or shine.', description: 'Tompkins Square regulars. Beginners get a free lesson. Challenge me in the guestbook.', category: 'community', tags: ['chess', 'nyc', 'games'], palette: ['#0B1B3F', '#2DE2C4', '#FFC94D'], motif: 'star' } },
];

async function seedDemo() {
  const created: Plot[] = [];
  const users: string[] = [];
  for (const d of DEMO) {
    const { user } = await findOrCreateUser(`${d.user}@demo.flatmeta.io`, { displayName: d.name, homeCountry: d.country });
    if (user.username !== d.user) await db.update(schema.users).set({ username: d.user }).where(eq(schema.users.id, user.id)).catch(() => undefined);
    await db.update(schema.users).set({ homesteadUsed: true }).where(eq(schema.users.id, user.id));
    users.push(user.id);
    const plot = await seedPlot({ ...d.plot, ownerUserId: user.id, kind: d.plot.kind ?? 'homestead' });
    if (plot) created.push(plot);
  }
  // A little life: likes, guestbook notes, XP and activity.
  const notes = ['Love this!', 'Waved from across the map 👋', 'Adding this to my weekend plans.', 'Beautiful plot, neighbour!', 'Came here from the leaderboard. Worth it.'];
  for (const [i, plot] of created.entries()) {
    for (let j = 1; j <= 3; j++) {
      const fan = users[(i + j) % users.length]!;
      if (fan === plot.ownerUserId) continue;
      const liked = await db.insert(schema.plotLikes).values({ plotId: plot.id, userId: fan }).onConflictDoNothing().returning();
      if (liked.length) await db.update(schema.plots).set({ likesCount: sql`${schema.plots.likesCount} + 1`, visitsCount: sql`${schema.plots.visitsCount} + ${5 + ((i * 7 + j) % 20)}` }).where(eq(schema.plots.id, plot.id));
    }
    const author = users[(i + 1) % users.length]!;
    const [existingNote] = await db.select().from(schema.guestbookEntries).where(eq(schema.guestbookEntries.plotId, plot.id)).limit(1);
    if (!existingNote) {
      await db.insert(schema.guestbookEntries).values({ plotId: plot.id, userId: author, body: notes[i % notes.length]! });
      await db.update(schema.plots).set({ guestbookCount: sql`${schema.plots.guestbookCount} + 1` }).where(eq(schema.plots.id, plot.id));
    }
    if (plot.ownerUserId) {
      await recordAction(plot.ownerUserId, 'claim_plot', { ref: plot.id, countryCode: plot.countryCode });
      await recordAction(plot.ownerUserId, 'publish', { ref: plot.id });
      await publishActivity({ kind: 'plot_published', actorUserId: plot.ownerUserId, plotId: plot.id, countryCode: plot.countryCode, lat: plot.centerLat, lng: plot.centerLng, payload: { title: plot.title, slug: plot.slug } });
    }
  }

  console.log(`Demo community: ${created.length} plots by ${users.length} demo users`);
}

await seedReference();
await seedAdminAndHq();
if (withDemo) await seedDemo();
await pool.end();
await closeRedis();
console.log('Seed complete');

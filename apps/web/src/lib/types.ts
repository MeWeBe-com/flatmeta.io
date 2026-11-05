export type Tier = 'S' | 'A' | 'B' | 'C' | 'O';
export interface Rect { minGx: number; minGy: number; maxGx: number; maxGy: number }
export interface Bounds { west: number; south: number; east: number; north: number }
export interface Link { label: string; url: string }

export interface Owner {
  type: 'user' | 'org';
  id: string;
  handle: string;
  displayName: string;
  avatarUrl: string | null;
  level?: number;
  verified?: boolean;
  plan?: string;
}

export interface BusinessInfo {
  phone?: string;
  email?: string;
  address?: string;
  hours?: Partial<Record<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun', [string, string][]>>;
  timezone?: string;
  bookingUrl?: string;
  offer?: string;
}

export interface Plot {
  id: string;
  slug: string;
  kind: 'standard' | 'homestead' | 'showcase' | 'landmark';
  status: string;
  rect: Rect;
  width: number;
  height: number;
  cellCount: number;
  center: { lat: number; lng: number };
  bounds: Bounds;
  countryCode: string | null;
  countryName: string | null;
  regionSlug: string | null;
  tier: Tier;
  title: string;
  tagline: string | null;
  descriptionMd: string | null;
  descriptionHtml: string;
  coverImageUrl: string | null;
  thumbUrl: string | null;
  gallery: string[];
  links: Link[];
  cta: Link | null;
  category: string | null;
  tags: string[];
  theme: { primary: string; accent: string } | null;
  frame: string;
  business: BusinessInfo | null;
  showcase: { brand: string; website: string; sector: string; kind: string; city: string; useCase: string; highlights: string[]; approved: boolean } | null;
  moderationStatus: string;
  owner: Owner | null;
  hasCustomHtml?: boolean;
  customHtml?: string;
  customHtmlDoc?: string;
  listing?: { id: string; priceCents: number; currency: string; version: number } | null;
  likesCount: number;
  visitsCount: number;
  guestbookCount: number;
  spotlight: boolean;
  beacon: boolean;
  spotlightUntil: string | null;
  beaconUntil: string | null;
  dormant: boolean;
  brokenLinks: string[];
  threeWords: string;
  published: boolean;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  likedByMe: boolean;
  canEdit: boolean;
}

export interface WorldPlot {
  id: string;
  slug: string;
  kind: Plot['kind'];
  title: string;
  tagline: string | null;
  rect: Rect;
  bounds: Bounds;
  center: { lat: number; lng: number };
  cellCount: number;
  thumbUrl: string | null;
  theme: { primary: string; accent: string } | null;
  frame: string;
  countryCode: string | null;
  likesCount: number;
  spotlight: boolean;
  beacon: boolean;
  ownerName: string | null;
  verified: boolean;
  mine: boolean;
  published: boolean;
}

export interface AvatarLook { face: string; color: string; accessory?: string }

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  avatar: AvatarLook | null;
  bio: string | null;
  level: number;
  levelTitle: string;
  xp: number;
  homeCountry: string | null;
  plan: string;
  createdAt: string;
}
export interface Me extends PublicUser {
  email: string;
  role: 'user' | 'moderator' | 'admin';
  streak: number;
  lastCheckin: string | null;
  homesteadUsed: boolean;
  hasPassword: boolean;
}

export interface LevelProgress { level: number; title: string; xp: number; levelXp: number; nextLevelXp: number; progress: number }
export interface Credits { monthly: number; used: number; bonus: number; remaining: number; period: string; unlimited: boolean }
export interface Org { id: string; slug: string; name: string; kind: string; website: string | null; description: string | null; logoUrl: string | null; plan: string; verified: boolean; createdAt: string; role?: string }

export interface MeResponse {
  user: Me | null;
  progress?: LevelProgress;
  credits?: Credits;
  orgs?: Org[];
  unreadNotifications?: number;
}

export interface GameResult {
  xp: number;
  level: number;
  levelUp: { level: number; title: string } | null;
  achievements: { key: string; name: string; rarity: string; icon: string; xp: number }[];
  questsCompleted: { id: string; key: string; title: string }[];
}

export interface Quest {
  id: string | null;
  key: string;
  period: 'onboarding' | 'daily' | 'weekly';
  periodKey: string;
  title: string;
  description: string;
  icon: string;
  order: number;
  progress: number;
  target: number;
  xp: number;
  credits: number;
  completed: boolean;
  claimed: boolean;
}
export interface Achievement { key: string; name: string; description: string; icon: string; rarity: 'common' | 'rare' | 'epic' | 'legendary'; xp: number; unlocked: boolean; unlockedAt: string | null }
export interface Progress extends LevelProgress {
  streak: number;
  checkedInToday: boolean;
  quests: Quest[];
  achievements: Achievement[];
  recentXp: { kind: string; amount: number; createdAt: string }[];
  credits: Credits;
  frames: { key: string; name: string; level: number; plan?: string; unlocked: boolean }[];
}

export interface Quote {
  cells: number;
  width: number;
  height: number;
  tier: Tier;
  unitCents: number;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  homesteadEligible: boolean;
  free: boolean;
  tooLarge: boolean;
  maxSide: number;
  rect: Rect;
  center: { lat: number; lng: number };
  countryCode: string | null;
  regionSlug: string | null;
  conflicts: { id: string; slug: string; title: string }[];
  available: boolean;
  plan: string;
  plotLimitReached: boolean;
  reasons: string[];
  paidCheckout?: boolean;
  freeAllowance?: { limit: number; used: number } | null;
  comingSoon?: boolean;
}

export interface Activity {
  id: number;
  kind: string;
  plotId: string | null;
  countryCode: string | null;
  lat: number | null;
  lng: number | null;
  payload: { title?: string; slug?: string; cells?: number; name?: string; rarity?: string; kind?: string };
  createdAt: string;
  actor: { id: string; username: string; displayName: string; avatarUrl: string | null; level: number } | null;
  flag: string | null;
}

export interface Country { code: string; name: string; lat: number; lng: number; flag: string; plotCount: number; cellCount: number; showcaseCount: number; bbox?: [number, number, number, number] | null }
export interface Region { slug: string; name: string; countryCode: string; lat: number; lng: number; tier: string; population: number | null }
export interface GuestbookEntry { id: string; body: string; createdAt: string; author: { id: string; username: string; displayName: string; avatarUrl: string | null; level: number } }

// ─── Realtime, chat, social ────────────────────────────────────────────────
export interface Peer { id: string; name: string; username: string | null; userId: string | null; avatar: AvatarLook | null; level: number; lat: number; lng: number }
export interface ChatMsg { id: number; room: string; senderId: string | null; senderName: string; senderUsername?: string | null; toUsername?: string | null; avatar: AvatarLook | null; body: string; createdAt: string }
export interface You { id: string; name: string; username: string | null; avatar: AvatarLook | null; userId: string | null; guest: boolean; clanId: string | null }
export interface ConnUser { id: string; username: string; displayName: string; avatar: AvatarLook | null; avatarUrl: string | null; level: number }
export interface Connections {
  friends: { connectionId: string; user: ConnUser }[];
  incoming: { connectionId: string; user: ConnUser; at: string }[];
  outgoing: { connectionId: string; user: ConnUser; at: string }[];
  blocked: { connectionId: string; user: ConnUser }[];
}

// ─── Marketplace and clans ─────────────────────────────────────────────────
export interface Listing { id: string; status: 'active' | 'sold' | 'cancelled' | 'void'; priceCents: number; currency: string; feeCents: number; version: number; createdAt: string; soldAt: string | null; plot: Plot }
export interface ClanEmblem { icon: string; color: string }
export interface Clan { id: string; slug: string; name: string; tag: string; description: string | null; emblem: ClanEmblem; memberCount: number; maxMembers: number; xp: number; cells: number; createdAt: string }
export interface ClanMember { role: 'leader' | 'officer' | 'member'; joinedAt: string; id: string; username: string; displayName: string; avatar: AvatarLook | null; avatarUrl: string | null; level: number; xp: number }
export interface ClanDetail { clan: Clan; members: ClanMember[]; myRole: 'leader' | 'officer' | 'member' | null; myPending: { id: string; kind: string } | null; requests: { id: string; createdAt: string; kind: string; username: string; displayName: string; level: number }[] }
export interface ClanRank { rank: number; id: string; slug: string; name: string; tag: string; emblem: ClanEmblem; memberCount: number; xp: number; cells: number }

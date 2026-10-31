import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import {
  GRID_ZOOM,
  GridBounds,
  GridPoint,
  LatLngBox,
  bboxParam,
  boundsOf,
  boxContains,
  boxContainsPoint,
  boxesOverlap,
  gridBoundsToBox,
  gridCenterLatLng,
  gridKey,
  gridToLatLng,
  gridToThreeWords,
  isValidBounds,
  latLngToGrid,
  padBox,
  slugify,
} from '../core/grid';
import { HttpService } from './http.service';
import { PresenceService } from './presence.service';
import { Identity, SessionService } from './session.service';

export const FREE_TILE_QUOTA = 100;
export const PRICE_PER_TILE_MONTH = 0.1;
export const PLATFORM_COMMISSION_RATE = 0.1;
export const FLATMETA_HOME: [number, number] = [51.50972, -0.104317];
/** Extra land loaded around the view on every side (as a share of the view), so small pans need no request. */
export const VIEW_MARGIN = 0.35;
/** Squares kept in memory; beyond this, squares outside the loaded region are dropped. */
const MAX_CACHED_TILES = 15000;

/** One owned 40x40px square at zoom 15. */
export interface LandTile {
  gx: number;
  gy: number;
  lat: number;
  lng: number;
  order_id: string;
  user_id: string;
  username: string;
  fullname: string;
  image: string;
  previous_image: string;
  span_bounds: GridBounds | null;
  area_title: string;
  slug: string;
  three_words: string;
  custom_details: string;
  embed_url: string;
  custom_code: string;
  on_sale: boolean;
  /** Price per square, USD. */
  sale_price: number;
  views: number;
  promoted: boolean;
  created_at: string;
  /** Guest draft that only exists on this device until the email is verified. */
  draft?: boolean;
  /** FlatMeta's own welcome plaza (not ownable). */
  official?: boolean;
  /** Squares in the whole area; the map may only have loaded some of them. */
  order_tiles?: number;
}

/** Tiles grouped by order: what users think of as "a land area". */
export interface LandArea {
  order_id: string;
  user_id: string;
  username: string;
  fullname: string;
  title: string;
  slug: string;
  three_words: string;
  custom_details: string;
  embed_url: string;
  custom_code: string;
  image: string;
  previous_image: string;
  no_of_tiles: number;
  lat: number;
  lng: number;
  sale_price: number;
  total_sale_value: number;
  on_sale: boolean;
  promoted: boolean;
  views: number;
  created_at: string;
  is_mine: boolean;
  draft: boolean;
  official: boolean;
  tiles: LandTile[];
  /** Rent for squares past the free 100 (only on my own areas, from MyPlaces). */
  billing?: AreaBilling;
}

export interface AreaBilling {
  /** PayPal subscription state: ACTIVE, CANCELLED, SUSPENDED, or null when none is needed. */
  subscription: string | null;
  nextPayment: string | null;
  paidUntil: string | null;
  /** Past the free squares with no subscription yet (e.g. bought on the marketplace). */
  required: boolean;
}

export interface AreaDetails {
  area_title?: string;
  slug?: string;
  three_words?: string;
  custom_details?: string;
  embed_url?: string;
  custom_code?: string;
  on_sale?: boolean;
  sale_price?: number;
}

export interface PortfolioStats {
  ownedTiles: number;
  draftTiles: number;
  freeQuotaRemaining: number;
  billableTiles: number;
  monthlyUsd: number;
  /** Listed areas count at sale value, the rest at the monthly rate x 12. */
  worthUsd: number;
  boughtUsd: number;
  soldUsd: number;
  areas: number;
  onSaleAreas: number;
}

export interface ActionResult {
  ok: boolean;
  message: string;
  /** PayPal checkout link when the action needs payment. */
  paymentUrl?: string | null;
  /** Set when the action needs a verified email first. */
  needsAuth?: boolean;
  orderId?: string;
}

const DRAFTS_KEY = 'flatmeta_land_drafts_v1';

@Injectable({ providedIn: 'root' })
export class LandService {
  /** Server squares loaded so far, mostly around the current view. */
  private server = new Map<string, LandTile>();
  private drafts = new Map<string, LandTile>();
  private official = new Map<string, LandTile>();
  /** One row per area for the zoomed-out levels (from `PurchasedTiles?summary=1`). */
  private summaries: LandArea[] = [];
  /** My server land, from `MyPlaces` (whole areas, wherever they are). */
  private mine: LandArea[] = [];
  private ledger = { boughtUsd: 0, soldUsd: 0 };

  /** What the map shows, and the regions whose land is loaded and still fresh. */
  private view: { box: LatLngBox; zoom: number } | null = null;
  private tileBox: LatLngBox | null = null;
  private summaryBox: LatLngBox | null = null;
  private summaryZoom = 0;
  /** Bumped whenever loaded land goes stale, so a request already in flight doesn't mark it fresh. */
  private version = 0;
  private syncing = false;
  private syncAgain = false;
  private view$ = new Subject<void>();
  private resync$ = new Subject<void>();
  private identityId = '';

  /** Tiles to draw: loaded server land + this guest's drafts + the official plaza. */
  readonly tiles$ = new BehaviorSubject<LandTile[]>([]);
  readonly stats$ = new BehaviorSubject<PortfolioStats>(this.computeStats());
  /** My land: server areas from MyPlaces plus this device's drafts. */
  readonly myAreas$ = new BehaviorSubject<LandArea[]>([]);
  readonly loaded$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpService, private session: SessionService, private presence: PresenceService) {
    this.buildOfficialPlaza();
    this.loadDrafts();
    this.publish();

    this.view$.pipe(debounceTime(300)).subscribe(() => this.sync());
    this.resync$.pipe(debounceTime(250)).subscribe(() => {
      this.invalidate();
      this.sync();
    });
    this.session.identity$.subscribe((id) => {
      if (id.id !== this.identityId) {
        this.identityId = id.id;
        this.mine = [];
        this.ledger = { boughtUsd: 0, soldUsd: 0 };
        if (!id.isGuest) this.fetchMine();
      }
      this.publish();
    });
    this.session.signedOut$.subscribe(() => this.refresh());
    this.presence.tilesChanged$.subscribe((change) => this.onRemoteChange(change.by, change.bounds));
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /** Guest squares waiting to be saved on this device. */
  get draftCount(): number {
    return this.drafts.size;
  }

  get tiles(): LandTile[] {
    return this.tiles$.value;
  }

  tileAt(gx: number, gy: number): LandTile | undefined {
    const key = gridKey(gx, gy);
    return this.official.get(key) || this.server.get(key) || this.drafts.get(key);
  }

  isMine(tile: Pick<LandTile, 'user_id'> | undefined, identity: Identity = this.session.identity): boolean {
    return !!tile && String(tile.user_id) === identity.id;
  }

  /** Areas built from the loaded squares (an area at the edge of the view may be partly loaded). */
  areas(): LandArea[] {
    const groups = new Map<string, LandTile[]>();
    for (const t of this.tiles) {
      const list = groups.get(t.order_id) || [];
      list.push(t);
      groups.set(t.order_id, list);
    }
    const out: LandArea[] = [];
    groups.forEach((tiles, orderId) => out.push(this.buildArea(orderId, tiles)));
    return out;
  }

  area(orderId: string): LandArea | undefined {
    const id = String(orderId);
    return this.areas().find((a) => a.order_id === id) || this.mine.find((a) => a.order_id === id);
  }

  myAreas(): LandArea[] {
    return this.myAreas$.value;
  }

  /** Badges for the City and World levels: one per area in view, plus drafts and FlatMeta Home. */
  badges(): LandArea[] {
    const out = this.summaries.slice();
    const seen = new Set(out.map((a) => a.order_id));
    for (const a of this.localAreas()) {
      if (!seen.has(a.order_id)) out.push(a);
    }
    return out;
  }

  /** Finds a loaded area from a custom URL slug, 3-word address or order id. */
  findArea(query: string): LandArea | undefined {
    const q = slugify(query);
    const raw = String(query || '').trim().toLowerCase();
    if (!q && !raw) return undefined;
    return [...this.areas(), ...this.mine].find((a) => this.matchesExactly(a, q, raw));
  }

  /** Like findArea, but asks the server when the area isn't loaded (e.g. a flatmeta.io/u/<slug> link). */
  async findAreaRemote(query: string): Promise<LandArea | undefined> {
    const local = this.findArea(query);
    if (local) return local;
    const q = slugify(query);
    const raw = String(query || '').trim().toLowerCase();
    return (await this.fetchFindArea(query)).find((a) => this.matchesExactly(a, q, raw));
  }

  /** The whole area with this order id: from the server unless it is a local draft or FlatMeta Home. */
  async loadArea(orderId: string): Promise<LandArea | undefined> {
    const id = String(orderId);
    const local = this.localAreas().find((a) => a.order_id === id);
    if (local) return local;
    const found = (await this.fetchFindArea(id)).find((a) => a.order_id === id);
    return found || this.area(id);
  }

  /** Search of the loaded land (instant); see searchRemote for everything else. */
  search(query: string): LandArea[] {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    // ⚡ Bolt optimization:
    // 1. Pre-compute slugify(q) once instead of in every iteration of the filter loop.
    // 2. Replace O(N^2) deduplication (all.findIndex) with an O(1) Set lookup.
    // 3. Early break once 8 matching areas are found, skipping unnecessary checks on remaining items.
    const slugQuery = slugify(q);
    const seen = new Set<string>();
    const matches: LandArea[] = [];
    const candidates = [...this.areas(), ...this.mine];

    for (const a of candidates) {
      if (seen.has(a.order_id)) continue;
      seen.add(a.order_id);

      if (
        a.title.toLowerCase().includes(q) ||
        (a.slug || '').includes(slugQuery) ||
        (a.three_words || '').includes(q) ||
        (a.username || '').toLowerCase().includes(q)
      ) {
        matches.push(a);
        if (matches.length >= 8) break;
      }
    }

    return matches;
  }

  async searchRemote(query: string): Promise<LandArea[]> {
    return this.fetchFindArea(query);
  }

  /** Marketplace listings from `SaleList`. Null when the request failed. */
  async marketplace(filter: 'recent' | 'popular' | 'promoted' = 'recent'): Promise<LandArea[] | null> {
    const res = await this.http.getAsync(`SaleList?filter=${filter === 'popular' ? 'popular' : 'recent'}&limit=200`);
    if (res?.status !== true || !Array.isArray(res.data?.tiles)) return null;
    let list = this.areasFromRecords(res.data.tiles).filter((a) => a.on_sale);
    if (filter === 'promoted') list = list.filter((a) => a.promoted);
    if (filter === 'popular') return list.sort((a, b) => b.views - a.views || b.no_of_tiles - a.no_of_tiles);
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  /** The newest land areas from `LatestPurchasedTiles`. Null when the request failed. */
  async latest(limit = 48): Promise<LandArea[] | null> {
    const res = await this.http.getAsync(`LatestPurchasedTiles?limit=${limit}`);
    if (res?.status !== true || !Array.isArray(res.data?.tiles)) return null;
    return this.areasFromRecords(res.data.tiles);
  }

  /** Is any of these squares already owned (by anyone)? */
  available(points: GridPoint[]): GridPoint[] {
    return points.filter((p) => !this.tileAt(p.gx, p.gy));
  }

  // ---------------------------------------------------------------------------
  // Loading: only the land around the view
  // ---------------------------------------------------------------------------

  /**
   * The map calls this after every move. At the Land level it loads the squares in
   * the view plus VIEW_MARGIN; zoomed out it loads one summary row per area.
   */
  setView(box: LatLngBox, zoom: number) {
    this.view = { box, zoom };
    this.view$.next();
  }

  /** Reloads the land in view and my land. */
  refresh() {
    this.resync$.next();
    this.refreshMine();
  }

  /** Reloads my land and portfolio (MyPlaces). */
  refreshMine() {
    if (!this.session.isGuest) this.fetchMine();
  }

  private invalidate() {
    this.version++;
    this.tileBox = null;
    this.summaryBox = null;
  }

  private onRemoteChange(by: string, bounds: LatLngBox | null) {
    // My own change from another tab or device.
    if (by && by === this.session.identity.id) this.refreshMine();
    const inView =
      !bounds ||
      (this.tileBox && boxesOverlap(this.tileBox, bounds)) ||
      (this.summaryBox && boxesOverlap(this.summaryBox, bounds));
    if (inView) {
      this.resync$.next();
      return;
    }
    // Not loaded here: forget any old copy so it is fetched fresh if the map goes there.
    this.server.forEach((t, k) => boxContainsPoint(bounds, t.lat, t.lng) && this.server.delete(k));
  }

  private async sync() {
    if (this.syncing) {
      this.syncAgain = true;
      return;
    }
    this.syncing = true;
    try {
      do {
        this.syncAgain = false;
        const v = this.view;
        if (!v) break;
        if (v.zoom >= GRID_ZOOM) {
          if (!this.tileBox || !boxContains(this.tileBox, v.box)) await this.loadTiles(padBox(v.box, VIEW_MARGIN));
        } else if (!this.summaryBox || this.summaryZoom !== v.zoom || !boxContains(this.summaryBox, v.box)) {
          await this.loadSummaries(padBox(v.box, VIEW_MARGIN), v.zoom);
        }
      } while (this.syncAgain);
    } finally {
      this.syncing = false;
    }
  }

  private async loadTiles(box: LatLngBox) {
    const version = this.version;
    const res = await this.http.getAsync(`PurchasedTiles?bbox=${bboxParam(box)}`);
    if (res?.status !== true || !Array.isArray(res.data?.tiles)) return;
    const fetched = new Map<string, LandTile>();
    for (const raw of res.data.tiles) {
      const tile = this.fromApi(raw);
      if (tile) fetched.set(gridKey(tile.gx, tile.gy), tile);
    }
    // The answer replaces everything we had in the box, so released squares disappear.
    this.server.forEach((t, k) => boxContainsPoint(box, t.lat, t.lng) && this.server.delete(k));
    fetched.forEach((t, k) => this.server.set(k, t));
    if (this.server.size > MAX_CACHED_TILES) {
      this.server.forEach((t, k) => !boxContainsPoint(box, t.lat, t.lng) && this.server.delete(k));
    }
    // A draft that someone else has meanwhile saved for real is no longer claimable.
    let changed = false;
    this.drafts.forEach((_, key) => {
      if (fetched.has(key)) {
        this.drafts.delete(key);
        changed = true;
      }
    });
    if (changed) this.saveDrafts();
    if (version === this.version) this.tileBox = box;
    else this.syncAgain = true;
    this.publish();
    this.loaded$.next(true);
  }

  private async loadSummaries(box: LatLngBox, zoom: number) {
    const version = this.version;
    const res = await this.http.getAsync(`PurchasedTiles?summary=1&bbox=${bboxParam(box)}`);
    if (res?.status !== true || !Array.isArray(res.data?.areas)) return;
    this.summaries = res.data.areas.map((r: any) => this.areaFromSummary(r)).filter((a: LandArea | null): a is LandArea => !!a);
    if (version === this.version) {
      this.summaryBox = box;
      this.summaryZoom = zoom;
    } else {
      this.syncAgain = true;
    }
    this.publish();
    this.loaded$.next(true);
  }

  private async fetchMine() {
    const res = await this.http.getAsync('MyPlaces');
    if (res?.status !== true) return;
    if (Array.isArray(res.data?.tiles)) this.mine = this.areasFromRecords(res.data.tiles);
    const p = res.data?.portfolio;
    if (p) {
      this.ledger = {
        boughtUsd: Number(p.bought_usd ?? p.total_bought_usd ?? 0),
        soldUsd: Number(p.sold_usd ?? p.total_sold_usd ?? 0),
      };
    }
    this.publish();
  }

  private async fetchFindArea(query: string): Promise<LandArea[]> {
    const q = String(query || '').trim();
    if (!q) return [];
    const res = await this.http.getAsync(`FindArea?q=${encodeURIComponent(q.slice(0, 120))}`);
    return res?.status === true && Array.isArray(res.data?.tiles) ? this.areasFromRecords(res.data.tiles) : [];
  }

  /** Order records (MyPlaces, SaleList, LatestPurchasedTiles, FindArea) carry all their squares. */
  private areasFromRecords(records: any[]): LandArea[] {
    const out: LandArea[] = [];
    for (const r of records) {
      const tiles = (Array.isArray(r?.tiles) ? r.tiles : [])
        .map((t: any) => this.fromApi({ ...r, ...t, order_id: r.order_id ?? r.id, span_bounds: t.span_bounds ?? r.span_bounds }))
        .filter((t: LandTile | null): t is LandTile => !!t);
      if (!tiles.length) continue;
      const area = this.buildArea(String(r.order_id ?? r.id), tiles);
      if ('subscription_status' in r || 'billing_required' in r) {
        area.billing = {
          subscription: r.subscription_status || null,
          nextPayment: r.next_due_date || null,
          paidUntil: r.paid_until || null,
          required: !!r.billing_required,
        };
      }
      out.push(area);
    }
    return out;
  }

  private areaFromSummary(r: any): LandArea | null {
    let lat = Number(r?.lat);
    let lng = Number(r?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // The server averages the squares' north-west corners; shift half a square to the middle.
    const g = latLngToGrid(lat, lng);
    const nw = gridToLatLng(g.gx, g.gy);
    const se = gridToLatLng(g.gx + 1, g.gy + 1);
    lat += (se.lat - nw.lat) / 2;
    lng += (se.lng - nw.lng) / 2;
    const tiles = Number(r.no_of_tiles) || 1;
    const salePrice = Number(r.sale_price || 0);
    return {
      order_id: String(r.order_id),
      user_id: String(r.user_id ?? ''),
      username: String(r.username || 'citizen'),
      fullname: String(r.fullname || r.username || 'Citizen'),
      title: String(r.area_title || '') || `${r.fullname || r.username || 'Citizen'}'s land`,
      slug: String(r.slug || ''),
      three_words: '',
      custom_details: '',
      embed_url: '',
      custom_code: '',
      image: this.normalizeImage(r.image),
      previous_image: '',
      no_of_tiles: tiles,
      lat,
      lng,
      sale_price: salePrice,
      total_sale_value: Number((salePrice * tiles).toFixed(2)),
      on_sale: !!r.on_sale && salePrice > 0,
      promoted: !!r.promoted,
      views: 0,
      created_at: '',
      is_mine: String(r.user_id) === this.session.identity.id,
      draft: false,
      official: false,
      tiles: [],
    };
  }

  /** Drafts on this device and FlatMeta Home, as areas. */
  private localAreas(): LandArea[] {
    const groups = new Map<string, LandTile[]>();
    const add = (t: LandTile) => groups.set(t.order_id, [...(groups.get(t.order_id) || []), t]);
    this.official.forEach(add);
    this.drafts.forEach(add);
    return Array.from(groups, ([orderId, tiles]) => this.buildArea(orderId, tiles));
  }

  private buildArea(orderId: string, tiles: LandTile[]): LandArea {
    const me = this.session.identity;
    const first = tiles[0];
    const lat = tiles.reduce((s, t) => s + gridCenterLatLng(t.gx, t.gy).lat, 0) / tiles.length;
    const lng = tiles.reduce((s, t) => s + gridCenterLatLng(t.gx, t.gy).lng, 0) / tiles.length;
    const count = Math.max(tiles.length, first.order_tiles || 0);
    return {
      order_id: orderId,
      user_id: first.user_id,
      username: first.username,
      fullname: first.fullname,
      title: first.area_title || `${first.fullname || first.username}'s land`,
      slug: first.slug,
      three_words: first.three_words,
      custom_details: first.custom_details,
      embed_url: first.embed_url,
      custom_code: first.custom_code,
      image: tiles.find((t) => t.image)?.image || '',
      previous_image: first.previous_image,
      no_of_tiles: count,
      lat,
      lng,
      sale_price: first.sale_price,
      total_sale_value: Number((first.sale_price * count).toFixed(2)),
      on_sale: first.on_sale && first.sale_price > 0,
      promoted: first.promoted,
      views: first.views,
      created_at: first.created_at,
      is_mine: String(first.user_id) === me.id,
      draft: !!first.draft,
      official: !!first.official,
      tiles,
    };
  }

  private matchesExactly(a: LandArea, slug: string, raw: string): boolean {
    return (!!a.slug && a.slug === slug) || (!!a.three_words && a.three_words.toLowerCase() === raw) || a.order_id === raw;
  }

  private fromApi(raw: any): LandTile | null {
    const lat = Number(raw?.lat);
    const lng = Number(raw?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    // The server stores each square's NW corner rounded to 6 decimals (up to 5e-7 off),
    // so step ~1 m inside the square before converting; a square is ~190 m wide.
    const { gx, gy } = latLngToGrid(lat - 1e-5, lng + 1e-5);
    const snapped = gridToLatLng(gx, gy);
    let span: GridBounds | null = null;
    const rawSpan = typeof raw.span_bounds === 'string' ? this.tryParse(raw.span_bounds) : raw.span_bounds;
    if (isValidBounds(rawSpan)) {
      span = {
        minGx: Number(rawSpan.minGx),
        minGy: Number(rawSpan.minGy),
        maxGx: Number(rawSpan.maxGx),
        maxGy: Number(rawSpan.maxGy),
      };
    }
    return {
      gx,
      gy,
      lat: snapped.lat,
      lng: snapped.lng,
      order_id: String(raw.order_id ?? raw.area_id ?? raw.id),
      user_id: String(raw.user_id ?? ''),
      username: String(raw.username || 'citizen'),
      fullname: String(raw.fullname || raw.username || 'Citizen'),
      image: this.normalizeImage(raw.image),
      previous_image: this.normalizeImage(raw.previous_image),
      span_bounds: span,
      area_title: String(raw.area_title || ''),
      slug: String(raw.slug || ''),
      three_words: String(raw.three_words || gridToThreeWords(gx, gy)),
      custom_details: String(raw.custom_details || ''),
      embed_url: String(raw.embed_url || ''),
      custom_code: String(raw.custom_code || ''),
      on_sale: raw.on_sale === true || raw.on_sale === '1' || raw.sale_status === '1',
      sale_price: Number(raw.sale_price || 0),
      views: Number(raw.views || 0),
      promoted: !!raw.promoted,
      created_at: String(raw.created_at || ''),
      order_tiles: Number(raw.no_of_tiles) || undefined,
    };
  }

  /** The API returns a placeholder URL for tiles without artwork; treat it as "no image". */
  private normalizeImage(image: any): string {
    const s = String(image || '');
    if (!s || /placeholder\.png$/i.test(s)) return '';
    return s;
  }

  private tryParse(s: string): any {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Claiming (100 free squares, then $0.10/square/month)
  // ---------------------------------------------------------------------------

  async claim(points: GridPoint[], details: AreaDetails = {}): Promise<ActionResult & { claimed: GridPoint[] }> {
    const free = this.available(points);
    if (!free.length) {
      return { ok: false, message: 'Those squares are already owned.', claimed: [] };
    }
    const me = this.session.identity;
    const first = free[0];
    const span = free.length > 1 ? boundsOf(free) : null;
    const title = details.area_title?.trim() || `${me.fullname}'s land`;
    const slug = slugify(details.slug || `${me.username}-${first.gx}-${first.gy}`);
    const threeWords = details.three_words || gridToThreeWords(first.gx, first.gy);

    if (me.isGuest) {
      const freeLeft = FREE_TILE_QUOTA - this.ownedCount(me);
      if (free.length > freeLeft) {
        return {
          ok: false,
          needsAuth: true,
          message: `Guests can draft up to ${FREE_TILE_QUOTA} free squares. Verify your email to claim more.`,
          claimed: [],
        };
      }
      const orderId = `draft_${Date.now().toString(36)}`;
      const now = new Date().toISOString();
      for (const p of free) {
        const ll = gridToLatLng(p.gx, p.gy);
        this.drafts.set(gridKey(p.gx, p.gy), {
          gx: p.gx,
          gy: p.gy,
          lat: ll.lat,
          lng: ll.lng,
          order_id: orderId,
          user_id: me.id,
          username: me.username,
          fullname: me.fullname,
          image: '',
          previous_image: '',
          span_bounds: span,
          area_title: title,
          slug,
          three_words: threeWords,
          custom_details: details.custom_details || '',
          embed_url: '',
          custom_code: '',
          on_sale: false,
          sale_price: 0,
          views: 0,
          promoted: false,
          created_at: now,
          draft: true,
        });
      }
      this.saveDrafts();
      this.publish();
      return {
        ok: true,
        orderId,
        claimed: free,
        message: `Drafted ${free.length} free square${free.length > 1 ? 's' : ''}. Verify your email to save them.`,
      };
    }

    const res = await this.http.postAsync('ClaimTiles', {
      tiles: free.map((p) => gridToLatLng(p.gx, p.gy)),
      area_title: title,
      slug,
      three_words: threeWords,
      span_bounds: span,
      custom_details: details.custom_details || '',
    });
    this.refresh();
    if (res?.status === true) {
      this.announce(free);
      return {
        ok: true,
        claimed: free,
        orderId: String(res.data?.order_id || ''),
        paymentUrl: res.data?.url || null,
        message: res.data?.message || 'Land claimed.',
      };
    }
    return { ok: false, claimed: [], message: this.errorMessage(res, 'Could not claim those squares.') };
  }

  // ---------------------------------------------------------------------------
  // Personalising
  // ---------------------------------------------------------------------------

  /**
   * Puts one image on the selected squares. With `span`, the image is stretched
   * across the selection's bounding box so it reads as one big picture.
   */
  async setImage(points: GridPoint[], image: string, span = true): Promise<ActionResult> {
    const mine = this.ownedTiles(points);
    if (!mine.length) return { ok: false, message: 'Select squares you own first.' };
    const bounds = span && mine.length > 1 ? boundsOf(mine) : null;

    const drafts = mine.filter((t) => t.draft);
    for (const t of drafts) {
      this.drafts.set(gridKey(t.gx, t.gy), { ...t, previous_image: t.image || t.previous_image, image, span_bounds: bounds });
    }
    if (drafts.length) this.saveDrafts();

    const real = mine.filter((t) => !t.draft);
    let failed = '';
    for (const [orderId, tiles] of this.byOrder(real)) {
      const res = await this.http.postAsync('UpdateBoxImage', {
        order_id: orderId,
        image,
        tiles: tiles.map((t) => gridToLatLng(t.gx, t.gy)),
        span_bounds: bounds,
      });
      if (res?.status !== true) failed = this.errorMessage(res, 'Could not update image.');
      // Optimistic local update so the change shows immediately.
      for (const t of tiles) {
        this.server.set(gridKey(t.gx, t.gy), { ...t, previous_image: t.image || t.previous_image, image, span_bounds: bounds });
      }
    }
    this.publish();
    if (real.length) {
      this.announce(real);
      this.refresh();
    }
    if (failed) return { ok: false, message: failed };
    return {
      ok: true,
      message: mine.length > 1 && bounds ? `Image spread across ${mine.length} squares.` : 'Image updated.',
    };
  }

  async revertImage(points: GridPoint[]): Promise<ActionResult> {
    const mine = this.ownedTiles(points);
    if (!mine.length) return { ok: false, message: 'Select squares you own first.' };
    for (const t of mine.filter((x) => x.draft)) {
      this.drafts.set(gridKey(t.gx, t.gy), { ...t, image: t.previous_image || '', previous_image: '', span_bounds: null });
    }
    this.saveDrafts();
    const real = mine.filter((t) => !t.draft);
    for (const [orderId, tiles] of this.byOrder(real)) {
      await this.http.postAsync('RevertBoxImage', { order_id: orderId, tiles: tiles.map((t) => gridToLatLng(t.gx, t.gy)) });
    }
    this.publish();
    if (real.length) {
      this.announce(real);
      this.refresh();
    }
    return { ok: true, message: 'Reverted to the previous image.' };
  }

  /** Uploads an image file for tile artwork; returns its URL. Guests get a local data URL. */
  async uploadArtwork(file: File): Promise<{ ok: boolean; url?: string; message: string }> {
    if (file.size > 5 * 1024 * 1024) {
      return { ok: false, message: 'Images must be 5 MB or smaller.' };
    }
    if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type)) {
      return { ok: false, message: 'Use a PNG, JPG, GIF or WebP image.' };
    }
    if (this.session.isGuest) {
      const url = await this.readAsDataUrl(file);
      return { ok: true, url, message: 'Image ready. It will upload when you verify your email.' };
    }
    const res = await this.http.uploadAsync(file, 'UploadBoxesImage');
    if (res?.status === true && res.data?.url) {
      return { ok: true, url: res.data.url, message: 'Image uploaded.' };
    }
    return { ok: false, message: this.errorMessage(res, 'Upload failed.') };
  }

  async updateDetails(orderId: string, details: AreaDetails): Promise<ActionResult> {
    const clean: AreaDetails = { ...details };
    if (clean.slug !== undefined) clean.slug = slugify(clean.slug);
    if (clean.embed_url && !/^https:\/\//i.test(clean.embed_url)) {
      return { ok: false, message: 'Embed links must start with https://' };
    }
    if (clean.slug) {
      const clash = this.areas().find((a) => a.slug === clean.slug && a.order_id !== String(orderId));
      if (clash) return { ok: false, message: `flatmeta.io/u/${clean.slug} is already taken.` };
    }
    if (clean.sale_price !== undefined) clean.sale_price = Math.max(0, Number(clean.sale_price) || 0);

    const area = this.ownArea(orderId);
    if (!area) return { ok: false, message: 'You can only edit your own land.' };

    const apply = (t: LandTile): LandTile => ({
      ...t,
      area_title: clean.area_title ?? t.area_title,
      slug: clean.slug ?? t.slug,
      three_words: clean.three_words ?? t.three_words,
      custom_details: clean.custom_details ?? t.custom_details,
      embed_url: clean.embed_url ?? t.embed_url,
      custom_code: clean.custom_code ?? t.custom_code,
      on_sale: clean.on_sale ?? t.on_sale,
      sale_price: clean.sale_price ?? t.sale_price,
    });

    if (area.draft) {
      if (clean.on_sale) {
        return { ok: false, needsAuth: true, message: 'Verify your email before listing land for sale.' };
      }
      this.drafts.forEach((t, k) => t.order_id === area.order_id && this.drafts.set(k, apply(t)));
      this.saveDrafts();
      this.publish();
      return { ok: true, message: 'Saved on this device. Verify your email to keep it.' };
    }

    const res = await this.http.postAsync('UpdateCustomDetails', { order_id: orderId, ...clean });
    if (res?.status === true) {
      this.server.forEach((t, k) => t.order_id === area.order_id && this.server.set(k, apply(t)));
      this.mine = this.mine.map((a) => (a.order_id === area.order_id ? this.buildArea(a.order_id, a.tiles.map(apply)) : a));
      this.publish();
      this.announce(area.tiles);
      this.refresh();
      return { ok: true, message: 'Land details saved.' };
    }
    return { ok: false, message: this.errorMessage(res, 'Could not save details.') };
  }

  async release(orderId: string): Promise<ActionResult> {
    const area = this.ownArea(orderId);
    if (!area) return { ok: false, message: 'You can only release your own land.' };
    if (area.draft) {
      this.drafts.forEach((t, k) => t.order_id === area.order_id && this.drafts.delete(k));
      this.saveDrafts();
      this.publish();
      return { ok: true, message: 'Draft removed.' };
    }
    const res = await this.http.postAsync('ReleaseOrder', { order_id: orderId });
    if (res?.status === true) {
      this.server.forEach((t, k) => t.order_id === area.order_id && this.server.delete(k));
      this.mine = this.mine.filter((a) => a.order_id !== area.order_id);
      this.publish();
      this.announce(area.tiles);
      this.refresh();
      return { ok: true, message: 'Land released back to the open map.' };
    }
    this.refresh();
    return { ok: false, message: this.errorMessage(res, 'Could not release land.') };
  }

  /** Starts a marketplace purchase. Ownership moves once the PayPal checkout completes. */
  /** Sets up monthly rent for land past the free squares (e.g. land bought on the marketplace). */
  async startBilling(orderId: string): Promise<ActionResult> {
    const res = await this.http.postAsync('StartBilling', { order_id: orderId });
    if (res?.status === true) {
      return { ok: true, paymentUrl: res.data?.url || null, message: res.data?.message || 'Continue to PayPal.' };
    }
    return { ok: false, message: this.errorMessage(res, 'Could not start billing.') };
  }

  async buy(orderId: string): Promise<ActionResult> {
    if (this.session.isGuest) {
      return { ok: false, needsAuth: true, message: 'Verify your email to buy land.' };
    }
    const res = await this.http.postAsync('BuyMarketplaceOrder', { order_id: orderId });
    if (res?.status === true) {
      return { ok: true, paymentUrl: res.data?.url || null, message: res.data?.message || 'Continue to PayPal to pay.' };
    }
    return { ok: false, message: this.errorMessage(res, 'Could not start the purchase.') };
  }

  // ---------------------------------------------------------------------------
  // Guest drafts -> server, once the email is verified
  // ---------------------------------------------------------------------------

  async saveDraftsToServer(): Promise<ActionResult> {
    if (this.session.isGuest || !this.drafts.size) return { ok: true, message: '' };
    const me = this.session.identity;
    const groups = this.byOrder(Array.from(this.drafts.values()));
    let saved = 0;
    const savedTiles: LandTile[] = [];
    let lastPaymentUrl: string | null = null;
    const problems: string[] = [];

    for (const [, tiles] of groups) {
      const first = tiles[0];
      const res = await this.http.postAsync('ClaimTiles', {
        tiles: tiles.map((t) => gridToLatLng(t.gx, t.gy)),
        area_title: first.area_title.replace(/^Guest [A-Z0-9]+'s land$/, `${me.fullname}'s land`),
        slug: /^guest[-_]/.test(first.slug) ? slugify(`${me.username}-${first.gx}-${first.gy}`) : first.slug,
        three_words: first.three_words,
        span_bounds: first.span_bounds,
        custom_details: first.custom_details,
      });
      if (res?.status !== true) {
        problems.push(this.errorMessage(res, 'Some squares could not be saved.'));
        continue;
      }
      saved += tiles.length;
      savedTiles.push(...tiles);
      if (res.data?.url) lastPaymentUrl = res.data.url;
      const orderId = String(res.data?.order_id || '');
      const withImage = tiles.filter((t) => t.image);
      if (orderId && withImage.length) {
        const url = await this.persistImage(withImage[0].image);
        if (url) {
          await this.http.postAsync('UpdateBoxImage', {
            order_id: orderId,
            image: url,
            tiles: withImage.map((t) => gridToLatLng(t.gx, t.gy)),
            span_bounds: withImage[0].span_bounds,
          });
        }
      }
      tiles.forEach((t) => this.drafts.delete(gridKey(t.gx, t.gy)));
    }
    this.saveDrafts();
    this.publish();
    if (savedTiles.length) this.announce(savedTiles);
    this.refresh();
    return {
      ok: problems.length === 0,
      paymentUrl: lastPaymentUrl,
      message: problems.length ? problems[0] : `Saved ${saved} square${saved === 1 ? '' : 's'} to your account.`,
    };
  }

  private async persistImage(image: string): Promise<string | null> {
    if (/^https?:\/\//i.test(image)) return image;
    if (!image.startsWith('data:image/')) return null;
    try {
      const blob = await (await fetch(image)).blob();
      const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png';
      const file = new File([blob], `land.${ext}`, { type: blob.type });
      const res = await this.http.uploadAsync(file, 'UploadBoxesImage');
      return res?.status === true ? res.data?.url || null : null;
    } catch {
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private ownedTiles(points: GridPoint[]): LandTile[] {
    return points
      .map((p) => this.tileAt(p.gx, p.gy))
      .filter((t): t is LandTile => !!t && !t.official && this.isMine(t));
  }

  private ownedCount(me: Identity): number {
    let n = this.mine.reduce((s, a) => s + a.no_of_tiles, 0);
    this.drafts.forEach((t) => this.isMine(t, me) && n++);
    return n;
  }

  /** One of my areas (server or draft), wherever it is on the map. */
  private ownArea(orderId: string): LandArea | undefined {
    const id = String(orderId);
    const area =
      this.mine.find((a) => a.order_id === id) ||
      this.localAreas().find((a) => a.order_id === id) ||
      this.areas().find((a) => a.order_id === id);
    return area && !area.official && area.is_mine ? area : undefined;
  }

  /** Tells other clients which squares changed, so only those looking there reload. */
  private announce(points: GridPoint[]) {
    const b = boundsOf(points);
    if (b) this.presence.announceTilesChanged(gridBoundsToBox(b));
  }

  private byOrder(tiles: LandTile[]): Map<string, LandTile[]> {
    const m = new Map<string, LandTile[]>();
    tiles.forEach((t) => m.set(t.order_id, [...(m.get(t.order_id) || []), t]));
    return m;
  }

  private publish() {
    const all: LandTile[] = [];
    this.official.forEach((t) => all.push(t));
    this.server.forEach((t, k) => !this.official.has(k) && all.push(t));
    this.drafts.forEach((t, k) => !this.official.has(k) && !this.server.has(k) && all.push(t));
    this.tiles$.next(all);
    this.myAreas$.next([...this.mine, ...this.localAreas().filter((a) => a.draft && a.is_mine)]);
    this.stats$.next(this.computeStats());
  }

  /** From MyPlaces (all my server land, not just what is in view) plus my drafts. */
  private computeStats(): PortfolioStats {
    const me = this.session?.identity;
    const mine = this.mine || [];
    const draftTiles = me && this.drafts ? Array.from(this.drafts.values()).filter((t) => String(t.user_id) === me.id) : [];
    const owned = mine.reduce((s, a) => s + a.no_of_tiles, 0);
    const total = owned + draftTiles.length;
    const billable = Math.max(0, total - FREE_TILE_QUOTA);
    const worth =
      mine.reduce((s, a) => s + (a.on_sale ? a.total_sale_value : a.no_of_tiles * PRICE_PER_TILE_MONTH * 12), 0) +
      draftTiles.length * PRICE_PER_TILE_MONTH * 12;
    return {
      ownedTiles: owned,
      draftTiles: draftTiles.length,
      freeQuotaRemaining: Math.max(0, FREE_TILE_QUOTA - total),
      billableTiles: billable,
      monthlyUsd: Number((billable * PRICE_PER_TILE_MONTH).toFixed(2)),
      worthUsd: Number(worth.toFixed(2)),
      boughtUsd: this.ledger?.boughtUsd || 0,
      soldUsd: this.ledger?.soldUsd || 0,
      areas: mine.length + new Set(draftTiles.map((t) => t.order_id)).size,
      onSaleAreas: mine.filter((a) => a.on_sale).length,
    };
  }

  private loadDrafts() {
    try {
      const raw = localStorage.getItem(DRAFTS_KEY);
      const list: LandTile[] = raw ? JSON.parse(raw) : [];
      list.forEach((t) => {
        if (Number.isFinite(t.gx) && Number.isFinite(t.gy)) this.drafts.set(gridKey(t.gx, t.gy), { ...t, draft: true });
      });
    } catch {}
  }

  private saveDrafts() {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(Array.from(this.drafts.values())));
    } catch {
      // Storage full (large data-URL images): keep in memory for this visit.
    }
  }

  private readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  private errorMessage(res: any, fallback: string): string {
    return res?.data?.message || res?.message || fallback;
  }

  /**
   * FlatMeta Home: a 3x3 welcome plaza at our London HQ that explains the site,
   * as the brief asks ("the images there will explain the purpose of the site").
   */
  private buildOfficialPlaza() {
    const home = latLngToGrid(FLATMETA_HOME[0], FLATMETA_HOME[1]);
    const span: GridBounds = { minGx: home.gx - 1, minGy: home.gy - 1, maxGx: home.gx + 1, maxGy: home.gy + 1 };
    const image = 'assets/flatmeta-home.svg';
    for (let gx = span.minGx; gx <= span.maxGx; gx++) {
      for (let gy = span.minGy; gy <= span.maxGy; gy++) {
        const ll = gridToLatLng(gx, gy);
        this.official.set(gridKey(gx, gy), {
          gx,
          gy,
          lat: ll.lat,
          lng: ll.lng,
          order_id: 'flatmeta-home',
          user_id: 'flatmeta',
          username: 'flatmeta',
          fullname: 'FlatMeta',
          image,
          previous_image: '',
          span_bounds: span,
          area_title: 'FlatMeta Home',
          slug: 'flatmeta-home',
          three_words: 'flatmeta.welcome.home',
          custom_details:
            '<h4>Welcome to FlatMeta</h4><p>FlatMeta is an open, shared 2D world on top of the real map. Walk around with your avatar, chat with people nearby, and claim squares of land to make your own.</p><ul><li><strong>Move:</strong> tap or click anywhere on the map, drag your avatar, or use the arrow keys.</li><li><strong>Claim land:</strong> press <em>Buy Land</em>, tap squares, then <em>Claim</em>. Your first 100 squares are free.</li><li><strong>Personalise:</strong> select your squares and add an image, a title, a custom link like flatmeta.io/u/your-name, or your own HTML.</li><li><strong>Save:</strong> everything works straight away; verify your email when you want to keep it.</li></ul><p>FlatMeta is open source. Suggest features and send code on GitHub.</p>',
          embed_url: '',
          custom_code: '',
          on_sale: false,
          sale_price: 0,
          views: 0,
          promoted: true,
          created_at: '2022-04-01T00:00:00.000Z',
          official: true,
        });
      }
    }
  }
}


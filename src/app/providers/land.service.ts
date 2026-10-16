import { Injectable } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import {
  GridBounds,
  GridPoint,
  boundsOf,
  gridCenterLatLng,
  gridKey,
  gridToLatLng,
  gridToThreeWords,
  isValidBounds,
  latLngToGrid,
  slugify,
} from '../core/grid';
import { HttpService } from './http.service';
import { Identity, SessionService } from './session.service';

export const FREE_TILE_QUOTA = 100;
export const PRICE_PER_TILE_MONTH = 0.1;
export const PLATFORM_COMMISSION_RATE = 0.1;
export const FLATMETA_HOME: [number, number] = [51.50972, -0.104317];

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
  private server = new Map<string, LandTile>();
  private drafts = new Map<string, LandTile>();
  private official = new Map<string, LandTile>();
  private ledger = { boughtUsd: 0, soldUsd: 0 };
  private refresh$ = new Subject<void>();
  private loading = false;

  /** All tiles to draw: server + this guest's drafts + the official plaza. */
  readonly tiles$ = new BehaviorSubject<LandTile[]>([]);
  readonly stats$ = new BehaviorSubject<PortfolioStats>(this.computeStats());
  readonly loaded$ = new BehaviorSubject<boolean>(false);

  constructor(private http: HttpService, private session: SessionService) {
    this.buildOfficialPlaza();
    this.loadDrafts();
    this.publish();

    this.refresh$.pipe(debounceTime(250)).subscribe(() => this.fetchTiles());
    this.session.identity$.subscribe(() => this.publish());
    this.session.signedOut$.subscribe(() => this.refresh());
    this.refresh();
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

  areas(): LandArea[] {
    const me = this.session.identity;
    const groups = new Map<string, LandTile[]>();
    for (const t of this.tiles) {
      const list = groups.get(t.order_id) || [];
      list.push(t);
      groups.set(t.order_id, list);
    }
    const out: LandArea[] = [];
    groups.forEach((tiles, orderId) => {
      const first = tiles[0];
      const lat = tiles.reduce((s, t) => s + gridCenterLatLng(t.gx, t.gy).lat, 0) / tiles.length;
      const lng = tiles.reduce((s, t) => s + gridCenterLatLng(t.gx, t.gy).lng, 0) / tiles.length;
      out.push({
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
        no_of_tiles: tiles.length,
        lat,
        lng,
        sale_price: first.sale_price,
        total_sale_value: Number((first.sale_price * tiles.length).toFixed(2)),
        on_sale: first.on_sale && first.sale_price > 0,
        promoted: first.promoted,
        views: first.views,
        created_at: first.created_at,
        is_mine: String(first.user_id) === me.id,
        draft: !!first.draft,
        official: !!first.official,
        tiles,
      });
    });
    return out;
  }

  area(orderId: string): LandArea | undefined {
    return this.areas().find((a) => a.order_id === String(orderId));
  }

  myAreas(): LandArea[] {
    return this.areas().filter((a) => a.is_mine);
  }

  marketplace(filter: 'recent' | 'popular' | 'promoted' = 'recent'): LandArea[] {
    let list = this.areas().filter((a) => a.on_sale && !a.draft && !a.official);
    if (filter === 'promoted') {
      list = list.filter((a) => a.promoted);
    }
    if (filter === 'popular') {
      return list.sort((a, b) => b.views - a.views || b.no_of_tiles - a.no_of_tiles);
    }
    return list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
  }

  latest(limit = 30): LandArea[] {
    return this.areas()
      .filter((a) => !a.draft && !a.official)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .slice(0, limit);
  }

  /** Finds an area from a custom URL slug, 3-word address or order id. */
  findArea(query: string): LandArea | undefined {
    const q = slugify(query);
    const raw = String(query || '').trim().toLowerCase();
    if (!q && !raw) return undefined;
    return this.areas().find(
      (a) => (a.slug && a.slug === q) || (a.three_words && a.three_words.toLowerCase() === raw) || a.order_id === raw
    );
  }

  search(query: string): LandArea[] {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return [];
    return this.areas()
      .filter(
        (a) =>
          a.title.toLowerCase().includes(q) ||
          (a.slug || '').includes(slugify(q)) ||
          (a.three_words || '').includes(q) ||
          (a.username || '').toLowerCase().includes(q)
      )
      .slice(0, 8);
  }

  /** Is any of these squares already owned (by anyone)? */
  available(points: GridPoint[]): GridPoint[] {
    return points.filter((p) => !this.tileAt(p.gx, p.gy));
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  refresh() {
    this.refresh$.next();
  }

  private async fetchTiles() {
    if (this.loading) {
      // Another fetch is in flight; queue one more after it.
      setTimeout(() => this.refresh(), 400);
      return;
    }
    this.loading = true;
    try {
      const res = await this.http.getAsync('PurchasedTiles');
      if (res?.status === true && Array.isArray(res.data?.tiles)) {
        const next = new Map<string, LandTile>();
        for (const raw of res.data.tiles) {
          const tile = this.fromApi(raw);
          if (tile) next.set(gridKey(tile.gx, tile.gy), tile);
        }
        this.server = next;
        // A draft that someone else has meanwhile saved for real is no longer claimable.
        let changed = false;
        this.drafts.forEach((_, key) => {
          if (next.has(key)) {
            this.drafts.delete(key);
            changed = true;
          }
        });
        if (changed) this.saveDrafts();
        this.publish();
        this.loaded$.next(true);
      }
      if (!this.session.isGuest) {
        await this.fetchPortfolio();
      }
    } finally {
      this.loading = false;
    }
  }

  private async fetchPortfolio() {
    const res = await this.http.getAsync('MyPlaces');
    const p = res?.data?.portfolio;
    if (res?.status === true && p) {
      this.ledger = {
        boughtUsd: Number(p.bought_usd ?? p.total_bought_usd ?? 0),
        soldUsd: Number(p.sold_usd ?? p.total_sold_usd ?? 0),
      };
      this.stats$.next(this.computeStats());
    }
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
    if (real.length) this.refresh();
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
    for (const [orderId, tiles] of this.byOrder(mine.filter((t) => !t.draft))) {
      await this.http.postAsync('RevertBoxImage', { order_id: orderId, tiles: tiles.map((t) => gridToLatLng(t.gx, t.gy)) });
    }
    this.publish();
    this.refresh();
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

    const tiles = this.tiles.filter((t) => t.order_id === String(orderId));
    if (!tiles.length || !this.isMine(tiles[0])) return { ok: false, message: 'You can only edit your own land.' };

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

    if (tiles[0].draft) {
      if (clean.on_sale) {
        return { ok: false, needsAuth: true, message: 'Verify your email before listing land for sale.' };
      }
      tiles.forEach((t) => this.drafts.set(gridKey(t.gx, t.gy), apply(t)));
      this.saveDrafts();
      this.publish();
      return { ok: true, message: 'Saved on this device. Verify your email to keep it.' };
    }

    const res = await this.http.postAsync('UpdateCustomDetails', { order_id: orderId, ...clean });
    if (res?.status === true) {
      tiles.forEach((t) => this.server.set(gridKey(t.gx, t.gy), apply(t)));
      this.publish();
      this.refresh();
      return { ok: true, message: 'Land details saved.' };
    }
    return { ok: false, message: this.errorMessage(res, 'Could not save details.') };
  }

  async release(orderId: string): Promise<ActionResult> {
    const tiles = this.tiles.filter((t) => t.order_id === String(orderId));
    if (!tiles.length || !this.isMine(tiles[0])) return { ok: false, message: 'You can only release your own land.' };
    if (tiles[0].draft) {
      tiles.forEach((t) => this.drafts.delete(gridKey(t.gx, t.gy)));
      this.saveDrafts();
      this.publish();
      return { ok: true, message: 'Draft removed.' };
    }
    const res = await this.http.postAsync('ReleaseOrder', { order_id: orderId });
    this.refresh();
    if (res?.status === true) {
      tiles.forEach((t) => this.server.delete(gridKey(t.gx, t.gy)));
      this.publish();
      return { ok: true, message: 'Land released back to the open map.' };
    }
    return { ok: false, message: this.errorMessage(res, 'Could not release land.') };
  }

  /** Starts a marketplace purchase. Ownership moves once the PayPal checkout completes. */
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
    let n = 0;
    this.server.forEach((t) => this.isMine(t, me) && n++);
    this.drafts.forEach((t) => this.isMine(t, me) && n++);
    return n;
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
    this.stats$.next(this.computeStats());
  }

  private computeStats(): PortfolioStats {
    const me = this.session?.identity;
    const mine = me ? (this.tiles$?.value || []).filter((t) => !t.official && String(t.user_id) === me.id) : [];
    const owned = mine.filter((t) => !t.draft).length;
    const draftTiles = mine.length - owned;
    const total = mine.length;
    const billable = Math.max(0, total - FREE_TILE_QUOTA);
    const areaIds = new Set(mine.map((t) => t.order_id));
    const onSale = new Set(mine.filter((t) => t.on_sale && t.sale_price > 0).map((t) => t.order_id));
    const worth = mine.reduce((s, t) => s + (t.on_sale && t.sale_price > 0 ? t.sale_price : PRICE_PER_TILE_MONTH * 12), 0);
    return {
      ownedTiles: owned,
      draftTiles,
      freeQuotaRemaining: Math.max(0, FREE_TILE_QUOTA - total),
      billableTiles: billable,
      monthlyUsd: Number((billable * PRICE_PER_TILE_MONTH).toFixed(2)),
      worthUsd: Number(worth.toFixed(2)),
      boughtUsd: this.ledger?.boughtUsd || 0,
      soldUsd: this.ledger?.soldUsd || 0,
      areas: areaIds.size,
      onSaleAreas: onSale.size,
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
            '<h4>Welcome to FlatMeta</h4><p>FlatMeta is an open, shared 2D world on top of the real map. Walk around with your avatar, chat with people nearby, and claim squares of land to make your own.</p><ul><li><strong>Move:</strong> double-click the map, drag your avatar, or use the arrow keys.</li><li><strong>Claim land:</strong> press <em>Buy Land</em>, tap squares, then <em>Claim</em>. Your first 100 squares are free.</li><li><strong>Personalise:</strong> select your squares and add an image, a title, a custom link like flatmeta.io/u/your-name, or your own HTML.</li><li><strong>Save:</strong> everything works straight away; verify your email when you want to keep it.</li></ul><p>FlatMeta is open source. Suggest features and send code on GitHub.</p>',
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


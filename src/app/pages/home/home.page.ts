import { ChangeDetectorRef, Component, HostListener, NgZone, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { DomSanitizer, SafeHtml, SafeResourceUrl } from '@angular/platform-browser';
import { Geolocation } from '@capacitor/geolocation';
import { Subscription, combineLatest } from 'rxjs';
import * as Leaflet from 'leaflet';
import * as GeoSearch from 'leaflet-geosearch';
import DriftMarker from 'leaflet-drift-marker';

import { GridPoint, ZOOM_LEVELS, ALLOWED_ZOOMS, gridToLatLng, gridToThreeWords, latLngToGrid, snapToAllowedZoom } from 'src/app/core/grid';
import { avatarDataUrl } from 'src/app/core/avatar';
import { isHttpUrl } from 'src/app/core/html';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { EventsService } from 'src/app/providers/events.service';
import { SessionService, Identity } from 'src/app/providers/session.service';
import {
  LandService,
  LandArea,
  LandTile,
  PortfolioStats,
  FLATMETA_HOME,
  FREE_TILE_QUOTA,
  PRICE_PER_TILE_MONTH,
  PLATFORM_COMMISSION_RATE,
} from 'src/app/providers/land.service';
import { PresenceService, Citizen, ChatMessage, Conversation } from 'src/app/providers/presence.service';
import { PinsService, SavedPin } from 'src/app/providers/pins.service';
import { SettingsService, UserSettings } from 'src/app/providers/settings.service';
import { FriendsService } from 'src/app/providers/friends.service';
import { PaymentService } from 'src/app/providers/payment.service';
import { LandLayer } from './map/land-layer';
import { areaBadgeIcon, avatarIcon, citizenCard, ownCard, speechBubbleIcon } from './map/avatar-markers';
import { attachZoomSteps } from './map/zoom-steps';
import { environment } from 'src/environments/environment';

type SearchResult = {
  type: 'area' | 'pin' | 'place' | 'citizen';
  title: string;
  subtitle: string;
  lat: number;
  lng: number;
  zoom: number;
  orderId?: string;
};

const LAST_POSITION_KEY = 'flatmeta_last_position';
const geocoder = new GeoSearch.OpenStreetMapProvider();

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnDestroy {
  @ViewChild('mapEl', { static: true }) mapEl: ElementRef<HTMLElement>;
  @ViewChild('fileInput') fileInput: ElementRef<HTMLInputElement>;
  @ViewChild('chatScroll') chatScroll: ElementRef<HTMLElement>;

  readonly ZOOM = ZOOM_LEVELS;
  readonly FREE_TILE_QUOTA = FREE_TILE_QUOTA;
  readonly COMMISSION = PLATFORM_COMMISSION_RATE;
  readonly videoUrl = environment.howToVideoUrl;

  me: Identity;
  stats: PortfolioStats;
  settings: UserSettings;

  // Map
  private map: Leaflet.Map;
  private landLayer: LandLayer;
  private areaBadges: Leaflet.LayerGroup;
  private myMarker: any;
  private otherMarkers = new Map<string, any>();
  private bubbles = new Map<string, Leaflet.Marker>();
  private detachZoom: () => void;
  zoom: number = ZOOM_LEVELS.BUY;
  avatarOffScreen = false;

  // Land tools
  buyMode = false;
  scanMode = false;
  peekMap = false;
  newSelection: GridPoint[] = [];
  ownedSelection: LandTile[] = [];
  busy = false;

  // Welcome popup (OpenStreetMap-style, top left)
  showWelcome = true;

  // Artwork picker
  showArtwork = false;
  presets: Array<{ name: string; url: string; label: string }> = [];
  presetFilter = '';
  pickedImage = '';
  pasteUrl = '';
  spanImage = true;

  // Area editor
  showEditor = false;
  editor = {
    orderId: '',
    area_title: '',
    slug: '',
    three_words: '',
    custom_details: '',
    embed_url: '',
    custom_code: '',
    on_sale: false,
    sale_price: 1,
    tiles: 0,
  };

  // Area details popup
  inspected: LandArea | null = null;
  safeEmbedUrl: SafeResourceUrl | null = null;
  safeCode: SafeHtml | null = null;

  // Pins
  showPins = false;
  pins: SavedPin[] = [];
  newPinName = '';

  // Leaderboard
  showRanks = false;
  ranksTab: 'landowners' | 'clans' = 'landowners';
  ranks: { landowners: any[]; clans: any[] } = { landowners: [], clans: [] };

  // Search
  searchQuery = '';
  searchResults: SearchResult[] = [];
  showSearch = false;
  private searchTimer: any;

  // Chat (Hangouts-style dock)
  chatOpen = false;
  chatInput = '';
  conversations: Conversation[] = [];
  activeConversation = 'nearby';
  visibleMessages: ChatMessage[] = [];
  citizensNearby = 0;
  private allMessages: ChatMessage[] = [];

  // Report
  showReport = false;
  reportTarget: Citizen | null = null;
  reportReasons: Array<{ id: number | string; text: string }> = [
    { id: 1, text: 'Inappropriate avatar or land artwork' },
    { id: 2, text: 'Spam or abusive messages' },
    { id: 3, text: 'Impersonation' },
  ];

  private subs = new Subscription();
  private positionResolved = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private sanitizer: DomSanitizer,
    private zone: NgZone,
    private cdr: ChangeDetectorRef,
    private general: GeneralService,
    private http: HttpService,
    private events: EventsService,
    public session: SessionService,
    public land: LandService,
    public presence: PresenceService,
    public pinsService: PinsService,
    public settingsService: SettingsService,
    public friends: FriendsService,
    private payments: PaymentService
  ) {
    this.me = session.identity;
    this.stats = land.stats$.value;
    this.settings = settingsService.value;
    this.showWelcome = !this.settings.welcomeDismissed;
  }

  get isGuest() {
    return this.me.isGuest;
  }

  get claimPreview() {
    const free = Math.min(this.stats.freeQuotaRemaining, this.newSelection.length);
    const paid = this.newSelection.length - free;
    return { free, paid, monthly: Number((paid * PRICE_PER_TILE_MONTH).toFixed(2)) };
  }

  get filteredPresets() {
    const q = this.presetFilter.trim().toLowerCase();
    return q ? this.presets.filter((p) => p.label.toLowerCase().includes(q)) : this.presets;
  }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  ionViewDidEnter() {
    if (this.map) {
      this.map.invalidateSize();
      return;
    }
    this.createMap();
    this.bindStreams();
    this.loadPresets();
    this.loadReportReasons();
    // The same page serves every map URL, so react to each new link.
    this.subs.add(
      combineLatest([this.route.paramMap, this.route.queryParamMap]).subscribe(([p, q]) => this.handleDeepLink(p, q))
    );
  }

  ngOnDestroy() {
    this.subs.unsubscribe();
    this.detachZoom?.();
    this.map?.remove();
  }

  private bindStreams() {
    this.subs.add(
      this.session.identity$.subscribe((id) => {
        const changed = this.me.id !== id.id;
        this.me = id;
        this.drawMyAvatar();
        if (changed) {
          this.clearSelection();
          this.presence.moveTo(this.myPos().lat, this.myPos().lng);
        }
      })
    );
    this.subs.add(this.land.tiles$.subscribe(() => this.redrawLand()));
    this.subs.add(this.land.stats$.subscribe((s) => (this.stats = s)));
    this.subs.add(this.pinsService.pins$.subscribe((p) => (this.pins = p)));
    this.subs.add(
      this.settingsService.settings$.subscribe((s) => {
        const gridChanged = this.settings.showGridOnImages !== s.showGridOnImages;
        this.settings = s;
        this.syncCitizenVisibility();
        if (gridChanged) this.redrawLand();
      })
    );
    this.subs.add(this.presence.citizens$.subscribe((list) => this.drawCitizens(list)));
    this.subs.add(this.presence.bubble$.subscribe((b) => this.showBubble(b.userId, b.text, 4500)));
    this.subs.add(this.presence.typing$.subscribe((t) => this.showBubble(t.userId, t.text ? `✍️ ${t.text}` : '…', 2200, true)));
    this.subs.add(
      this.presence.conversations$.subscribe((c) => {
        this.conversations = c;
        if (!c.some((x) => x.id === this.activeConversation)) this.activeConversation = 'nearby';
      })
    );
    this.subs.add(
      this.presence.messages$.subscribe((m) => {
        this.allMessages = m;
        this.refreshVisibleMessages();
      })
    );
    this.subs.add(this.friends.friends$.subscribe(() => this.syncCitizenVisibility()));
    this.subs.add(this.events.receiveToHome().subscribe((go) => go && this.goFlatMetaHome()));
    this.subs.add(this.events.receiveToUser().subscribe((item) => item && this.goToLand(item)));
  }

  // ===========================================================================
  // Map setup, the three zoom levels and positioning
  // ===========================================================================

  private createMap() {
    const start = this.readLastPosition();
    this.map = Leaflet.map(this.mapEl.nativeElement, {
      center: [start.lat, start.lng],
      zoom: ZOOM_LEVELS.BUY,
      minZoom: ZOOM_LEVELS.PLANET,
      maxZoom: ZOOM_LEVELS.BUY,
      zoomSnap: 5,
      zoomDelta: 5,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomControl: false,
      worldCopyJump: true,
    });

    Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: ZOOM_LEVELS.BUY,
      minZoom: ZOOM_LEVELS.PLANET,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      className: 'fm-base-tiles',
    }).addTo(this.map);
    // Land gets its own pane above the street map so the dark-mode filter never touches artwork.
    this.map.createPane('fmLand').style.zIndex = '250';
    this.map.attributionControl.setPrefix('Buy / customise land | <a href="https://flatmeta.io">flatmeta.io</a>');

    this.landLayer = new LandLayer({
      tileAt: (gx, gy) => this.land.tileAt(gx, gy),
      isMine: (t) => this.land.isMine(t, this.me),
      isSelectedNew: (gx, gy) => this.newSelection.some((p) => p.gx === gx && p.gy === gy),
      isSelectedOwned: (gx, gy) => this.ownedSelection.some((p) => p.gx === gx && p.gy === gy),
      mode: () => ({ buyGrid: this.buyMode, scan: this.scanMode, showGridOnImages: this.settings.showGridOnImages }),
    });
    this.landLayer.layer.addTo(this.map);
    this.areaBadges = Leaflet.layerGroup().addTo(this.map);

    this.drawMyAvatar(start.lat, start.lng);
    this.presence.moveTo(start.lat, start.lng);
    this.detachZoom = attachZoomSteps(this.map, (dir) => this.zone.run(() => this.stepZoom(dir)));

    this.map.on('zoomend', () =>
      this.zone.run(() => {
        this.zoom = snapToAllowedZoom(this.map.getZoom());
        if (this.zoom !== ZOOM_LEVELS.BUY) {
          this.buyMode = false;
          this.newSelection = [];
        }
        this.redrawBadges();
        this.syncCitizenVisibility();
        this.checkAvatarOnScreen();
      })
    );
    this.map.on('moveend', () =>
      this.zone.run(() => {
        this.checkAvatarOnScreen();
        this.reportView();
      })
    );
    this.map.on('click', (e: Leaflet.LeafletMouseEvent) => this.zone.run(() => this.onMapClick(e)));
    // Double-click also walks there, which still works while Buy mode uses single taps for squares.
    this.map.on('dblclick', (e: Leaflet.LeafletMouseEvent) => this.zone.run(() => this.walkTo(e.latlng.lat, e.latlng.lng)));
    this.map.on('contextmenu', (e: Leaflet.LeafletMouseEvent) => this.zone.run(() => this.inspectAt(e.latlng)));

    this.redrawBadges();
    this.reportView();
    if (!this.hasStartOverride()) this.locateOnFirstVisit();
    setTimeout(() => this.map.invalidateSize(), 200);
  }

  /** LandService loads only the land around what the map shows. */
  private reportView() {
    if (!this.map) return;
    const b = this.map.getBounds();
    this.land.setView(
      { minLat: b.getSouth(), minLng: b.getWest(), maxLat: b.getNorth(), maxLng: b.getEast() },
      snapToAllowedZoom(this.map.getZoom())
    );
  }

  stepZoom(direction: 1 | -1) {
    const idx = ALLOWED_ZOOMS.indexOf(this.zoom as any);
    this.setZoom(ALLOWED_ZOOMS[Math.max(0, Math.min(ALLOWED_ZOOMS.length - 1, idx + direction))]);
  }

  /** Zooming always centres on the avatar, so the map never jumps elsewhere. */
  setZoom(level: number) {
    if (!this.map) return;
    const target = snapToAllowedZoom(level);
    this.map.setView(this.myMarker ? this.myMarker.getLatLng() : this.map.getCenter(), target, { animate: true });
  }

  private myPos(): { lat: number; lng: number } {
    if (this.myMarker) {
      const p = this.myMarker.getLatLng();
      return { lat: p.lat, lng: p.lng };
    }
    return this.readLastPosition();
  }

  private readLastPosition(): { lat: number; lng: number } {
    try {
      const p = JSON.parse(localStorage.getItem(LAST_POSITION_KEY) || 'null');
      if (p && Number.isFinite(p.lat) && Number.isFinite(p.lng)) return p;
    } catch {}
    return { lat: FLATMETA_HOME[0], lng: FLATMETA_HOME[1] };
  }

  private savePosition(lat: number, lng: number) {
    try {
      localStorage.setItem(LAST_POSITION_KEY, JSON.stringify({ lat, lng }));
    } catch {}
  }

  /** First visit: go to the visitor's real location (GPS, else country by IP). */
  private async locateOnFirstVisit() {
    if (localStorage.getItem(LAST_POSITION_KEY)) return;
    const pos = await this.realWorldPosition(false);
    if (pos && !this.positionResolved) {
      this.flyTo(pos.lat, pos.lng, ZOOM_LEVELS.BUY, true);
    }
  }

  private async realWorldPosition(precise: boolean): Promise<{ lat: number; lng: number; label?: string } | null> {
    try {
      const p = await Geolocation.getCurrentPosition({ enableHighAccuracy: precise, timeout: precise ? 6000 : 4000 });
      if (p?.coords) return { lat: p.coords.latitude, lng: p.coords.longitude, label: 'your location' };
    } catch {}
    // No GPS: fall back to the visitor's country/city from their IP address.
    const providers: Array<[string, (d: any) => { lat: number; lng: number; label: string }]> = [
      ['https://get.geojs.io/v1/ip/geo.json', (d) => ({ lat: Number(d.latitude), lng: Number(d.longitude), label: d.city || d.country })],
      ['https://ipapi.co/json/', (d) => ({ lat: Number(d.latitude), lng: Number(d.longitude), label: d.city || d.country_name })],
    ];
    for (const [url, map] of providers) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const pos = map(await res.json());
        if (Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) return { ...pos, label: pos.label || 'your area' };
      } catch {}
    }
    return null;
  }

  /** HOME: move the avatar and map to my real-world location (or my country by IP). */
  async goMyLocation() {
    const pos = await this.realWorldPosition(true);
    if (!pos) {
      this.general.presentToast("Couldn't find your location. Check location permissions.");
      return;
    }
    this.flyTo(pos.lat, pos.lng, ZOOM_LEVELS.BUY, true);
    this.general.presentToast(`Moved to ${pos.label}.`);
  }

  goFlatMetaHome() {
    this.flyTo(FLATMETA_HOME[0], FLATMETA_HOME[1], ZOOM_LEVELS.BUY, true);
    const home = this.land.area('flatmeta-home');
    if (home) setTimeout(() => this.openArea(home), 900);
  }

  /** LOCATE: bring the map back to my avatar. */
  locateAvatar() {
    if (!this.myMarker) return;
    this.map.flyTo(this.myMarker.getLatLng(), this.zoom === ZOOM_LEVELS.PLANET ? ZOOM_LEVELS.ROAM : this.zoom, { duration: 0.6 });
    this.showBubble(this.me.id, 'Here I am!', 1800);
  }

  flyTo(lat: number, lng: number, zoom: number, moveAvatar: boolean) {
    if (!this.map) return;
    this.positionResolved = true;
    this.map.flyTo([lat, lng], snapToAllowedZoom(zoom), { duration: 0.8 });
    if (moveAvatar) this.placeAvatar(lat, lng, true);
  }

  private walkTo(lat: number, lng: number) {
    this.placeAvatar(lat, lng, true);
  }

  private placeAvatar(lat: number, lng: number, animate: boolean) {
    if (!this.myMarker) {
      this.drawMyAvatar(lat, lng);
    } else if (animate && this.myMarker.slideTo) {
      this.myMarker.slideTo([lat, lng], { duration: 700 });
    } else {
      this.myMarker.setLatLng([lat, lng]);
    }
    this.savePosition(lat, lng);
    this.presence.moveTo(lat, lng);
    setTimeout(() => this.checkAvatarOnScreen(), 750);
  }

  private checkAvatarOnScreen() {
    if (!this.map || !this.myMarker) return;
    this.avatarOffScreen = !this.map.getBounds().contains(this.myMarker.getLatLng());
  }

  /** Arrow keys / WASD walk the avatar (like gather.town). */
  @HostListener('window:keydown', ['$event'])
  onKey(e: KeyboardEvent) {
    if (!this.map || !this.myMarker) return;
    const target = e.target as HTMLElement;
    if (target && (/^(input|textarea|select)$/i.test(target.tagName) || target.isContentEditable)) return;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [1, 0], w: [1, 0], W: [1, 0],
      ArrowDown: [-1, 0], s: [-1, 0], S: [-1, 0],
      ArrowLeft: [0, -1], a: [0, -1], A: [0, -1],
      ArrowRight: [0, 1], d: [0, 1], D: [0, 1],
    };
    const m = moves[e.key];
    if (!m) return;
    e.preventDefault();
    const step = this.zoom === ZOOM_LEVELS.BUY ? 0.0004 : this.zoom === ZOOM_LEVELS.ROAM ? 0.01 : 0.3;
    const p = this.myMarker.getLatLng();
    const next = Leaflet.latLng(p.lat + m[0] * step, p.lng + m[1] * step * 1.4);
    this.placeAvatar(next.lat, next.lng, true);
    if (!this.map.getBounds().pad(-0.15).contains(next)) this.map.panTo(next, { animate: true, duration: 0.25 });
  }

  // ===========================================================================
  // Deep links: /u/:slug, /uri/:slug, /:slug, /at/lat,lng,zoom, /p/:pinId
  // ===========================================================================

  private hasStartOverride(): boolean {
    const p = this.route.snapshot.paramMap;
    return !!(p.get('slug') || p.get('coords') || p.get('pinId') || this.route.snapshot.queryParamMap.get('lat'));
  }

  private handleDeepLink(p: ParamMap, q: ParamMap) {
    const coords = p.get('coords') || q.get('at') || (q.get('lat') && q.get('lng') ? `${q.get('lat')},${q.get('lng')}` : null);
    if (coords) {
      const [lat, lng, z] = coords.replace(/^@/, '').split(',').map(Number);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        this.flyTo(lat, lng, Number.isFinite(z) ? z : ZOOM_LEVELS.BUY, true);
        const name = q.get('name');
        if (name) this.general.presentToast(`📍 ${name.slice(0, 60)}`);
      }
      return;
    }
    const pinId = p.get('pinId');
    if (pinId) {
      const pin = this.pinsService.find(pinId);
      if (pin) this.flyTo(pin.lat, pin.lng, pin.zoom, true);
      else this.general.presentToast('That pin is not saved on this device.');
      return;
    }
    const slug = p.get('slug') || q.get('u') || q.get('area');
    if (!slug) return;
    if (/^(flatmeta-)?home$/i.test(slug)) {
      this.goFlatMetaHome();
      return;
    }
    this.land.findAreaRemote(slug).then((area) => {
      if (!area) {
        this.general.presentToast(`No land found at flatmeta.io/u/${slug}`);
        return;
      }
      this.flyTo(area.lat, area.lng, ZOOM_LEVELS.BUY, true);
      setTimeout(() => this.openArea(area), 900);
    });
  }

  // ===========================================================================
  // Land: drawing, selecting, claiming, personalising
  // ===========================================================================

  private redrawLand() {
    this.landLayer?.redraw();
    this.redrawBadges();
    // Keep the owned selection in sync with fresh data (e.g. after a save).
    if (this.ownedSelection.length) {
      this.ownedSelection = this.ownedSelection
        .map((t) => this.land.tileAt(t.gx, t.gy))
        .filter((t): t is LandTile => !!t && this.land.isMine(t, this.me));
    }
    this.cdr.markForCheck();
  }

  /** "When zoomed out should be able to see the newly added squares." */
  private redrawBadges() {
    if (!this.areaBadges) return;
    this.areaBadges.clearLayers();
    if (this.zoom === ZOOM_LEVELS.BUY) return;
    const size = this.zoom === ZOOM_LEVELS.ROAM ? 38 : 26;
    for (const area of this.land.badges()) {
      const m = Leaflet.marker([area.lat, area.lng], {
        icon: areaBadgeIcon({ image: area.image, title: area.title, tiles: area.no_of_tiles, onSale: area.on_sale, size }),
        keyboard: false,
      });
      m.on('click', () =>
        this.zone.run(() => {
          this.flyTo(area.lat, area.lng, ZOOM_LEVELS.BUY, false);
          // A badge only has the summary; fetch the whole area for the details popup.
          this.openAreaById(area.order_id);
        })
      );
      this.areaBadges.addLayer(m);
    }
  }

  toggleBuyMode() {
    if (this.zoom !== ZOOM_LEVELS.BUY) {
      this.setZoom(ZOOM_LEVELS.BUY);
      this.buyMode = true;
    } else {
      this.buyMode = !this.buyMode;
    }
    if (!this.buyMode) this.newSelection = [];
    this.ownedSelection = [];
    this.landLayer.redraw();
    if (this.buyMode) this.general.presentToast('Tap free squares to select them, then press Claim.', 2500);
  }

  toggleScan() {
    this.scanMode = !this.scanMode;
    this.landLayer.redraw();
  }

  togglePeek() {
    this.peekMap = !this.peekMap;
    this.landLayer.setOpacity(this.peekMap ? 0.25 : 1);
  }

  /**
   * Click / tap on the map: your avatar walks there. At the Land level a tap on
   * your own square selects it for editing instead, a tap on someone else's land
   * also opens its details, and in Buy mode taps pick free squares.
   */
  private onMapClick(e: Leaflet.LeafletMouseEvent) {
    this.showSearch = false;
    if (this.zoom !== ZOOM_LEVELS.BUY) {
      this.walkTo(e.latlng.lat, e.latlng.lng);
      return;
    }
    const { gx, gy } = latLngToGrid(e.latlng.lat, e.latlng.lng);
    const tile = this.land.tileAt(gx, gy);

    if (tile) {
      if (this.land.isMine(tile, this.me) && !this.scanMode) {
        this.newSelection = [];
        const idx = this.ownedSelection.findIndex((t) => t.gx === gx && t.gy === gy);
        if (idx > -1) this.ownedSelection.splice(idx, 1);
        else this.ownedSelection.push(tile);
        this.ownedSelection = [...this.ownedSelection];
      } else {
        this.walkTo(e.latlng.lat, e.latlng.lng);
        const area = this.land.area(tile.order_id);
        if (area) this.openArea(area);
      }
      this.landLayer.redraw();
      return;
    }

    if (!this.buyMode) {
      this.walkTo(e.latlng.lat, e.latlng.lng);
      return;
    }
    this.ownedSelection = [];
    const idx = this.newSelection.findIndex((p) => p.gx === gx && p.gy === gy);
    if (idx > -1) this.newSelection.splice(idx, 1);
    else this.newSelection.push({ gx, gy });
    this.newSelection = [...this.newSelection];
    this.landLayer.redraw();
  }

  private inspectAt(latlng: Leaflet.LatLng) {
    const { gx, gy } = latLngToGrid(latlng.lat, latlng.lng);
    const tile = this.land.tileAt(gx, gy);
    const area = tile && this.land.area(tile.order_id);
    if (area) this.openArea(area);
  }

  /** Quick 2x2 / 3x3 block under the avatar: the easiest way to start on mobile. */
  selectBlock(size: 2 | 3) {
    if (this.zoom !== ZOOM_LEVELS.BUY) this.setZoom(ZOOM_LEVELS.BUY);
    this.buyMode = true;
    this.ownedSelection = [];
    const { gx, gy } = latLngToGrid(this.myPos().lat, this.myPos().lng);
    const offset = size === 3 ? -1 : 0;
    const block: GridPoint[] = [];
    for (let dx = offset; dx < offset + size; dx++) {
      for (let dy = offset; dy < offset + size; dy++) block.push({ gx: gx + dx, gy: gy + dy });
    }
    this.newSelection = this.land.available(block);
    this.landLayer.redraw();
    if (!this.newSelection.length) {
      this.general.presentToast('The squares under your avatar are taken. Walk to an open spot.');
    }
  }

  selectWholeArea() {
    const first = this.ownedSelection[0];
    if (!first) return;
    this.ownedSelection = this.land.tiles.filter((t) => t.order_id === first.order_id && this.land.isMine(t, this.me));
    this.landLayer.redraw();
  }

  clearSelection() {
    this.newSelection = [];
    this.ownedSelection = [];
    this.landLayer?.redraw();
  }

  async claimSelection() {
    if (!this.newSelection.length || this.busy) return;
    this.busy = true;
    const res = await this.land.claim(this.newSelection);
    this.busy = false;
    if (!res.ok) {
      this.general.presentToast(res.message);
      if (res.needsAuth) this.session.requestAuth('Verify your email to claim more than 100 squares.');
      return;
    }
    this.newSelection = [];
    this.buyMode = false;
    if (res.paymentUrl) {
      this.general.presentToast(res.message, 4000);
      this.openPayment(res.paymentUrl);
      return;
    }
    // Select what was just claimed so the user can add an image straight away.
    setTimeout(() => {
      this.ownedSelection = res.claimed.map((p) => this.land.tileAt(p.gx, p.gy)).filter((t): t is LandTile => !!t);
      this.landLayer.redraw();
    }, 400);
    this.general.presentToast(res.message, 3500);
  }

  // --- Artwork ---------------------------------------------------------------

  openArtwork() {
    this.pickedImage = '';
    this.pasteUrl = '';
    this.spanImage = this.ownedSelection.length > 1;
    this.showArtwork = true;
  }

  chooseFile() {
    this.fileInput?.nativeElement.click();
  }

  async onFileChosen(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy = true;
    const res = await this.land.uploadArtwork(file);
    this.busy = false;
    if (res.ok && res.url) this.pickedImage = res.url;
    this.general.presentToast(res.message);
  }

  usePastedUrl() {
    if (!isHttpUrl(this.pasteUrl)) {
      this.general.presentToast('Paste a full image link starting with https://');
      return;
    }
    this.pickedImage = this.pasteUrl.trim();
  }

  async applyArtwork() {
    if (!this.pickedImage || !this.ownedSelection.length) return;
    this.busy = true;
    const res = await this.land.setImage(this.ownedSelection, this.pickedImage, this.spanImage);
    this.busy = false;
    this.general.presentToast(res.message);
    if (res.ok) this.showArtwork = false;
  }

  async revertArtwork() {
    if (!this.ownedSelection.length) return;
    const res = await this.land.revertImage(this.ownedSelection);
    this.general.presentToast(res.message);
    this.showArtwork = false;
  }

  // --- Details, custom URL, code, selling -----------------------------------

  openEditor() {
    const first = this.ownedSelection[0];
    if (!first) return;
    const area = this.land.area(first.order_id);
    if (!area) return;
    this.editor = {
      orderId: area.order_id,
      area_title: area.title,
      slug: area.slug,
      three_words: area.three_words || gridToThreeWords(first.gx, first.gy),
      custom_details: area.custom_details,
      embed_url: area.embed_url,
      custom_code: area.custom_code,
      on_sale: area.on_sale,
      sale_price: area.sale_price || 1,
      tiles: area.no_of_tiles,
    };
    this.showEditor = true;
  }

  async saveEditor() {
    this.busy = true;
    const { orderId, tiles, ...details } = this.editor;
    const res = await this.land.updateDetails(orderId, details);
    this.busy = false;
    this.general.presentToast(res.message);
    if (res.needsAuth) this.session.requestAuth('Verify your email to list land for sale.');
    if (res.ok) this.showEditor = false;
  }

  applyCodeTemplate(kind: 'counter' | 'banner') {
    const title = (this.editor.area_title || 'my land').replace(/[<>&"']/g, '');
    this.editor.custom_code =
      kind === 'counter'
        ? `<div style="font-family:sans-serif;padding:12px;text-align:center">\n  <p>Welcome to ${title}!</p>\n  <button onclick="c.textContent=+c.textContent+1">👋 High five (<span id="c">0</span>)</button>\n</div>`
        : `<div style="font-family:sans-serif;padding:14px;text-align:center;background:linear-gradient(135deg,#2e1065,#7c3aed);color:#fff;border-radius:10px">\n  <h3 style="margin:0">${title}</h3>\n</div>`;
  }

  shareSelection() {
    const first = this.ownedSelection[0];
    const area = first && this.land.area(first.order_id);
    if (area) this.copyLink(area.slug ? `u/${area.slug}` : this.positionPath(area.lat, area.lng), 'Land link');
  }

  // --- Area details popup ---------------------------------------------------

  openArea(area: LandArea) {
    this.inspected = area;
    this.safeEmbedUrl = /^https:\/\//i.test(area.embed_url || '') ? this.sanitizer.bypassSecurityTrustResourceUrl(area.embed_url) : null;
    // Owner code only ever runs inside a sandboxed iframe with no access to our origin.
    this.safeCode = area.custom_code?.trim() ? this.sanitizer.bypassSecurityTrustHtml(area.custom_code) : null;
  }

  /** Opens the details popup for an area that may not be loaded on the map. */
  private async openAreaById(orderId: string) {
    const area = await this.land.loadArea(orderId);
    if (area) this.zone.run(() => this.openArea(area));
  }

  closeArea() {
    this.inspected = null;
    this.safeEmbedUrl = null;
    this.safeCode = null;
  }

  async buyInspected() {
    const area = this.inspected;
    if (!area || this.busy) return;
    this.busy = true;
    const res = await this.land.buy(area.order_id);
    this.busy = false;
    if (res.needsAuth) {
      this.session.requestAuth('Verify your email to buy land.');
      return;
    }
    this.general.presentToast(res.message);
    if (res.ok && res.paymentUrl) this.openPayment(res.paymentUrl);
  }

  areaLink(area: LandArea): string {
    return area.slug ? `u/${area.slug}` : this.positionPath(area.lat, area.lng);
  }

  // ===========================================================================
  // Avatars
  // ===========================================================================

  private drawMyAvatar(lat?: number, lng?: number) {
    if (!this.map) return;
    const pos = lat !== undefined && lng !== undefined ? { lat, lng } : this.myPos();
    const icon = avatarIcon({
      image: avatarDataUrl(this.me.avatarConfig, this.presence.expression),
      username: this.me.username,
      fullname: this.me.fullname,
      own: true,
      guest: this.me.isGuest,
    });
    if (this.myMarker) {
      this.myMarker.setIcon(icon);
      this.myMarker.setPopupContent(this.buildOwnCard());
      return;
    }
    this.myMarker = new (DriftMarker as any)([pos.lat, pos.lng], { draggable: true, icon, zIndexOffset: 1000, keyboard: false })
      .bindPopup(this.buildOwnCard(), { maxWidth: 280, className: 'fm-popup' })
      .addTo(this.map);
    // Dragging the avatar moves it without moving the map.
    this.myMarker.on('dragend', () =>
      this.zone.run(() => {
        const p = this.myMarker.getLatLng();
        this.placeAvatar(p.lat, p.lng, false);
      })
    );
  }

  private buildOwnCard() {
    return ownCard(this.me, {
      save: () => this.zone.run(() => {
        this.map.closePopup();
        this.session.requestAuth('Save your land and avatar with just your email.');
      }),
      avatar: () => this.zone.run(() => {
        this.map.closePopup();
        this.router.navigateByUrl('/profile');
      }),
    });
  }

  private drawCitizens(list: Citizen[]) {
    if (!this.map) return;
    const seen = new Set<string>();
    const placed: Leaflet.LatLng[] = [this.myMarker?.getLatLng()].filter(Boolean);
    for (const c of list) {
      seen.add(c.id);
      const pos = this.fanOut(Leaflet.latLng(c.lat, c.lng), placed);
      placed.push(pos);
      let marker = this.otherMarkers.get(c.id);
      const icon = avatarIcon({ image: c.avatarUrl, username: c.username, fullname: c.fullname, own: false, guest: c.isGuest });
      if (!marker) {
        marker = new (DriftMarker as any)(pos, { icon, keyboard: false }).addTo(this.map);
        marker.bindPopup(() => this.buildCitizenCard(c.id), { maxWidth: 280, className: 'fm-popup' });
        this.otherMarkers.set(c.id, marker);
      } else {
        marker.setIcon(icon);
        if (marker.slideTo) marker.slideTo(pos, { duration: 700 });
        else marker.setLatLng(pos);
      }
    }
    this.otherMarkers.forEach((m, id) => {
      if (!seen.has(id)) {
        m.remove();
        this.otherMarkers.delete(id);
        this.bubbles.get(id)?.remove();
        this.bubbles.delete(id);
      }
    });
    this.syncCitizenVisibility();
  }

  /** "Many avatars on the same place should not overlap": spiral them out. */
  private fanOut(pos: Leaflet.LatLng, placed: Leaflet.LatLng[]): Leaflet.LatLng {
    if (!this.map) return pos;
    const minPx = 66;
    const p0 = this.map.latLngToLayerPoint(pos);
    for (let i = 0; i < 60; i++) {
      const angle = i * 2.39996;
      const r = i === 0 ? 0 : minPx * Math.sqrt(i) * 0.75;
      const candidate = Leaflet.point(p0.x + r * Math.cos(angle), p0.y + r * Math.sin(angle));
      if (placed.every((q) => this.map.latLngToLayerPoint(q).distanceTo(candidate) >= minPx)) {
        return i === 0 ? pos : this.map.layerPointToLatLng(candidate);
      }
    }
    return pos;
  }

  private buildCitizenCard(id: string): HTMLElement {
    const c = this.presence.citizens$.value.find((x) => x.id === id);
    if (!c) return document.createElement('div');
    return citizenCard(
      c,
      { friend: this.friends.isFriend(c.id), requested: this.friends.isRequested(c.id), canReport: !this.me.isGuest && !c.isGuest },
      {
        chat: () => this.zone.run(() => {
          this.map.closePopup();
          this.presence.openDirect(c);
          this.openChat(c.id);
        }),
        connect: () => this.zone.run(async () => {
          this.map.closePopup();
          const res = await this.friends.sendRequest(c.id);
          this.general.presentToast(res.message);
          if (res.needsAuth) this.session.requestAuth('Verify your email to add connections.');
        }),
        report: () => this.zone.run(() => {
          this.map.closePopup();
          this.reportTarget = c;
          this.showReport = true;
        }),
      }
    );
  }

  /** Hidden on the planet view, and filtered by the "show avatars" setting. */
  private syncCitizenVisibility() {
    if (!this.map) return;
    const vis = this.settings.avatarVisibility;
    const zoomOk = this.zoom >= ZOOM_LEVELS.ROAM;
    const ownEl = this.myMarker?.getElement?.();
    if (ownEl) ownEl.style.display = zoomOk ? '' : 'none';
    let count = 0;
    this.otherMarkers.forEach((m, id) => {
      const show = zoomOk && (vis === 'all' || (vis === 'friends' && this.friends.isFriend(id)));
      const el = m.getElement?.();
      if (el) el.style.display = show ? '' : 'none';
      if (show) count++;
    });
    this.citizensNearby = count;
  }

  private showBubble(userId: string, text: string, ms: number, typing = false) {
    if (!this.map || !text) return;
    const marker = userId === this.me.id ? this.myMarker : this.otherMarkers.get(userId);
    if (!marker) return;
    if (userId === this.me.id && !typing) this.drawMyAvatar();
    this.bubbles.get(userId)?.remove();
    const bubble = Leaflet.marker(marker.getLatLng(), { icon: speechBubbleIcon(text.slice(0, 140), typing), interactive: false, keyboard: false }).addTo(this.map);
    this.bubbles.set(userId, bubble);
    setTimeout(() => {
      if (this.bubbles.get(userId) === bubble) {
        bubble.remove();
        this.bubbles.delete(userId);
      }
    }, ms);
  }

  // ===========================================================================
  // Chat dock
  // ===========================================================================

  openChat(conversation = this.activeConversation) {
    this.chatOpen = true;
    this.selectConversation(conversation);
  }

  toggleChat() {
    this.chatOpen ? (this.chatOpen = false) : this.openChat();
  }

  selectConversation(id: string) {
    this.activeConversation = id;
    this.presence.setActiveConversation(id);
    this.refreshVisibleMessages();
  }

  closeConversation(id: string, e?: Event) {
    e?.stopPropagation();
    this.presence.closeConversation(id);
    this.selectConversation('nearby');
  }

  get unreadTotal(): number {
    return this.conversations.reduce((s, c) => s + c.unread, 0);
  }

  onChatInput() {
    this.presence.typing(this.chatInput);
    this.drawMyAvatar();
  }

  sendChat() {
    if (this.presence.send(this.chatInput, this.activeConversation)) {
      this.chatInput = '';
      this.drawMyAvatar();
    }
  }

  private refreshVisibleMessages() {
    this.visibleMessages = this.allMessages.filter((m) => m.conversation === this.activeConversation);
    setTimeout(() => {
      const el = this.chatScroll?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 30);
  }

  toggleChatScope() {
    const next = this.settings.chatScope === 'everyone' ? 'friends' : 'everyone';
    this.settingsService.update({ chatScope: next });
    this.general.presentToast(next === 'everyone' ? 'Chat: everyone nearby' : 'Chat: connections only');
  }

  cycleAvatarVisibility() {
    const order: UserSettings['avatarVisibility'][] = ['all', 'friends', 'none'];
    const next = order[(order.indexOf(this.settings.avatarVisibility) + 1) % order.length];
    this.settingsService.update({ avatarVisibility: next });
    this.general.presentToast(next === 'all' ? 'Showing all avatars' : next === 'friends' ? 'Showing connections only' : 'Other avatars hidden');
  }

  // ===========================================================================
  // Search: places, custom land URLs, 3-word addresses, pins, people online
  // ===========================================================================

  onSearchInput() {
    const q = this.searchQuery.trim();
    clearTimeout(this.searchTimer);
    if (!q) {
      this.searchResults = [];
      this.showSearch = false;
      return;
    }
    const lower = q.toLowerCase();
    const areaResult = (a: LandArea): SearchResult => ({
      type: 'area',
      title: a.title,
      subtitle: `${a.slug ? 'flatmeta.io/u/' + a.slug : a.three_words} · ${a.no_of_tiles} squares`,
      lat: a.lat,
      lng: a.lng,
      zoom: ZOOM_LEVELS.BUY,
      orderId: a.order_id,
    });
    const local: SearchResult[] = [
      ...this.land.search(q).map(areaResult),
      ...this.pins
        .filter((p) => p.name.toLowerCase().includes(lower) || p.three_words.includes(lower))
        .map((p) => ({ type: 'pin' as const, title: p.name, subtitle: `Saved pin · ${p.three_words}`, lat: p.lat, lng: p.lng, zoom: p.zoom })),
      ...this.presence.citizens$.value
        .filter((c) => c.username.toLowerCase().includes(lower) || c.fullname.toLowerCase().includes(lower))
        .map((c) => ({ type: 'citizen' as const, title: c.fullname, subtitle: `@${c.username} · online now`, lat: c.lat, lng: c.lng, zoom: ZOOM_LEVELS.BUY })),
    ];
    this.searchResults = local;
    this.showSearch = local.length > 0;
    this.searchTimer = setTimeout(async () => {
      try {
        // Land anywhere in the world (the map only has what is in view), and real places.
        const [remote, places] = await Promise.all([
          this.land.searchRemote(q),
          geocoder.search({ query: q }).catch((): any[] => []),
        ]);
        this.zone.run(() => {
          if (this.searchQuery.trim() !== q) return;
          const shown = new Set(local.map((r) => r.orderId).filter(Boolean));
          this.searchResults = [
            ...local,
            ...remote.filter((a) => !shown.has(a.order_id)).map(areaResult),
            ...(places || []).slice(0, 5).map((p: any) => ({
              type: 'place' as const,
              title: String(p.label).split(',')[0],
              subtitle: p.label,
              lat: Number(p.y),
              lng: Number(p.x),
              zoom: ZOOM_LEVELS.BUY,
            })),
          ];
          this.showSearch = this.searchResults.length > 0;
        });
      } catch {}
    }, 300);
  }

  pickSearchResult(r: SearchResult) {
    this.showSearch = false;
    this.searchQuery = r.title;
    this.flyTo(r.lat, r.lng, r.zoom, true);
    if (r.orderId) {
      const orderId = r.orderId;
      setTimeout(() => this.openAreaById(orderId), 900);
    }
  }

  clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearch = false;
  }

  // ===========================================================================
  // Pins & sharing
  // ===========================================================================

  savePin() {
    const p = this.myPos();
    const pin = this.pinsService.add(this.newPinName || `Pin ${p.lat.toFixed(3)}, ${p.lng.toFixed(3)}`, p.lat, p.lng, this.zoom);
    this.newPinName = '';
    this.general.presentToast(`Saved "${pin.name}".`);
  }

  goToPin(pin: SavedPin) {
    this.showPins = false;
    this.flyTo(pin.lat, pin.lng, pin.zoom, true);
  }

  sharePin(pin: SavedPin) {
    this.copyLink(this.pinsService.sharePath(pin), 'Pin link');
  }

  shareMyPosition() {
    const p = this.myPos();
    this.copyLink(this.positionPath(p.lat, p.lng), 'Link to your position');
  }

  private positionPath(lat: number, lng: number) {
    return `at/${lat.toFixed(5)},${lng.toFixed(5)},${this.zoom}`;
  }

  copyLink(path: string, label: string) {
    const url = `${window.location.origin}/${path.replace(/^\/+/, '')}`;
    const done = () => this.general.presentToast(`${label} copied: ${url}`, 3500);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(done, () => this.general.presentToast(`${label}: ${url}`, 6000));
    } else {
      this.general.presentToast(`${label}: ${url}`, 6000);
    }
  }

  // ===========================================================================
  // Leaderboard
  // ===========================================================================

  async openRanks() {
    this.showRanks = true;
    const res = await this.http.getAsync('Leaderboard');
    if (res?.status === true) {
      this.ranks = {
        landowners: (res.data?.landowners || []).map((o: any) => ({
          username: o.username || 'citizen',
          fullname: o.fullname || o.username || 'Citizen',
          tiles: Number(o.total_tiles || 0),
          areas: Number(o.total_areas || 0),
          isMe: String(o.user_id) === this.me.id,
        })),
        clans: (res.data?.clans || []).map((c: any) => ({ ...c, isMine: c.name === this.me.clan })),
      };
    } else {
      this.general.presentToast('Could not load the leaderboard.');
    }
  }

  async joinClan(name: string) {
    if (this.me.isGuest) {
      this.session.requestAuth('Verify your email to join a clan.');
      return;
    }
    const res = await this.session.updateProfile({ clan: name });
    this.general.presentToast(res.ok ? `You joined ${name}.` : res.message);
    if (res.ok) this.openRanks();
  }

  // ===========================================================================
  // Misc
  // ===========================================================================

  dismissWelcome() {
    this.showWelcome = false;
    this.settingsService.update({ welcomeDismissed: true });
  }

  requestSave(reason = 'Save your land, avatar and pins with just your email.') {
    this.session.requestAuth(reason);
  }

  async report(reasonId: number | string) {
    const target = this.reportTarget;
    this.showReport = false;
    this.reportTarget = null;
    if (!target) return;
    const res = await this.http.postAsync('AddUserReport', { user_id: Number(target.id), report_id: reasonId, report_text: '' });
    this.general.presentToast(res?.status === true ? 'Thanks, our moderators will take a look.' : res?.message || 'Could not send report.');
  }

  private goToLand(item: any) {
    const lat = Number(item.lat ?? item.center_lat);
    const lng = Number(item.lng ?? item.center_lng);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      this.flyTo(lat, lng, ZOOM_LEVELS.BUY, true);
      if (!item.order_id) return;
      // Pages pass whole areas (from MyPlaces, SaleList, ...); otherwise fetch it.
      if (Array.isArray(item.tiles) && item.tiles.length) setTimeout(() => this.openArea(item as LandArea), 900);
      else setTimeout(() => this.openAreaById(String(item.order_id)), 900);
    }
  }

  private openPayment(url: string) {
    this.payments.open(url);
  }

  private async loadPresets() {
    const res = await this.http.getAsync('BoxImages');
    if (res?.status === true && Array.isArray(res.data?.images)) {
      this.presets = res.data.images.map((i: any) => ({ name: i.name, url: i.url, label: i.country || i.name }));
    }
  }

  private async loadReportReasons() {
    const res = await this.http.getAsync('GetAllReportText');
    const list = res?.data?.reports || res?.data?.report_text || res?.data;
    if (res?.status === true && Array.isArray(list) && list.length) {
      this.reportReasons = list.map((r: any) => ({ id: r.id, text: r.text || r.report_text || r.name }));
    }
  }

  trackById(_: number, item: { id: string }) {
    return item.id;
  }

  /** Square centre for the editor preview line. */
  gridLabel(t: LandTile) {
    const c = gridToLatLng(t.gx, t.gy);
    return `${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}`;
  }
}

import {
  Component,
  OnInit,
  OnDestroy,
  ViewChild,
  ElementRef,
  Renderer2,
  NgZone,
  ChangeDetectorRef,
  HostListener,
} from '@angular/core';
import { IonRouterOutlet, ModalController } from '@ionic/angular';
import { Geolocation } from '@capacitor/geolocation';
import { LocationAccuracy } from '@awesome-cordova-plugins/location-accuracy/ngx';
import { StorageService } from 'src/app/providers/storage.service';
import { GeneralService } from 'src/app/providers/general.service';
import { HttpService } from 'src/app/providers/http.service';
import { GlobaldataService } from 'src/app/providers/globaldata.service';
import { EventsService } from 'src/app/providers/events.service';
import { Capacitor } from '@capacitor/core';
import { ActivatedRoute, Router } from '@angular/router';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { environment } from 'src/environments/environment';

import * as Leaflet from 'leaflet';
import * as GeoSearch from 'leaflet-geosearch';
import DriftMarker from 'leaflet-drift-marker';

import { ChatComponent } from 'src/app/components/chat/chat.component';
import {
  MetaverseService,
  LandTile,
  LandAreaSummary,
  SavedPin,
  LiveChatMessage,
  PortfolioStats,
  UserSettings,
} from 'src/app/providers/metaverse.service';
import { Subscription } from 'rxjs';

const osmProvider = new GeoSearch.OpenStreetMapProvider();

@Component({
  selector: 'app-home',
  templateUrl: './home.page.html',
  styleUrls: ['./home.page.scss'],
})
export class HomePage implements OnInit, OnDestroy {
  @ViewChild('fileInput', { static: false }) fileInput: ElementRef;
  @ViewChild('hangoutsScroll', { static: false }) hangoutsScroll: ElementRef;

  // Onboarding top-left popup (OSM style)
  ShowtopPop: boolean = true;

  // Map & Custom Canvas Layers
  map: Leaflet.Map;
  landCanvasLayer: Leaflet.GridLayer = undefined;
  zoomOutMarkersLayer: Leaflet.LayerGroup = undefined;

  // Strictly 3 zoom levels: 15 (Buy/Edit), 10 (Roam/City), 5 (Planet)
  public static readonly ALLOWED_ZOOMS = [5, 10, 15];
  currentZoomLevel: number = 15;
  private lastZoomStepTime: number = 0;

  // Grid & Scan Toggles
  buyGridActive: boolean = false;
  scanModeActive: boolean = false;
  isAvatarOffScreen: boolean = false;

  // Selections & Land Data
  selectedBoxs: Array<{ gx: number; gy: number; lat: number; lng: number }> = [];
  soldBoxes: LandTile[] = [];
  myBoxs: LandTile[] = [];
  spanImageAcrossSelection: boolean = true;

  // Modals & Popovers
  imgSelection: boolean = false;
  boxImgs: any[] = [];
  boxImgs2: any[] = [];
  selectedImg: any = undefined;
  showUplaodedImage: boolean = false;

  showEditor: boolean = false;
  qEditor: string = '';
  areaTitleInput: string = '';
  areaSlugInput: string = '';
  areaThreeWordsInput: string = '';
  areaEmbedUrlInput: string = '';
  areaOnSaleInput: boolean = false;
  areaSalePriceInput: number = 1.0;

  // Inspected Land Area Callout Modal
  inspectedArea: LandAreaSummary | null = null;
  showAreaInspectModal: boolean = false;
  safeEmbedUrl: SafeResourceUrl | null = null;

  // Pins Modal / Drawer
  showPinsModal: boolean = false;
  savedPins: SavedPin[] = [];
  newPinName: string = '';

  // Omni-Search Bar (World Places + Custom Land Slugs + 3-Word Addresses + Pins)
  searchQuery: string = '';
  searchResults: Array<{
    type: 'area' | 'pin' | 'place' | 'citizen';
    title: string;
    subtitle: string;
    lat: number;
    lng: number;
    zoom?: number;
    slug?: string;
  }> = [];
  showSearchDropdown: boolean = false;
  private searchDebounce: any = null;

  // Avatars & Presence
  user_id: string = null;
  avatar: string = environment.fallbackAvatar;
  myExpression: string | undefined = undefined;
  myMarker: any = null;
  otherUsers: any[] = [];
  otherMarkers: any[] = [];
  private imageCache = new Map<string, HTMLImageElement>();

  // Hangouts-Style Docked Chat Window
  chatDrawerOpen: boolean = false;
  chatMinimized: boolean = false;
  chatMessages: LiveChatMessage[] = [];
  hangoutsInput: string = '';
  unreadChatCount: number = 0;
  private typingTimeout: any = null;

  // User Settings & Portfolio Stats
  settings: UserSettings;
  stats: PortfolioStats;

  // Report User Popover
  reportPopover: boolean = false;
  reportList: any[] = [
    { id: 1, text: 'Inappropriate avatar or land graphic' },
    { id: 2, text: 'Spam or abusive chat messages' },
    { id: 3, text: 'Impersonation or trademark infringement' },
  ];
  toReportUser: any = undefined;

  private subscriptions: Subscription = new Subscription();
  private speechBubbleMarkers: any[] = [];

  // Default start coordinate: FlatMeta Home Showcase District (London Prime)
  private currentCenter: [number, number] = [...MetaverseService.FLATMETA_HOME_COORDS];

  get isGuest(): boolean {
    return this.meta.isGuest();
  }

  get currentUser(): any {
    return GlobaldataService.userObject;
  }

  get claimCostPreview(): { freeCount: number; paidCount: number; monthlyUsd: number } {
    const rem = this.stats ? this.stats.freeQuotaRemaining : 100;
    const count = this.selectedBoxs.length;
    const freeCount = Math.min(rem, count);
    const paidCount = Math.max(0, count - freeCount);
    return {
      freeCount,
      paidCount,
      monthlyUsd: Number((paidCount * MetaverseService.PRICE_PER_TILE_MONTH).toFixed(2)),
    };
  }

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public routerOutlet: IonRouterOutlet,
    public storage: StorageService,
    public general: GeneralService,
    public http: HttpService,
    private locationAccuracy: LocationAccuracy,
    public meta: MetaverseService,
    private renderer: Renderer2,
    public modalController: ModalController,
    public events: EventsService,
    private sanitizer: DomSanitizer,
    private zone: NgZone,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.refreshUser();

    // Dismiss welcome popup automatically if user closed it earlier in this session
    if (sessionStorage.getItem('flatmeta_welcome_closed') === '1') {
      this.ShowtopPop = false;
    }

    // Subscribe to reactive Metaverse stores
    this.subscriptions.add(
      this.meta.tiles$.subscribe((tiles) => {
        this.soldBoxes = tiles;
        this.redrawLandLayers();
      })
    );

    this.subscriptions.add(
      this.meta.pins$.subscribe((pins) => {
        this.savedPins = pins;
      })
    );

    this.subscriptions.add(
      this.meta.settings$.subscribe((s) => {
        this.settings = s;
        this.syncOtherMarkersVisibility();
      })
    );

    this.subscriptions.add(
      this.meta.stats$.subscribe((st) => {
        this.stats = st;
      })
    );

    this.subscriptions.add(
      this.meta.chatMessages$.subscribe((msgs) => {
        this.chatMessages = msgs;
        if (!this.chatDrawerOpen || this.chatMinimized) {
          this.unreadChatCount = Math.min(99, this.unreadChatCount + 1);
        }
        setTimeout(() => this.scrollToBottomHangouts(), 80);
      })
    );

    // Cross-component navigation: Fly to FlatMeta Home showcase plaza
    this.subscriptions.add(
      this.events.receiveToHome().subscribe((res: boolean) => {
        if (res) {
          this.flyToFlatMetaHome();
        }
      })
    );

    // Cross-component navigation: Fly to a specific user/order land parcel
    this.subscriptions.add(
      this.events.receiveToUser().subscribe((res: any) => {
        if (res) {
          this.teleportToLandItem(res);
        }
      })
    );

    // Login state updates
    this.subscriptions.add(
      this.events.receiveLogin().subscribe(() => {
        this.refreshUser();
        this.updateMyAvatarMarker();
        this.redrawLandLayers();
      })
    );

    // Live remote avatar movement (from WebSocket or BroadcastChannel)
    this.subscriptions.add(
      this.meta.remoteLocation$.subscribe((payload: any) => {
        if (payload) {
          this.addOtherMarkers(payload);
        }
      })
    );

    // Live typing callouts over avatars (Brief 28/4/22 #9: "see others text in their callouts as they type")
    this.subscriptions.add(
      this.meta.remoteTyping$.subscribe((typing) => {
        if (typing && typing.userId) {
          this.displaySpeechBubble(
            typing.userId,
            typing.text ? `✍️ ${typing.text}` : '...',
            this.meta.detectSmileyExpression(typing.text),
            2200
          );
        }
      })
    );

    // Clean up disconnected browser windows (Brief 28/4/22: no ghost avatars after window close)
    this.subscriptions.add(
      this.meta.remoteDisconnect$.subscribe((userId: string) => {
        this.removeOtherMarkerByUserId(userId);
      })
    );

    // Speech bubbles from chat messages
    this.subscriptions.add(
      this.meta.speechBubble$.subscribe((ev) => {
        if (ev) {
          if (ev.expression && String(ev.senderId) === String(this.getSessionUserId())) {
            this.myExpression = ev.expression;
            this.updateMyAvatarMarker();
          }
          this.displaySpeechBubble(ev.senderId, ev.text, ev.expression);
        }
      })
    );
  }

  /**
   * Keyboard Arrow Keys / WASD Avatar Walking (like Google I/O Adventure & Gather.town)
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboardWalk(event: KeyboardEvent) {
    if (!this.map || !this.myMarker) return;
    const activeTag = (document.activeElement?.tagName || '').toLowerCase();
    if (
      activeTag === 'input' ||
      activeTag === 'textarea' ||
      (document.activeElement as HTMLElement)?.isContentEditable
    ) {
      return;
    }

    const step = this.currentZoomLevel === 15 ? 0.00035 : this.currentZoomLevel === 10 ? 0.008 : 0.25;
    const pos = this.myMarker.getLatLng();
    let dLat = 0;
    let dLng = 0;

    if (event.key === 'ArrowUp' || event.key === 'w' || event.key === 'W') {
      dLat = step;
    } else if (event.key === 'ArrowDown' || event.key === 's' || event.key === 'S') {
      dLat = -step;
    } else if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
      dLng = -step;
    } else if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
      dLng = step;
    } else {
      return;
    }

    event.preventDefault();
    const nextLatLng = Leaflet.latLng(pos.lat + dLat, pos.lng + dLng);
    this.myMarker.slideTo(nextLatLng, { duration: 220 });
    this.emitLocation(nextLatLng);

    // Smoothly pan map if avatar walks near the edge of the screen
    if (!this.map.getBounds().pad(-0.15).contains(nextLatLng)) {
      this.map.panTo(nextLatLng, { animate: true, duration: 0.25 });
    }
    this.checkAvatarOffScreen();
  }

  refreshUser() {
    this.user_id = this.meta.getCurrentUserId();
    this.avatar = this.meta.getCurrentAvatar();
  }

  closeWelcomePop() {
    this.ShowtopPop = false;
    sessionStorage.setItem('flatmeta_welcome_closed', '1');
  }

  openWelcomePop() {
    this.ShowtopPop = true;
  }

  ionViewWillEnter() {
    this.refreshUser();
  }

  ionViewDidEnter() {
    this.loadMap();
    this.getSoldBox();
    this.getBoxImgs();
    this.getReportList();
    this.handleRouteDeepLinks();

    setTimeout(() => {
      if (this.map) {
        this.map.invalidateSize();
      }
      this.getMapUser();
      this.spawnAmbientCitizensIfNeeded();
    }, 350);
  }

  ionViewWillLeave() {}

  ngOnDestroy() {
    this.subscriptions.unsubscribe();
    if (this.map) {
      this.map.remove();
      this.map = undefined;
    }
  }

  // ============================================================================
  // 1. DEEP LINKS: /u/:slug, /p/:pinId, /at/:coords, ?area=..., ?lat=...&lng=...
  // ============================================================================

  private handleRouteDeepLinks() {
    const paramMap = this.route.snapshot.paramMap;
    const queryMap = this.route.snapshot.queryParamMap;

    const slug = paramMap.get('slug') || queryMap.get('area') || queryMap.get('u');
    const pinId = paramMap.get('pinId') || queryMap.get('pin');
    const coordsStr = paramMap.get('coords') || queryMap.get('at');
    const qLat = queryMap.get('lat');
    const qLng = queryMap.get('lng');

    if (slug) {
      if (slug.toLowerCase() === 'flatmeta-home' || slug.toLowerCase() === 'home') {
        setTimeout(() => this.flyToFlatMetaHome(), 250);
        return;
      }
      const area = this.meta.findAreaBySlugOrThreeWords(slug);
      if (area) {
        setTimeout(() => {
          this.flyToAndMoveAvatar(area.lat, area.lng, 15);
          this.openAreaInspection(area);
        }, 250);
        return;
      }
    }

    if (pinId) {
      const pin = this.meta.findPinById(pinId);
      if (pin) {
        setTimeout(() => {
          this.flyToAndMoveAvatar(pin.lat, pin.lng, pin.zoom || 15);
          this.general.presentToast(`Arrived at Saved Pin: ${pin.name}`);
        }, 250);
        return;
      }
    }

    if (coordsStr) {
      const cleaned = coordsStr.replace(/^@/, '');
      const parts = cleaned.split(',').map(Number);
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        const z = parts[2] ? this.snapToAllowedZoom(parts[2]) : 15;
        setTimeout(() => this.flyToAndMoveAvatar(parts[0], parts[1], z), 250);
        return;
      }
    }

    if (qLat && qLng && !isNaN(Number(qLat)) && !isNaN(Number(qLng))) {
      setTimeout(() => this.flyToAndMoveAvatar(Number(qLat), Number(qLng), 15), 250);
    }
  }

  // ============================================================================
  // 2. INSTANT MAP LOAD & STRICT 3-LEVEL AVATAR-CENTERED ZOOM (15, 10, 5)
  // ============================================================================

  loadMap() {
    if (this.map) {
      this.map.invalidateSize();
      return;
    }

    // Restore cached last position immediately so first paint is instant (<100ms)
    try {
      const cached = localStorage.getItem('flatmeta_last_coords');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length === 2 && !isNaN(parsed[0])) {
          this.currentCenter = [Number(parsed[0]), Number(parsed[1])];
        }
      }
    } catch (e) {}

    // Initialize Leaflet map with native scrollWheelZoom/touchZoom disabled so our
    // strict 3-level [5, 10, 15] avatar-centered zoom controller governs all zoom gestures!
    this.map = Leaflet.map('mapId', {
      center: this.currentCenter,
      zoom: 15,
      minZoom: 5,
      maxZoom: 15,
      zoomSnap: 5,
      zoomDelta: 5,
      doubleClickZoom: false,
      scrollWheelZoom: false,
      touchZoom: false,
      boxZoom: false,
      zoomControl: false,
    });

    // Primary Tile Layer: OpenStreetMap (instant load like openstreetmap.org) + Mapbox fallback support
    const osmLayer = Leaflet.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: 'Buy / Customise Land | <a href="https://flatmeta.io">FlatMeta.io</a>',
      maxZoom: 15,
      minZoom: 5,
    });
    osmLayer.addTo(this.map);
    this.map.attributionControl.setPrefix('FlatMeta.io');

    // Initialize Always-Visible Land Parcel Layer & Zoomed-Out Area Markers Layer
    this.zoomOutMarkersLayer = Leaflet.layerGroup().addTo(this.map);
    this.initLandCanvasLayer();

    // Place user's Avatar immediately at center (no waiting for GPS timeout!)
    this.addMarker(this.currentCenter[0], this.currentCenter[1]);

    // Attach Strict 3-Level Wheel & Touch-Pinch Zoom Centered on Avatar
    this.attachStrictThreeLevelZoomHandlers();

    // Map move/zoom listeners
    this.map.on('moveend', () => {
      this.checkAvatarOffScreen();
    });

    this.map.on('zoomend', () => {
      const rawZ = this.map.getZoom();
      const snappedZ = this.snapToAllowedZoom(rawZ);
      if (rawZ !== snappedZ) {
        this.map.setZoom(snappedZ, { animate: false });
      }
      this.currentZoomLevel = snappedZ;
      if (this.currentZoomLevel !== 15 && this.buyGridActive) {
        this.buyGridActive = false;
      }
      this.syncOtherMarkersVisibility();
      this.redrawLandLayers();
      this.checkAvatarOffScreen();
    });

    // Double-click on map smoothly walks the avatar to the clicked location
    // (Brief 06/01/23: "When double click, Avatar should go to where mouse is")
    this.map.on('dblclick', (e: Leaflet.LeafletMouseEvent) => {
      if (this.myMarker) {
        this.myMarker.slideTo(e.latlng, { duration: 950 });
        this.emitLocation(e.latlng);
        this.saveLastCoords(e.latlng.lat, e.latlng.lng);
        this.checkAvatarOffScreen();
      }
    });

    // Right-click (contextmenu) anywhere on map inspects owned land or offers to drop a pin
    this.map.on('contextmenu', (e: Leaflet.LeafletMouseEvent) => {
      const { gx, gy } = this.meta.latLngToGrid(e.latlng.lat, e.latlng.lng);
      const tile = this.meta.getTileAtGrid(gx, gy);
      if (tile) {
        const area = this.meta.getGroupedAreas().find((a) => String(a.order_id) === String(tile.order_id));
        if (area) {
          this.zone.run(() => this.openAreaInspection(area));
        }
      }
    });

    // Request real-world GPS / IP geolocation asynchronously in background on first visit
    if (!localStorage.getItem('flatmeta_last_coords')) {
      this.resolveInitialRealWorldLocationAsync();
    }
  }

  public snapToAllowedZoom(z: number): number {
    if (z <= 7) return 5;
    if (z <= 12) return 10;
    return 15;
  }

  /**
   * Enforces strictly 3 zoom levels [5, 10, 15] across mouse wheel, trackpad, and mobile pinch,
   * always centering the zoom on the user's Avatar so zooming never jumps across the world!
   */
  private attachStrictThreeLevelZoomHandlers() {
    const container = this.map.getContainer();

    // 1. Mouse wheel / trackpad zoom -> steps strictly 15 <-> 10 <-> 5 around Avatar
    container.addEventListener(
      'wheel',
      (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        const now = Date.now();
        if (now - this.lastZoomStepTime < 360) return;
        if (Math.abs(e.deltaY) < 6) return;

        this.lastZoomStepTime = now;
        const dir = e.deltaY < 0 ? 1 : -1;
        this.zone.run(() => {
          this.stepZoomLevel(dir);
        });
      },
      { passive: false }
    );

    // 2. Mobile pinch-zoom -> steps strictly 15 <-> 10 <-> 5 around Avatar
    let startDist = 0;
    container.addEventListener(
      'touchstart',
      (e: TouchEvent) => {
        if (e.touches.length === 2) {
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          startDist = Math.hypot(dx, dy);
        }
      },
      { passive: true }
    );

    container.addEventListener(
      'touchend',
      (e: TouchEvent) => {
        if (startDist > 0 && e.changedTouches.length > 0) {
          const touch = e.changedTouches[0];
          const other = e.touches[0];
          if (other) {
            const dx = touch.clientX - other.clientX;
            const dy = touch.clientY - other.clientY;
            const endDist = Math.hypot(dx, dy);
            const delta = endDist - startDist;
            if (Math.abs(delta) > 35) {
              this.zone.run(() => {
                this.stepZoomLevel(delta > 0 ? 1 : -1);
              });
            }
          }
          startDist = 0;
        }
      },
      { passive: true }
    );
  }

  public stepZoomLevel(direction: 1 | -1) {
    const idx = HomePage.ALLOWED_ZOOMS.indexOf(this.currentZoomLevel);
    const nextIdx = Math.max(0, Math.min(HomePage.ALLOWED_ZOOMS.length - 1, idx + direction));
    const targetZoom = HomePage.ALLOWED_ZOOMS[nextIdx];
    this.setZoomLevel(targetZoom);
  }

  public setZoomLevel(level: number) {
    if (!this.map) return;
    const targetZoom = this.snapToAllowedZoom(level);
    this.currentZoomLevel = targetZoom;

    // Brief 06/01/23 lines 46-47: "it should zoom only where avatar is"
    const anchor = this.myMarker ? this.myMarker.getLatLng() : this.map.getCenter();
    this.map.setView(anchor, targetZoom, { animate: true });
  }

  private saveLastCoords(lat: number, lng: number) {
    try {
      localStorage.setItem('flatmeta_last_coords', JSON.stringify([lat, lng]));
    } catch (e) {}
  }

  private checkAvatarOffScreen() {
    if (!this.map || !this.myMarker) {
      this.isAvatarOffScreen = false;
      return;
    }
    const bounds = this.map.getBounds();
    const pos = this.myMarker.getLatLng();
    this.isAvatarOffScreen = !bounds.contains(pos);
  }

  // ============================================================================
  // 3. LOCATION CONTROLS: GPS HOME, FLATMETA HOME, LOCATE AVATAR
  // ============================================================================

  private async resolveInitialRealWorldLocationAsync() {
    try {
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy: false,
        timeout: 3500,
      });
      if (pos?.coords) {
        this.saveLastCoords(pos.coords.latitude, pos.coords.longitude);
      }
    } catch (e) {
      // Quietly keep FlatMeta Home showcase coordinates if GPS permission is not granted
    }
  }

  /**
   * Brief 06/01/23 line 76 & 85:
   * "If they click home, then it moves avatar and map to their current real-world location or country they are in based on IP"
   */
  async getCurrentLocation() {
    try {
      if (Capacitor.isNativePlatform()) {
        const canRequest = await this.locationAccuracy.canRequest();
        if (canRequest) {
          await this.locationAccuracy.request(this.locationAccuracy.REQUEST_PRIORITY_HIGH_ACCURACY);
        }
      }
      const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 4500 });
      const lat = pos.coords.latitude;
      const lng = pos.coords.longitude;
      this.flyToAndMoveAvatar(lat, lng, 15);
      this.general.presentToast('Moved to your real-world GPS location!');
      return;
    } catch (e) {
      // Fallback to IP geolocation if browser GPS is blocked/unavailable
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          if (data.latitude && data.longitude) {
            this.flyToAndMoveAvatar(Number(data.latitude), Number(data.longitude), 15);
            this.general.presentToast(`Moved to ${data.city || data.country_name || 'your location'}!`);
            return;
          }
        }
      } catch (ipErr) {}
    }

    // Ultimate fallback: FlatMeta Home Showcase District
    this.flyToFlatMetaHome();
  }

  /**
   * Brief 28/4/22 #11:
   * "Flatmeta Home, takes to a customised tiled page that shows our details and instructions on how to use the site."
   */
  public flyToFlatMetaHome() {
    const [lat, lng] = MetaverseService.FLATMETA_HOME_COORDS;
    this.flyToAndMoveAvatar(lat, lng, 15);
    this.general.presentToast('Welcome to FlatMeta Home Showcase Plaza!');
  }

  /**
   * Brief 06/01/23 line 77 & 84:
   * "If they click locate, the map will go to where the avatar is."
   */
  public toAvatarLocation() {
    if (this.myMarker && this.map) {
      const pos = this.myMarker.getLatLng();
      this.map.flyTo(pos, this.currentZoomLevel === 5 ? 15 : this.currentZoomLevel, { duration: 0.7 });
      this.isAvatarOffScreen = false;
      this.displaySpeechBubble(this.getSessionUserId(), 'Here I am!');
    }
  }

  public flyToAndMoveAvatar(lat: number, lng: number, zoom: number = 15) {
    if (!this.map) return;
    const targetZoom = this.snapToAllowedZoom(zoom);
    this.currentCenter = [lat, lng];
    this.saveLastCoords(lat, lng);
    this.map.flyTo([lat, lng], targetZoom, { duration: 0.85 });
    this.currentZoomLevel = targetZoom;

    if (this.myMarker) {
      this.myMarker.slideTo({ lat, lng }, { duration: 750 });
    } else {
      this.addMarker(lat, lng);
    }
    this.emitLocation({ lat, lng });
    this.isAvatarOffScreen = false;
  }

  // ============================================================================
  // 4. ALWAYS-VISIBLE SEAMLESS LAND LAYER + TOGGLEABLE BUY GRID & SCAN MODE
  // ============================================================================

  /**
   * Toggles the Buy/Select Land Grid at zoom 15
   */
  public toggleBuyGrid() {
    if (this.currentZoomLevel !== 15) {
      this.setZoomLevel(15);
      this.buyGridActive = true;
      this.redrawLandLayers();
      this.general.presentToast('Zoomed to 15x Buy Level & activated Land Grid!');
      return;
    }

    this.buyGridActive = !this.buyGridActive;
    if (!this.buyGridActive) {
      this.selectedBoxs = [];
      this.myBoxs = [];
    }
    this.redrawLandLayers();
  }

  /**
   * Toggles Scan Mode (Brief 15/4/22 line 288: highlight owned squares & click to inspect)
   */
  public toggleScanMode() {
    this.scanModeActive = !this.scanModeActive;
    this.redrawLandLayers();
    this.general.presentToast(
      this.scanModeActive
        ? 'Scan Mode ON: Owned parcels highlighted. Click any owned parcel to inspect!'
        : 'Scan Mode OFF: Seamless custom artwork view.'
    );
  }

  /**
   * Initializes the persistent Canvas GridLayer that renders:
   * - Owned land images SEAMLESSLY (zero border/space between adjacent tiles!)
   * - Multi-tile spanned images (1 image sliced across NxM selected squares!)
   * - Optional Scan Mode outlines & Buy Mode half-thickness grid lines at zoom 15
   */
  private initLandCanvasLayer() {
    if (!this.map) return;
    const that = this;

    const CustomLandLayer = Leaflet.GridLayer.extend({
      createTile: function (coords: Leaflet.Coords, done: Leaflet.DoneCallback) {
        const tile = Leaflet.DomUtil.create('canvas', 'leaflet-tile flatmeta-parcel-tile') as HTMLCanvasElement;
        const size = this.getTileSize();
        tile.width = size.x;
        tile.height = size.y;

        that.drawParcelTileCanvas(tile, coords, size);

        tile.addEventListener('click', (ev: MouseEvent) => {
          ev.stopPropagation();
          that.zone.run(() => {
            that.onParcelTileClick(coords, ev);
          });
        });

        setTimeout(() => done(null, tile), 0);
        return tile;
      },
    });

    this.landCanvasLayer = new (CustomLandLayer as any)({
      tileSize: MetaverseService.TILE_PIXEL_SIZE,
      opacity: 1,
      updateWhenZooming: false,
      updateWhenIdle: false,
      zIndex: 400,
    });

    this.landCanvasLayer.addTo(this.map);
    this.renderZoomedOutAreaMarkers();
  }

  public redrawLandLayers() {
    if (this.landCanvasLayer) {
      this.landCanvasLayer.redraw();
    }
    this.renderZoomedOutAreaMarkers();
    this.cdr.detectChanges();
  }

  private drawParcelTileCanvas(tile: HTMLCanvasElement, coords: Leaflet.Coords, size: Leaflet.Point) {
    const ctx = tile.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, size.x, size.y);

    // At zoom 10 and 5, zoomed-out area markers represent custom land so the 40px grid doesn't clutter the world
    if (coords.z !== MetaverseService.GRID_ZOOM) {
      return;
    }

    const gx = coords.x;
    const gy = coords.y;
    const currentUserId = this.getSessionUserId();

    const matchingBox = this.soldBoxes.find((b) => b.gx === gx && b.gy === gy);
    const isSelectedToClaim = this.selectedBoxs.some((b) => b.gx === gx && b.gy === gy);
    const isSelectedOwned = this.myBoxs.some((b) => b.gx === gx && b.gy === gy);

    if (matchingBox) {
      const isMine = String(matchingBox.user_id) === String(currentUserId);

      if (matchingBox.image) {
        this.drawTileOrSpannedImage(ctx, matchingBox, gx, gy, size.x, size.y, () => {
          // Overlay selection or scan outline AFTER image draws if active
          this.drawParcelOverlayBorder(ctx, matchingBox, isMine, isSelectedOwned, size.x, size.y);
        });
      } else {
        // Owned parcel without an image yet
        ctx.fillStyle = isMine ? 'rgba(16, 185, 129, 0.24)' : 'rgba(244, 63, 94, 0.22)';
        ctx.fillRect(0, 0, size.x, size.y);
      }

      // Draw border ONLY if no custom image is set OR Scan Mode is ON OR tile is actively selected
      // (Brief 28/4/22 #1 & line 157: "touches (no space) with other images next to it... will not show square-edges if image has been replaced")
      this.drawParcelOverlayBorder(ctx, matchingBox, isMine, isSelectedOwned, size.x, size.y);
    } else if (isSelectedToClaim) {
      // Unowned square currently selected for claiming
      ctx.fillStyle = 'rgba(56, 189, 248, 0.32)';
      ctx.fillRect(0, 0, size.x, size.y);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.8;
      ctx.strokeRect(0.9, 0.9, size.x - 1.8, size.y - 1.8);
    } else if (this.buyGridActive) {
      // Unowned square in Buy Mode: half-thickness, transparent edge (Brief 28/4/22 line 157)
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.32)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(0.25, 0.25, size.x - 0.5, size.y - 0.5);
    }
  }

  private drawParcelOverlayBorder(
    ctx: CanvasRenderingContext2D,
    box: LandTile,
    isMine: boolean,
    isSelectedOwned: boolean,
    w: number,
    h: number
  ) {
    if (isSelectedOwned) {
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.2;
      ctx.strokeRect(1.1, 1.1, w - 2.2, h - 2.2);
      return;
    }

    if (this.scanModeActive || !box.image) {
      ctx.strokeStyle = isMine
        ? '#10b981'
        : box.on_sale
        ? '#f59e0b'
        : box.user_id === 'flatmeta_official'
        ? '#38bdf8'
        : '#f43f5e';
      ctx.lineWidth = this.scanModeActive ? 1.5 : 0.8;
      ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
    }
  }

  /**
   * Draws either a single-tile image OR slices the corresponding sub-region of a
   * multi-tile spanned image (`span_bounds`), ensuring zero gap between adjacent tiles!
   */
  private drawTileOrSpannedImage(
    ctx: CanvasRenderingContext2D,
    box: LandTile,
    gx: number,
    gy: number,
    w: number,
    h: number,
    onDrawn?: () => void
  ) {
    const src = box.image;
    if (!src) return;

    const renderFromImg = (img: HTMLImageElement) => {
      try {
        ctx.imageSmoothingEnabled = true;
        if (
          box.span_bounds &&
          box.span_bounds.maxGx >= box.span_bounds.minGx &&
          box.span_bounds.maxGy >= box.span_bounds.minGy
        ) {
          const cols = box.span_bounds.maxGx - box.span_bounds.minGx + 1;
          const rows = box.span_bounds.maxGy - box.span_bounds.minGy + 1;
          const colIdx = gx - box.span_bounds.minGx;
          const rowIdx = gy - box.span_bounds.minGy;

          const sx = (colIdx / cols) * img.naturalWidth;
          const sy = (rowIdx / rows) * img.naturalHeight;
          const sw = img.naturalWidth / cols;
          const sh = img.naturalHeight / rows;

          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
        } else {
          ctx.drawImage(img, 0, 0, w, h);
        }
        if (onDrawn) onDrawn();
      } catch (e) {}
    };

    if (this.imageCache.has(src)) {
      const cached = this.imageCache.get(src)!;
      if (cached.complete && cached.naturalWidth > 0) {
        renderFromImg(cached);
        return;
      }
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      this.imageCache.set(src, img);
      renderFromImg(img);
    };
    img.src = src;
  }

  /**
   * Brief 25/4/22 line 203: "When zoom out should be able to see the newly added squares zoomed out."
   * Renders interactive thumbnail badges for customized land areas at zoom levels 10 and 5.
   */
  private renderZoomedOutAreaMarkers() {
    if (!this.map || !this.zoomOutMarkersLayer) return;
    this.zoomOutMarkersLayer.clearLayers();

    if (this.currentZoomLevel === 15) return;

    const areas = this.meta.getGroupedAreas();
    areas.forEach((area) => {
      const sizePx = this.currentZoomLevel === 10 ? 38 : 26;
      const badgeIcon = Leaflet.divIcon({
        className: 'zoomed-out-area-marker',
        iconSize: [sizePx, sizePx],
        iconAnchor: [sizePx / 2, sizePx / 2],
        html: `
          <div class="zoomed-area-thumb ${area.on_sale ? 'on-sale' : ''}" title="${area.title} (${area.no_of_tiles} tiles)">
            <img src="${area.image}" alt="${area.title}" onerror="this.src='assets/icon/placeholder-land.svg'"/>
            <span class="tile-count-dot">${area.no_of_tiles}</span>
          </div>
        `,
      });

      const m = Leaflet.marker([area.lat, area.lng], { icon: badgeIcon });
      m.on('click', () => {
        this.zone.run(() => {
          this.flyToAndMoveAvatar(area.lat, area.lng, 15);
          this.openAreaInspection(area);
        });
      });
      this.zoomOutMarkersLayer.addLayer(m);
    });
  }

  /**
   * Handles clicking a 40x40 parcel square at zoom 15
   */
  private onParcelTileClick(coords: Leaflet.Coords, ev: MouseEvent) {
    if (coords.z !== MetaverseService.GRID_ZOOM) return;

    const gx = coords.x;
    const gy = coords.y;
    const nw = this.meta.gridToLatLng(gx, gy);
    const currentUserId = this.getSessionUserId();
    const matchingBox = this.soldBoxes.find((b) => b.gx === gx && b.gy === gy);

    if (matchingBox) {
      const isMine = String(matchingBox.user_id) === String(currentUserId);
      if (isMine && !this.scanModeActive) {
        // Toggle or multi-select owned parcel so user can group-edit or span 1 image across multiple owned squares!
        this.selectedBoxs = [];
        const idx = this.myBoxs.findIndex((b) => b.gx === gx && b.gy === gy);
        if (idx > -1) {
          this.myBoxs.splice(idx, 1);
        } else {
          this.myBoxs.push(matchingBox);
        }
        this.populateEditorFromSelection();
        this.redrawLandLayers();
      } else {
        // Owned by someone else (or Scan Mode is active): open rich Area Callout Modal!
        const area = this.meta.getGroupedAreas().find((a) => String(a.order_id) === String(matchingBox.order_id));
        if (area) {
          this.openAreaInspection(area);
        }
      }
      return;
    }

    // Clicked an UNOWNED square: only select if Buy Grid is active
    if (!this.buyGridActive) {
      return;
    }

    this.myBoxs = [];
    const existingIdx = this.selectedBoxs.findIndex((b) => b.gx === gx && b.gy === gy);
    if (existingIdx > -1) {
      this.selectedBoxs.splice(existingIdx, 1);
    } else {
      this.selectedBoxs.push({ gx, gy, lat: nw.lat, lng: nw.lng });
    }
    this.redrawLandLayers();
  }

  /**
   * Quick multi-tile block selector (2x2 or 3x3 around Avatar/Map center)
   * Makes selecting multiple boxes to span 1 image effortless on both mobile and desktop!
   */
  public selectBlockAroundAvatar(size: 2 | 3 = 2) {
    if (this.currentZoomLevel !== 15) {
      this.setZoomLevel(15);
    }
    this.buyGridActive = true;
    this.myBoxs = [];
    this.selectedBoxs = [];

    const center = this.myMarker ? this.myMarker.getLatLng() : this.map.getCenter();
    const { gx, gy } = this.meta.latLngToGrid(center.lat, center.lng);
    const offset = size === 3 ? -1 : 0;

    for (let dx = offset; dx < offset + size; dx++) {
      for (let dy = offset; dy < offset + size; dy++) {
        const tx = gx + dx;
        const ty = gy + dy;
        const existing = this.meta.getTileAtGrid(tx, ty);
        if (!existing) {
          const ll = this.meta.gridToLatLng(tx, ty);
          this.selectedBoxs.push({ gx: tx, gy: ty, lat: ll.lat, lng: ll.lng });
        }
      }
    }

    this.redrawLandLayers();
    if (this.selectedBoxs.length > 0) {
      this.general.presentToast(`Selected ${this.selectedBoxs.length} available squares around your avatar!`);
    } else {
      this.general.presentToast('Squares right under your avatar are already owned — move to an open spot or tap squares.');
    }
  }

  /**
   * Selects all owned squares belonging to the same area/order so user can span 1 image or edit the whole area at once
   */
  public selectAllInMyArea() {
    if (this.myBoxs.length === 0) return;
    const orderId = this.myBoxs[0].order_id;
    const uid = this.getSessionUserId();
    this.myBoxs = this.soldBoxes.filter(
      (b) => String(b.order_id) === String(orderId) && String(b.user_id) === String(uid)
    );
    this.populateEditorFromSelection();
    this.redrawLandLayers();
    this.general.presentToast(`Selected all ${this.myBoxs.length} squares in this area!`);
  }

  private populateEditorFromSelection() {
    if (this.myBoxs.length === 0) return;
    const first = this.myBoxs[0];
    this.areaTitleInput = first.area_title || '';
    this.areaSlugInput = first.slug || '';
    this.areaThreeWordsInput = first.three_words || this.meta.gridToThreeWords(first.gx, first.gy);
    this.qEditor = first.custom_details || '';
    this.areaEmbedUrlInput = first.embed_url || '';
    this.areaOnSaleInput = Boolean(first.on_sale);
    this.areaSalePriceInput = Number(first.sale_price || 1.0);
  }

  public clearSelection() {
    this.selectedBoxs = [];
    this.myBoxs = [];
    this.redrawLandLayers();
  }

  // ============================================================================
  // 5. CLAIMING LAND (100 FREE SQUARES QUOTA) & PERSONALIZING ARTWORK / DETAILS
  // ============================================================================

  /**
   * Instant Claim button (uses the 100 Free Squares quota first, works without login!)
   */
  public claimSelectedNow() {
    if (this.selectedBoxs.length === 0) return;

    const result = this.meta.claimSelectedSquares(this.selectedBoxs);
    if (result.claimed.length === 0) {
      this.general.presentToast('Those squares are already claimed.');
      return;
    }

    // Automatically select the newly claimed squares so the user can immediately upload an image or customize!
    this.selectedBoxs = [];
    this.myBoxs = [...result.claimed];
    this.populateEditorFromSelection();
    this.redrawLandLayers();

    if (result.billableAdded === 0) {
      this.general.presentToast(
        `Claimed ${result.claimed.length} square${result.claimed.length > 1 ? 's' : ''} for FREE! Customize your artwork or URL below.`
      );
    } else {
      this.general.presentToast(
        `Claimed ${result.claimed.length} squares (${result.usedFreeQuota} free + ${result.billableAdded} at $0.10/mo subscription).`
      );
    }
  }

  public addToCart() {
    if (this.selectedBoxs.length === 0) return;

    const tilesPayload = this.selectedBoxs.map((e) => ({
      lat: e.lat.toString(),
      lng: e.lng.toString(),
    }));

    // Also claim locally into user's portfolio / cart
    this.claimSelectedNow();

    this.http.post('AddToCart', { tiles: tilesPayload }, false).subscribe({
      next: () => {},
      error: () => {},
    });
  }

  public confirmImg() {
    if (!this.selectedImg || this.myBoxs.length === 0) return;
    const imgUrl = this.selectedImg.url || this.selectedImg.name || this.selectedImg;

    this.meta.updateTilesArtwork(
      this.myBoxs.map((b) => ({ gx: b.gx, gy: b.gy })),
      imgUrl,
      this.spanImageAcrossSelection
    );

    // Sync with backend if logged in
    if (!this.isGuest && this.myBoxs[0]?.order_id) {
      this.http
        .post(
          'UpdateBoxImage',
          {
            order_id: this.myBoxs[0].order_id,
            image: imgUrl,
          },
          false
        )
        .subscribe({ next: () => {}, error: () => {} });
    }

    this.imgSelection = false;
    this.redrawLandLayers();
    this.general.presentToast(
      this.myBoxs.length > 1 && this.spanImageAcrossSelection
        ? `Spanned 1 image seamlessly across ${this.myBoxs.length} squares!`
        : 'Land artwork updated!'
    );
  }

  public revertMySelectionArtwork(toDefaultMap: boolean = false) {
    if (this.myBoxs.length === 0) return;
    this.meta.revertTilesArtwork(
      this.myBoxs.map((b) => ({ gx: b.gx, gy: b.gy })),
      toDefaultMap
    );
    this.imgSelection = false;
    this.redrawLandLayers();
    this.general.presentToast(toDefaultMap ? 'Reverted squares to default map view.' : 'Reverted to previous image.');
  }

  public chooseFile() {
    this.fileInput.nativeElement.click();
  }

  public choosePhoto = (e: any) => {
    const files = e?.target?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      this.zone.run(() => {
        const dataUrl = reader.result as string;
        const item = { name: file.name, url: dataUrl, country: 'Custom Upload' };
        this.boxImgs = [item, ...this.boxImgs];
        this.selectedImg = item;
        this.showUplaodedImage = true;
        this.general.presentToast('Custom image loaded! Click "Confirm Image" to apply.');
      });
    };
    reader.readAsDataURL(file);

    // Also upload to backend if reachable
    this.http.uploadImages(file, 'UploadBoxesImage').subscribe({
      next: (res: any) => {
        if (res?.status === true && res.data?.url) {
          this.selectedImg = res.data;
        }
      },
      error: () => {},
    });
  };

  public editorSubmit() {
    if (this.myBoxs.length === 0) return;

    this.meta.updateAreaMetadata(
      this.myBoxs.map((b) => ({ gx: b.gx, gy: b.gy })),
      {
        area_title: this.areaTitleInput,
        slug: this.areaSlugInput,
        three_words: this.areaThreeWordsInput,
        custom_details: this.qEditor,
        embed_url: this.areaEmbedUrlInput,
        on_sale: this.areaOnSaleInput,
        sale_price: this.areaSalePriceInput,
      }
    );

    if (!this.isGuest && this.myBoxs[0]?.order_id) {
      this.http
        .post(
          'UpdateCustomDetails',
          {
            order_id: this.myBoxs[0].order_id,
            custom_details: this.qEditor,
          },
          false
        )
        .subscribe({ next: () => {}, error: () => {} });
    }

    this.showEditor = false;
    this.redrawLandLayers();
    this.general.presentToast('Land area details, custom URL, and marketplace settings saved!');
  }

  // ============================================================================
  // 6. AREA INSPECTION CALLOUT, DIRECT BUY ON MAP, & SHAREABLE LINKS
  // ============================================================================

  public openAreaInspection(area: LandAreaSummary) {
    this.inspectedArea = area;
    if (area.embed_url && /^https?:\/\//i.test(area.embed_url)) {
      this.safeEmbedUrl = this.sanitizer.bypassSecurityTrustResourceUrl(area.embed_url);
    } else {
      this.safeEmbedUrl = null;
    }
    this.showAreaInspectModal = true;
  }

  public buyInspectedAreaNow(area: LandAreaSummary) {
    if (!area) return;
    const res = this.meta.buyMarketplaceListing(area.order_id);
    if (res.success) {
      this.showAreaInspectModal = false;
      this.redrawLandLayers();
      this.general.presentToast(
        `Purchased "${area.title}" (${res.tilesTransferred} tiles) for $${res.totalPaid.toFixed(
          2
        )} USD (includes 10% FlatMeta fee: $${res.commission.toFixed(2)})! You now own this land.`
      );
    }
  }

  public copyShareLink(urlPath: string, label: string = 'Link') {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'https://flatmeta.io';
    const fullUrl = `${origin}/${urlPath.replace(/^\/+/, '')}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(fullUrl).then(
        () => this.general.presentToast(`${label} copied: ${fullUrl}`),
        () => this.general.presentToast(`${label}: ${fullUrl}`)
      );
    } else {
      this.general.presentToast(`${label}: ${fullUrl}`);
    }
  }

  public shareSelectedAreaLink() {
    if (this.myBoxs.length === 0) return;
    const slug = this.myBoxs[0].slug || this.myBoxs[0].order_id;
    this.copyShareLink(`u/${slug}`, 'Custom Land URL');
  }

  public shareCurrentPositionLink() {
    const pos = this.myMarker ? this.myMarker.getLatLng() : this.map.getCenter();
    this.copyShareLink(`at/${pos.lat.toFixed(5)},${pos.lng.toFixed(5)},${this.currentZoomLevel}`, 'Position Link');
  }

  // ============================================================================
  // 7. SAVED PINS (Brief 06/01/23 lines 105-106)
  // ============================================================================

  public saveCurrentLocationPin() {
    const pos = this.myMarker ? this.myMarker.getLatLng() : this.map.getCenter();
    const label = this.newPinName.trim() || `Pin @ ${pos.lat.toFixed(4)}, ${pos.lng.toFixed(4)}`;
    const pin = this.meta.addPin(label, pos.lat, pos.lng, this.currentZoomLevel);
    this.newPinName = '';
    this.general.presentToast(`Saved Pin "${pin.name}" (${pin.three_words})!`);
  }

  public flyToSavedPin(pin: SavedPin) {
    this.showPinsModal = false;
    this.flyToAndMoveAvatar(pin.lat, pin.lng, pin.zoom || 15);
    this.general.presentToast(`Teleported to Pin: ${pin.name}`);
  }

  // ============================================================================
  // 8. OMNI-SEARCH (Places, Custom Land Slugs, 3-Word Addresses, Pins, Citizens)
  // ============================================================================

  public onSearchInput() {
    const q = (this.searchQuery || '').trim();
    if (!q) {
      this.searchResults = [];
      this.showSearchDropdown = false;
      return;
    }

    const qLower = q.toLowerCase().replace(/^https?:\/\/[^/]+\//, '').replace(/^(u|uri)\//, '');
    const localMatches: any[] = [];

    // 1. Match Custom Land Areas (by title, slug, or 3-word address)
    this.meta.getGroupedAreas().forEach((a) => {
      if (
        a.title?.toLowerCase().includes(qLower) ||
        a.slug?.toLowerCase().includes(qLower) ||
        a.three_words?.toLowerCase().includes(qLower) ||
        a.username?.toLowerCase().includes(qLower)
      ) {
        localMatches.push({
          type: 'area',
          title: a.title,
          subtitle: `flatmeta.io/u/${a.slug} · ${a.three_words} (${a.no_of_tiles} tiles)`,
          lat: a.lat,
          lng: a.lng,
          zoom: 15,
          slug: a.slug,
        });
      }
    });

    // 2. Match Saved Pins
    this.savedPins.forEach((p) => {
      if (p.name.toLowerCase().includes(qLower) || p.three_words.toLowerCase().includes(qLower)) {
        localMatches.push({
          type: 'pin',
          title: p.name,
          subtitle: `Saved Pin · ${p.three_words}`,
          lat: p.lat,
          lng: p.lng,
          zoom: p.zoom || 15,
        });
      }
    });

    // 3. Match Roaming Citizens
    this.otherUsers.forEach((u) => {
      if (
        u.latLng &&
        (u.fullname?.toLowerCase().includes(qLower) || u.username?.toLowerCase().includes(qLower))
      ) {
        localMatches.push({
          type: 'citizen',
          title: u.fullname || u.username,
          subtitle: `@${u.username} · Online Citizen`,
          lat: u.latLng.lat,
          lng: u.latLng.lng,
          zoom: 15,
        });
      }
    });

    this.searchResults = localMatches;
    this.showSearchDropdown = true;

    // 4. Geosearch World Places (debounced)
    if (this.searchDebounce) clearTimeout(this.searchDebounce);
    this.searchDebounce = setTimeout(async () => {
      try {
        const places = await osmProvider.search({ query: q });
        this.zone.run(() => {
          const placeItems = (places || []).slice(0, 5).map((p: any) => ({
            type: 'place' as const,
            title: p.label.split(',')[0],
            subtitle: p.label,
            lat: Number(p.y),
            lng: Number(p.x),
            zoom: 15,
          }));
          this.searchResults = [...localMatches, ...placeItems];
          this.showSearchDropdown = this.searchResults.length > 0;
        });
      } catch (e) {}
    }, 260);
  }

  public selectSearchResult(item: (typeof this.searchResults)[0]) {
    this.showSearchDropdown = false;
    this.searchQuery = item.title;
    this.flyToAndMoveAvatar(item.lat, item.lng, item.zoom || 15);
    if (item.type === 'area' && item.slug) {
      const area = this.meta.findAreaBySlugOrThreeWords(item.slug);
      if (area) {
        this.openAreaInspection(area);
      }
    }
  }

  public clearSearch() {
    this.searchQuery = '';
    this.searchResults = [];
    this.showSearchDropdown = false;
  }

  // ============================================================================
  // 9. AVATARS, DE-OVERLAPPING, & MULTI-USER PRESENCE
  // ============================================================================

  /**
   * Adds or updates the user's own circular avatar marker with dark outline + drop-shadow
   * (Brief 06/01/23 lines 31, 51, 88)
   */
  public addMarker(lat: number = this.currentCenter[0], lng: number = this.currentCenter[1]) {
    if (!this.map) return;
    this.refreshUser();

    const username = this.meta.getCurrentUsername();
    const fullname = this.meta.getCurrentFullname();
    const isGuest = this.meta.isGuest();
    const avatarSrc = this.myExpression
      ? this.meta.generateAvatarDataUrl(this.meta.getAvatarConfig(), this.myExpression)
      : this.avatar;

    const icon = Leaflet.divIcon({
      iconSize: [68, 82],
      iconAnchor: [34, 52],
      popupAnchor: [0, -46],
      className: 'avatar-marker-container own-avatar-marker',
      html: `
        <div class="avatar-ring-pulse"></div>
        <div class="avatar-bubble ${isGuest ? 'guest-avatar' : 'user-avatar'}" title="${fullname} (@${username})">
          <img src="${avatarSrc}" alt="${username}" onerror="this.src='assets/icon/avatar-default.svg'"/>
        </div>
        <div class="avatar-nametag own-nametag">@${username} <span class="you-pill">YOU</span></div>
      `,
    });

    const popupContainer = document.createElement('div');
    popupContainer.className = isGuest ? 'guest-popup-card' : 'user-popup-card';
    if (isGuest) {
      // Brief 06/01/23 line 31: 'Click icon it says "Hello, Guest!" it should be "Hello Guest!" and also Sign Up should link to signup / login page.'
      popupContainer.innerHTML = `
        <h4>Hello Guest!</h4>
        <p>Roam anywhere, chat live, and claim up to <strong>100 free land squares</strong>! Verify your email anytime to permanently save.</p>
        <div class="popup-actions">
          <button type="button" class="btn-pop-login" data-action="save-email">Sign Up / Save</button>
          <button type="button" class="btn-pop-signup" data-action="customize-avatar">Avatar</button>
        </div>
      `;
    } else {
      popupContainer.innerHTML = `
        <h4>${fullname}</h4>
        <p class="role-tag">@${username} · Verified Citizen</p>
        <p class="coords-info">Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}</p>
        <div class="popup-actions" style="margin-top:8px;">
          <button type="button" class="btn-pop-signup" data-action="customize-avatar">Customize Avatar</button>
        </div>
      `;
    }

    popupContainer.addEventListener('click', (ev: MouseEvent) => {
      const btn = (ev.target as HTMLElement).closest('button');
      if (!btn) return;
      ev.preventDefault();
      ev.stopPropagation();
      const act = btn.getAttribute('data-action');
      this.zone.run(() => {
        this.map.closePopup();
        if (act === 'save-email') {
          this.meta.openAuthModal$.next({ mode: 'email-quick', reason: 'Save your Guest land & avatar permanently' });
        } else if (act === 'customize-avatar') {
          this.router.navigateByUrl('/profile');
        }
      });
    });

    if (this.myMarker && this.map.hasLayer(this.myMarker)) {
      this.map.removeLayer(this.myMarker);
    }

    this.myMarker = new DriftMarker([lat, lng], {
      draggable: true,
      icon,
    })
      // @ts-ignore
      .bindPopup(popupContainer, { maxWidth: 300, className: 'flatmeta-custom-popup' })
      .addTo(this.map);

    // Dragging avatar moves position and broadcasts without panning map (Brief 06/01/23 line 81)
    this.myMarker.on('dragend', (e: any) => {
      const newPos = e.target.getLatLng();
      this.saveLastCoords(newPos.lat, newPos.lng);
      this.emitLocation(newPos);
      this.checkAvatarOffScreen();
    });

    this.syncOtherMarkersVisibility();
    this.emitLocation({ lat, lng });
  }

  public updateMyAvatarMarker() {
    if (this.myMarker) {
      const pos = this.myMarker.getLatLng();
      this.addMarker(pos.lat, pos.lng);
    }
  }

  /**
   * Computes a small golden-angle spiral offset when multiple avatars stand on the exact same spot
   * (Brief 06/01/23 line 117: "Many avatars on same place should not overlap.")
   */
  private getDeOverlappedLatLng(rawLat: number, rawLng: number, targetUserId: string): Leaflet.LatLng {
    const threshold = 0.00018;
    const myPos = this.myMarker ? this.myMarker.getLatLng() : { lat: this.currentCenter[0], lng: this.currentCenter[1] };

    let collisionIndex = 0;
    if (Math.abs(rawLat - myPos.lat) < threshold && Math.abs(rawLng - myPos.lng) < threshold) {
      collisionIndex++;
    }

    this.otherMarkers.forEach((m) => {
      if (String(m._userId) !== String(targetUserId)) {
        const p = m.getLatLng();
        if (Math.abs(rawLat - p.lat) < threshold && Math.abs(rawLng - p.lng) < threshold) {
          collisionIndex++;
        }
      }
    });

    if (collisionIndex === 0) {
      return Leaflet.latLng(rawLat, rawLng);
    }

    // Golden-angle spiral offset so even 10-100 avatars fan out cleanly around the point
    const angle = collisionIndex * 2.39996;
    const radius = 0.00022 * Math.sqrt(collisionIndex);
    return Leaflet.latLng(rawLat + radius * Math.cos(angle), rawLng + radius * Math.sin(angle));
  }

  /**
   * Renders or updates other roaming citizens on the map
   */
  public addOtherMarkers(data: any) {
    if (!data || !data.userId || !data.location || !this.map) return;

    const targetUserId = String(data.userId);
    const currentUserId = String(this.getSessionUserId());
    if (targetUserId === currentUserId) return;

    const rawLat = data.location.lat !== undefined ? data.location.lat : data.location[0];
    const rawLng = data.location.lng !== undefined ? data.location.lng : data.location[1];
    const lat = Number(rawLat);
    const lng = Number(rawLng);
    if (isNaN(lat) || isNaN(lng)) return;

    const destLatLng = this.getDeOverlappedLatLng(lat, lng, targetUserId);

    let user = this.otherUsers.find((item) => String(item.id) === targetUserId);
    if (!user) {
      const displayName =
        data.fullname ||
        (targetUserId.startsWith('guest_')
          ? 'Guest #' + targetUserId.replace('guest_', '')
          : 'Citizen #' + targetUserId);
      const handle = data.username || displayName.toLowerCase().replace(/\s+/g, '_');
      user = {
        id: targetUserId,
        fullname: displayName,
        username: handle,
        image: data.image || this.meta.generateAvatarDataUrl(this.meta.createRandomAvatarConfig()),
        friends: this.meta.isFriend(targetUserId),
        latLng: destLatLng,
      };
      this.otherUsers.push(user);
    } else {
      user.latLng = destLatLng;
      if (data.image) user.image = data.image;
      if (data.username) user.username = data.username;
      if (data.fullname) user.fullname = data.fullname;
      user.friends = this.meta.isFriend(targetUserId);
    }

    const existing = this.otherMarkers.find((m) => String(m._userId) === targetUserId);
    if (existing) {
      if (typeof existing.slideTo === 'function') {
        try {
          existing.slideTo(destLatLng, { duration: 750 });
        } catch (e) {
          existing.setLatLng(destLatLng);
        }
      } else {
        existing.setLatLng(destLatLng);
      }
      this.syncOtherMarkersVisibility();
      return;
    }

    const icon = Leaflet.divIcon({
      iconSize: [58, 72],
      iconAnchor: [29, 46],
      popupAnchor: [0, -40],
      className: 'avatar-marker-container other-user',
      html: `
        <div class="avatar-bubble other-avatar" title="${user.fullname} (@${user.username})">
          <img src="${user.image || environment.fallbackAvatar}" alt="${user.username}" onerror="this.src='assets/icon/avatar-default.svg'"/>
        </div>
        <div class="avatar-nametag">@${user.username || 'citizen'}</div>
      `,
    });

    const customPopup = this.addCustomPopup(user);
    const marker = new DriftMarker([destLatLng.lat, destLatLng.lng], {
      draggable: false,
      icon,
    })
      // @ts-ignore
      .bindPopup(customPopup, { maxWidth: 300, className: 'flatmeta-custom-popup' })
      .addTo(this.map);

    marker._userId = targetUserId;
    this.otherMarkers.push(marker);
    this.syncOtherMarkersVisibility();
  }

  private removeOtherMarkerByUserId(userId: string) {
    this.otherMarkers = this.otherMarkers.filter((m) => {
      if (String(m._userId) === String(userId)) {
        if (this.map && this.map.hasLayer(m)) {
          this.map.removeLayer(m);
        }
        return false;
      }
      return true;
    });
  }

  /**
   * Enforces zoom-level visibility (hidden at z5 planet view) and user setting
   * (All Avatars / Friends Only / Hidden)
   */
  public syncOtherMarkersVisibility() {
    if (!this.map) return;
    const vis = this.settings?.avatarVisibility || 'all';
    const showOwn = this.currentZoomLevel >= 10;

    if (this.myMarker) {
      const el = this.myMarker.getElement?.();
      if (el) {
        el.style.display = showOwn ? '' : 'none';
      }
    }

    this.otherMarkers.forEach((m) => {
      const uid = String(m._userId);
      const isFriend = this.meta.isFriend(uid);
      const shouldShow =
        this.currentZoomLevel >= 10 &&
        (vis === 'all' || (vis === 'friends' && isFriend));

      const el = m.getElement?.();
      if (el) {
        el.style.display = shouldShow ? '' : 'none';
      }
    });
  }

  /**
   * Spawns 2 friendly ambient citizens around FlatMeta Home so a visitor landing on the site
   * immediately sees other avatars roaming & can test clicking / chatting with them!
   */
  private spawnAmbientCitizensIfNeeded() {
    const [baseLat, baseLng] = MetaverseService.FLATMETA_HOME_COORDS;
    const bots = [
      {
        userId: 'citizen_aria',
        fullname: 'Aria Vance',
        username: 'aria_meta',
        image: this.meta.generateAvatarDataUrl({
          ...this.meta.createRandomAvatarConfig(),
          topType: 'LongHairCurvy',
          circleBg: '#7c3aed',
          mouthType: 'Smile',
        }),
        location: { lat: baseLat + 0.00042, lng: baseLng + 0.00055 },
      },
      {
        userId: 'citizen_zane',
        fullname: 'Zane Sterling',
        username: 'zane_builder',
        image: this.meta.generateAvatarDataUrl({
          ...this.meta.createRandomAvatarConfig(),
          topType: 'ShortHairShortWaved',
          accessoriesType: 'Sunglasses',
          circleBg: '#059669',
          mouthType: 'Twinkle',
        }),
        location: { lat: baseLat - 0.00038, lng: baseLng + 0.00048 },
      },
    ];

    bots.forEach((b) => this.addOtherMarkers(b));
  }

  addCustomPopup(user: any): HTMLElement {
    const container = document.createElement('div');
    container.className = 'other-user-card';

    const avatarUrl = user.image || environment.fallbackAvatar;
    const displayName = user.fullname || user.username || 'Metaverse Citizen';
    const handle = user.username || 'citizen';
    const isFriend = this.meta.isFriend(user.id);

    container.innerHTML = `
      <div class="other-user-header">
        <div class="other-avatar-wrap">
          <img src="${avatarUrl}" class="other-avatar-img" alt="${handle}" onerror="this.src='assets/icon/avatar-default.svg'"/>
          <span class="avatar-status-dot"></span>
        </div>
        <div class="other-user-info">
          <h4 class="other-user-name">${displayName}</h4>
          <span class="user-handle">@${handle}</span>
          <span class="user-tag">${isFriend ? 'Friend Connected' : 'Citizen'}</span>
        </div>
      </div>
      <div class="other-user-actions">
        <button type="button" class="btn-popup-chat" data-act="chat" title="Send direct message">
          <span>Chat</span>
        </button>
        <button type="button" class="btn-popup-friend" data-act="friend" title="Add/Remove Friend">
          <span>${isFriend ? 'Connected ✓' : '+ Connect'}</span>
        </button>
        <button type="button" class="btn-popup-report" data-act="report" title="Report user">
          <span>Report</span>
        </button>
      </div>
    `;

    container.addEventListener('click', (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      e.preventDefault();
      e.stopPropagation();

      const act = btn.getAttribute('data-act');
      this.zone.run(() => {
        if (this.map) this.map.closePopup();
        if (act === 'chat') {
          this.showChat(user.id, displayName);
        } else if (act === 'friend') {
          const nowFriend = this.meta.toggleFriend(user.id);
          user.friends = nowFriend;
          this.sendRequest(user.id);
          this.general.presentToast(
            nowFriend ? `Connected with @${handle}!` : `Removed @${handle} from connections.`
          );
        } else if (act === 'report') {
          this.toReportUser = user;
          this.reportPopover = true;
          this.cdr.detectChanges();
        }
      });
    });

    return container;
  }

  /**
   * Displays an animated speech or live-typing callout bubble above an avatar
   */
  public displaySpeechBubble(senderId: any, text: string, expression?: string, durationMs: number = 4500) {
    if (!text || !this.map) return;

    const strSenderId = String(senderId ?? '');
    const currentUserId = String(this.getSessionUserId());

    let targetMarker: any = null;
    if (this.myMarker && (senderId == null || strSenderId === currentUserId)) {
      targetMarker = this.myMarker;
    } else {
      targetMarker = this.otherMarkers.find((m) => String(m._userId) === strSenderId);
    }

    if (!targetMarker) return;

    // Escape HTML to prevent XSS in speech bubbles
    const safeText = String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    const pos = targetMarker.getLatLng();
    const bubbleIcon = Leaflet.divIcon({
      className: 'speech-bubble-container',
      html: `<div class="speech-bubble-tail">${safeText}</div>`,
      iconSize: [180, 44],
      iconAnchor: [90, 62],
    });

    const bubble = Leaflet.marker(pos, { icon: bubbleIcon }).addTo(this.map);
    this.speechBubbleMarkers.push(bubble);

    setTimeout(() => {
      if (this.map && this.map.hasLayer(bubble)) {
        this.map.removeLayer(bubble);
      }
      const idx = this.speechBubbleMarkers.indexOf(bubble);
      if (idx > -1) {
        this.speechBubbleMarkers.splice(idx, 1);
      }
    }, durationMs);
  }

  // ============================================================================
  // 10. GOOGLE HANGOUTS-STYLE DOCKED CHAT WINDOW & SETTINGS
  // ============================================================================

  public toggleHangoutsDrawer() {
    this.chatDrawerOpen = !this.chatDrawerOpen;
    if (this.chatDrawerOpen) {
      this.chatMinimized = false;
      this.unreadChatCount = 0;
      setTimeout(() => this.scrollToBottomHangouts(), 80);
    }
  }

  public onHangoutsTyping() {
    if (this.typingTimeout) clearTimeout(this.typingTimeout);
    this.meta.emitTyping(this.hangoutsInput);
    const expr = this.meta.detectSmileyExpression(this.hangoutsInput);
    if (expr && expr !== this.myExpression) {
      this.myExpression = expr;
      this.updateMyAvatarMarker();
    }
    this.typingTimeout = setTimeout(() => {}, 1000);
  }

  public sendHangoutsMessage() {
    if (!this.hangoutsInput || !this.hangoutsInput.trim()) return;
    const pos = this.myMarker ? this.myMarker.getLatLng() : { lat: this.currentCenter[0], lng: this.currentCenter[1] };
    const sent = this.meta.sendChatMessage(this.hangoutsInput, {
      scope: 'nearby',
      roomId: 'global_nearby',
      lat: pos.lat,
      lng: pos.lng,
    });
    this.hangoutsInput = '';

    // If user chats near Aria or Zane bot, give a friendly contextual reply so solo testers see live 2-way chat!
    if (sent && this.otherMarkers.length > 0) {
      const aria = this.otherUsers.find((u) => u.id === 'citizen_aria');
      if (aria && Math.random() < 0.65) {
        setTimeout(() => {
          this.meta. broadcastEvent('message', {
            id: 'bot_' + Date.now(),
            roomId: 'global_nearby',
            scope: 'nearby',
            senderId: aria.id,
            senderName: aria.fullname,
            senderUsername: aria.username,
            senderAvatar: aria.image,
            message: `Hey @${this.meta.getCurrentUsername()}! Welcome to FlatMeta :) Try selecting squares in Buy Mode!`,
            expression: 'Smile',
            created_at: new Date().toISOString(),
          });
          this.displaySpeechBubble(
            aria.id,
            `Hey @${this.meta.getCurrentUsername()}! Welcome to FlatMeta :)`,
            'Smile'
          );
        }, 1400);
      }
    }

    setTimeout(() => this.scrollToBottomHangouts(), 60);
  }

  private scrollToBottomHangouts() {
    if (this.hangoutsScroll?.nativeElement) {
      const el = this.hangoutsScroll.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  public toggleChatScopeSetting() {
    const next = this.settings.chatScope === 'everyone' ? 'friends' : 'everyone';
    this.meta.updateSettings({ chatScope: next });
    this.general.presentToast(
      next === 'everyone' ? 'Chat set to: Everyone Nearby' : 'Chat set to: Friends Only'
    );
  }

  public cycleAvatarVisibilitySetting() {
    const order: Array<UserSettings['avatarVisibility']> = ['all', 'friends', 'none'];
    const next = order[(order.indexOf(this.settings.avatarVisibility) + 1) % order.length];
    this.meta.updateSettings({ avatarVisibility: next });
    this.general.presentToast(`Show Avatars: ${next.toUpperCase()}`);
  }

  // ============================================================================
  // 11. BACKEND API INTEGRATION & FALLBACKS
  // ============================================================================

  public teleportToLandItem(item: any) {
    if (!item) return;
    if (item.lat !== undefined && item.lng !== undefined) {
      this.flyToAndMoveAvatar(Number(item.lat), Number(item.lng), 15);
      return;
    }
    const id = item.order_id || item.id;
    const localArea = this.meta.getGroupedAreas().find((a) => String(a.order_id) === String(id));
    if (localArea) {
      this.flyToAndMoveAvatar(localArea.lat, localArea.lng, 15);
      return;
    }
    this.getUserTilesbyId(id);
  }

  getUserTilesbyId(id: any) {
    this.http.get2('GetUserTilesByOrderId/' + id, false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.tiles?.length > 0) {
          const firstTile = res.data.tiles[0];
          this.flyToAndMoveAvatar(Number(firstTile.lat), Number(firstTile.lng), 15);
        }
      },
      () => {}
    );
  }

  getSoldBox() {
    this.http.get2('PurchasedTiles', false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.tiles) {
          this.meta.mergeBackendTiles(res.data.tiles);
        }
      },
      () => {}
    );
  }

  getBoxImgs() {
    // Built-in rich preset tile graphics so image picker always has options even offline
    const builtInPresets = [
      {
        name: 'flatmeta_cyber',
        country: 'Cyber Neon Grid',
        url: this.meta.generateLandBannerDataUrl('CYBER ZONE', 'FlatMeta District', 'cyan'),
      },
      {
        name: 'flatmeta_emerald',
        country: 'Emerald Oasis',
        url: this.meta.generateLandBannerDataUrl('EMERALD PARK', 'Verified Land', 'emerald'),
      },
      {
        name: 'flatmeta_purple',
        country: 'Creator Studio',
        url: this.meta.generateLandBannerDataUrl('CREATOR HUB', '2D Metaverse', 'purple'),
      },
      {
        name: 'flatmeta_gold',
        country: 'Gold Plaza',
        url: this.meta.generateLandBannerDataUrl('GOLD PLAZA', 'Prime Real Estate', 'amber'),
      },
      { name: 'uk_flag', country: 'United Kingdom', url: 'https://flagcdn.com/w320/gb.png' },
      { name: 'us_flag', country: 'United States', url: 'https://flagcdn.com/w320/us.png' },
      { name: 'pk_flag', country: 'Pakistan', url: 'https://flagcdn.com/w320/pk.png' },
      { name: 'ae_flag', country: 'United Arab Emirates', url: 'https://flagcdn.com/w320/ae.png' },
      { name: 'ca_flag', country: 'Canada', url: 'https://flagcdn.com/w320/ca.png' },
    ];
    this.boxImgs = [...builtInPresets];
    this.boxImgs2 = [...builtInPresets];

    this.http.get2('BoxImages', false).subscribe(
      (res: any) => {
        if (res.status === true && Array.isArray(res.data?.images)) {
          this.boxImgs = [...builtInPresets, ...res.data.images];
          this.boxImgs2 = [...this.boxImgs];
        }
      },
      () => {}
    );
  }

  getReportList() {
    this.http.get('GetAllReportText', false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.reports?.length) {
          this.reportList = res.data.reports;
        }
      },
      () => {}
    );
  }

  getMapUser() {
    const currentUserId = this.user_id || 1;
    this.http.post2('GetAllUser', { user_id: currentUserId }, false).subscribe(
      (res: any) => {
        if (res.status === true && res.data?.users) {
          res.data.users.forEach((u: any) => {
            if (u.latLng && String(u.id) !== String(this.user_id)) {
              this.addOtherMarkers({
                userId: u.id,
                fullname: u.fullname,
                username: u.username,
                image: u.image,
                location: u.latLng,
              });
            }
          });
        }
      },
      () => {}
    );
  }

  async showChat(id: any, name: string) {
    const modal = await this.modalController.create({
      component: ChatComponent,
      mode: 'ios',
      presentingElement: this.routerOutlet.nativeEl,
      componentProps: { id, name },
    });
    return await modal.present();
  }

  sendRequest(id: any) {
    this.http.post('SendFriendRequest', { follower_user_id: id }, false).subscribe({
      next: () => {},
      error: () => {},
    });
  }

  public getSessionUserId(): string {
    return this.meta.getCurrentUserId();
  }

  emitLocation(latLng: any) {
    if (!latLng) return;
    const lat = latLng.lat !== undefined ? latLng.lat : latLng[0];
    const lng = latLng.lng !== undefined ? latLng.lng : latLng[1];
    this.meta.emitMyLocation(Number(lat), Number(lng), this.myExpression);
  }

  searchIcon(evt: any) {
    const searchTerm = evt?.detail?.value;
    if (!searchTerm) {
      this.boxImgs = this.boxImgs2;
      return;
    }
    this.boxImgs = this.boxImgs2.filter((currentSer) => {
      return currentSer.country && currentSer.country.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }

  reportUser(id: any) {
    if (!this.toReportUser) return;
    const rpt = {
      user_id: this.toReportUser.id,
      report_id: id,
      report_text: '',
    };
    this.reportPopover = false;
    this.toReportUser = undefined;
    this.general.presentToast('Report submitted. Thank you for keeping FlatMeta safe.');
    this.http.post('AddUserReport', rpt, false).subscribe({ next: () => {}, error: () => {} });
  }
}
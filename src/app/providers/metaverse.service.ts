import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { WebSocketService } from './websocket.service';
import { GlobaldataService } from './globaldata.service';

export interface AvatarConfig {
  topType: string;
  accessoriesType: string;
  hairColor: string;
  facialHairType: string;
  clotheType: string;
  eyeType: string;
  eyebrowType: string;
  mouthType: string;
  skinColor: string;
  circleBg: string;
  customImage?: string;
}

export interface LandTile {
  gx: number;
  gy: number;
  lat: number;
  lng: number;
  order_id: string;
  area_id: string;
  user_id: string;
  username: string;
  fullname: string;
  user_avatar?: string;
  image: string;
  previous_image?: string;
  span_bounds?: {
    minGx: number;
    minGy: number;
    maxGx: number;
    maxGy: number;
  } | null;
  area_title?: string;
  slug?: string;
  three_words?: string;
  custom_details?: string;
  embed_url?: string;
  on_sale?: boolean;
  sale_price?: number;
  amount?: number;
  views?: number;
  promoted?: boolean;
  created_at?: string;
}

export interface LandAreaSummary {
  order_id: string;
  area_id: string;
  user_id: string;
  username: string;
  fullname: string;
  user_avatar?: string;
  title: string;
  slug: string;
  three_words: string;
  location_label: string;
  custom_details: string;
  description?: string;
  embed_url?: string;
  image: string;
  no_of_tiles: number;
  lat: number;
  lng: number;
  center_lat: number;
  center_lng: number;
  amount: number;
  sale_price: number;
  total_sale_value: number;
  on_sale: boolean;
  is_mine?: boolean;
  sale_status: string;
  views: number;
  promoted: boolean;
  created_at: string;
  updated_at: string;
  tiles: LandTile[];
}

export type LandAreaGroup = LandAreaSummary;

export interface SavedPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  three_words: string;
  created_at: string;
}

export interface LiveChatMessage {
  id: string;
  roomId: string;
  scope: 'nearby' | 'direct';
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string;
  recipientId?: string;
  message: string;
  expression?: string;
  lat?: number;
  lng?: number;
  created_at: string;
}

export interface RoamingCitizen {
  id: string;
  fullname: string;
  username: string;
  image: string;
  avatarConfig?: AvatarConfig;
  lat: number;
  lng: number;
  friends: boolean;
  isBot?: boolean;
  typingText?: string;
  lastExpression?: string;
  lastSeen: number;
}

export interface UserSettings {
  chatScope: 'everyone' | 'friends';
  avatarVisibility: 'all' | 'friends' | 'none';
  showGridBordersOnImages: boolean;
}

export interface PortfolioStats {
  totalTilesOwned: number;
  ownedTilesCount: number;
  freeQuotaTotal: number;
  freeQuotaUsed: number;
  freeQuotaRemaining: number;
  freeSquaresRemaining: number;
  billableTiles: number;
  paidSubscriptionSquares: number;
  monthlySubscriptionCost: number;
  monthlySubscriptionUsd: number;
  estimatedWorth: number;
  worthUsd: number;
  totalBoughtUsd: number;
  boughtTotalUsd: number;
  totalSoldUsd: number;
  soldTotalUsd: number;
  unsavedGuestChanges: number;
}

const STORAGE_KEYS = {
  GUEST_PROFILE: 'flatmeta_guest_profile_v2',
  TILES: 'flatmeta_land_tiles_v2',
  PINS: 'flatmeta_saved_pins_v2',
  CHAT_HISTORY: 'flatmeta_chat_history_v2',
  SETTINGS: 'flatmeta_user_settings_v2',
  LEDGER: 'flatmeta_ledger_stats_v2',
  CART: 'flatmeta_guest_cart_v2',
  FRIENDS: 'flatmeta_connections_v2',
};

const WORD_LIST = [
  'alpha', 'orbit', 'nexus', 'cyber', 'solar', 'lunar', 'pixel', 'prism',
  'atlas', 'nova', 'pulse', 'spark', 'crest', 'haven', 'plaza', 'tower',
  'delta', 'metro', 'oasis', 'prime', 'coral', 'amber', 'azure', 'emerald',
  'crown', 'ridge', 'forge', 'bloom', 'drift', 'globe', 'light', 'matrix'
];

@Injectable({
  providedIn: 'root',
})
export class MetaverseService {
  public static readonly FREE_TILE_QUOTA = 100;
  public static readonly PRICE_PER_TILE_MONTH = 0.10;
  public static readonly PLATFORM_COMMISSION_RATE = 0.10;
  public static readonly FLATMETA_HOME_COORDS: [number, number] = [51.50972, -0.104317];
  public static readonly GRID_ZOOM = 15;
  public static readonly TILE_PIXEL_SIZE = 40;

  private broadcastChannel: BroadcastChannel | null = null;

  public tiles$ = new BehaviorSubject<LandTile[]>([]);
  public pins$ = new BehaviorSubject<SavedPin[]>([]);
  public chatMessages$ = new BehaviorSubject<LiveChatMessage[]>([]);
  public settings$ = new BehaviorSubject<UserSettings>({
    chatScope: 'everyone',
    avatarVisibility: 'all',
    showGridBordersOnImages: false,
  });
  public stats$ = new BehaviorSubject<PortfolioStats>({
    totalTilesOwned: 0,
    ownedTilesCount: 0,
    freeQuotaTotal: MetaverseService.FREE_TILE_QUOTA,
    freeQuotaUsed: 0,
    freeQuotaRemaining: MetaverseService.FREE_TILE_QUOTA,
    freeSquaresRemaining: MetaverseService.FREE_TILE_QUOTA,
    billableTiles: 0,
    paidSubscriptionSquares: 0,
    monthlySubscriptionCost: 0,
    monthlySubscriptionUsd: 0,
    estimatedWorth: 0,
    worthUsd: 0,
    totalBoughtUsd: 0,
    boughtTotalUsd: 0,
    totalSoldUsd: 0,
    soldTotalUsd: 0,
    unsavedGuestChanges: 0,
  });

  public remoteLocation$ = new Subject<any>();
  public remoteTyping$ = new Subject<{ userId: string; username: string; text: string }>();
  public remoteDisconnect$ = new Subject<string>();
  public speechBubble$ = new Subject<{ senderId: string; text: string; expression?: string }>();
  public openAuthModal$ = new Subject<{ reason?: string; mode?: 'email-quick' | 'login' | 'signup' }>();

  private guestProfile: {
    id: string;
    fullname: string;
    username: string;
    email: string;
    user_image: string;
    avatarConfig: AvatarConfig;
    unsavedChanges: number;
  };

  private ledger = {
    totalBoughtUsd: 0,
    totalSoldUsd: 0,
  };

  private friendIds = new Set<string>();

  constructor(private socket: WebSocketService, private zone: NgZone) {
    this.initGuestProfile();
    this.loadSettings();
    this.loadLedger();
    this.loadFriends();
    this.loadPins();
    this.loadTiles();
    this.loadChatHistory();
    this.initRealtimeBus();
    this.recalculateStats();
  }

  // ============================================================================
  // 1. DETERMINISTIC GRID MATH (gx, gy <-> lat, lng at Zoom 15)
  // ============================================================================

  /**
   * Converts (lat, lng) into deterministic integer grid coordinates (gx, gy)
   * matching a 40x40 pixel grid at Leaflet zoom 15.
   */
  public latLngToGrid(lat: number, lng: number): { gx: number; gy: number } {
    const worldSize = 256 * Math.pow(2, MetaverseService.GRID_ZOOM);
    const x = ((lng + 180) / 360) * worldSize;
    const sinLat = Math.sin((lat * Math.PI) / 180);
    const y = (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * worldSize;
    return {
      gx: Math.floor(x / MetaverseService.TILE_PIXEL_SIZE),
      gy: Math.floor(y / MetaverseService.TILE_PIXEL_SIZE),
    };
  }

  /**
   * Converts integer grid indices (gx, gy) back to the North-West (lat, lng) corner
   */
  public gridToLatLng(gx: number, gy: number): { lat: number; lng: number } {
    const worldSize = 256 * Math.pow(2, MetaverseService.GRID_ZOOM);
    const px = gx * MetaverseService.TILE_PIXEL_SIZE;
    const py = gy * MetaverseService.TILE_PIXEL_SIZE;
    const lng = (px / worldSize) * 360 - 180;
    const n = Math.PI - (2 * Math.PI * py) / worldSize;
    const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
    return {
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
    };
  }

  /**
   * Generates a deterministic 3-word address from grid indices (gx, gy)
   */
  public gridToThreeWords(gx: number, gy: number): string {
    const hash1 = Math.abs((gx * 73856093) ^ (gy * 19349663));
    const hash2 = Math.abs((gx * 83492791) ^ (gy * 479001599));
    const hash3 = Math.abs((gx + gy) * 2654435761);
    const w1 = WORD_LIST[hash1 % WORD_LIST.length];
    const w2 = WORD_LIST[hash2 % WORD_LIST.length];
    const w3 = WORD_LIST[hash3 % WORD_LIST.length];
    return `${w1}.${w2}.${w3}`;
  }

  // ============================================================================
  // 2. GUEST-FIRST IDENTITY & AVATAR SVG ENGINE
  // ============================================================================

  private initGuestProfile() {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.GUEST_PROFILE);
      if (saved) {
        this.guestProfile = JSON.parse(saved);
        if (!this.guestProfile.avatarConfig) {
          this.guestProfile.avatarConfig = this.createRandomAvatarConfig();
          this.guestProfile.user_image = this.generateAvatarDataUrl(this.guestProfile.avatarConfig);
        }
        return;
      }
    } catch (e) {}

    let sessionGuestId = sessionStorage.getItem('flatmeta_guest_id');
    if (!sessionGuestId) {
      sessionGuestId = 'guest_' + Math.floor(1000 + Math.random() * 9000);
      sessionStorage.setItem('flatmeta_guest_id', sessionGuestId);
    }
    const shortNum = sessionGuestId.replace('guest_', '');
    const avatarConfig = this.createRandomAvatarConfig();
    this.guestProfile = {
      id: sessionGuestId,
      fullname: `Guest #${shortNum}`,
      username: `guest_${shortNum}`,
      email: '',
      user_image: this.generateAvatarDataUrl(avatarConfig),
      avatarConfig,
      unsavedChanges: 0,
    };
    this.saveGuestProfile();
  }

  private saveGuestProfile() {
    try {
      localStorage.setItem(STORAGE_KEYS.GUEST_PROFILE, JSON.stringify(this.guestProfile));
    } catch (e) {}
  }

  public getCurrentUserId(): string {
    if (GlobaldataService.userObject) {
      const uid = GlobaldataService.userObject.user_id || GlobaldataService.userObject.id;
      if (uid) return String(uid);
    }
    return this.guestProfile.id;
  }

  public getCurrentUsername(): string {
    if (GlobaldataService.userObject?.username) {
      return GlobaldataService.userObject.username;
    }
    return this.guestProfile.username || 'Guest';
  }

  public getCurrentFullname(): string {
    if (GlobaldataService.userObject?.fullname) {
      return GlobaldataService.userObject.fullname;
    }
    return this.guestProfile.fullname || 'Guest';
  }

  public getCurrentAvatar(): string {
    if (GlobaldataService.userObject?.user_image) {
      return GlobaldataService.userObject.user_image;
    }
    return this.guestProfile.user_image;
  }

  public getCurrentIdentity(): {
    user_id: string;
    username: string;
    fullname: string;
    email: string;
    user_image: string;
    is_guest: boolean;
  } {
    return {
      user_id: this.getCurrentUserId(),
      username: this.getCurrentUsername(),
      fullname: this.getCurrentFullname(),
      email: GlobaldataService.userObject?.email || this.guestProfile.email || '',
      user_image: this.getCurrentAvatar(),
      is_guest: this.isGuest(),
    };
  }

  public getAvatarConfig(): AvatarConfig {
    if (GlobaldataService.userObject?.avatarConfig) {
      return GlobaldataService.userObject.avatarConfig;
    }
    return { ...this.guestProfile.avatarConfig };
  }

  public saveAvatarConfig(config: AvatarConfig): string {
    return this.updateAvatarConfig(config);
  }

  public randomizeAvatarConfig(): AvatarConfig {
    return this.createRandomAvatarConfig();
  }

  public broadcastPresence(action: string = 'update') {
    this.broadcastEvent('presence', {
      action,
      userId: this.getCurrentUserId(),
      username: this.getCurrentUsername(),
      fullname: this.getCurrentFullname(),
      image: this.getCurrentAvatar(),
    });
  }

  public get avatarVisibility(): 'all' | 'friends' | 'none' {
    return this.settings$.value.avatarVisibility;
  }

  public set avatarVisibility(val: 'all' | 'friends' | 'none') {
    this.updateSettings({ avatarVisibility: val });
  }

  public get chatScope(): 'everyone' | 'friends' {
    return this.settings$.value.chatScope;
  }

  public set chatScope(val: 'everyone' | 'friends') {
    this.updateSettings({ chatScope: val });
  }

  public isGuest(): boolean {
    return !GlobaldataService.userObject;
  }

  public updateAvatarConfig(config: AvatarConfig, customDataUrl?: string): string {
    this.guestProfile.avatarConfig = { ...config };
    const dataUrl = customDataUrl || this.generateAvatarDataUrl(config);
    this.guestProfile.user_image = dataUrl;
    if (this.isGuest()) {
      this.guestProfile.unsavedChanges++;
    } else if (GlobaldataService.userObject) {
      GlobaldataService.userObject.user_image = dataUrl;
      GlobaldataService.userObject.avatarConfig = { ...config };
    }
    this.saveGuestProfile();
    this.recalculateStats();
    return dataUrl;
  }

  public updateIdentity(fullname: string, username: string, email?: string) {
    this.guestProfile.fullname = fullname.trim() || this.guestProfile.fullname;
    this.guestProfile.username = username.trim().replace(/\s+/g, '_').toLowerCase() || this.guestProfile.username;
    if (email) {
      this.guestProfile.email = email.trim().toLowerCase();
    }
    if (GlobaldataService.userObject) {
      GlobaldataService.userObject.fullname = this.guestProfile.fullname;
      GlobaldataService.userObject.username = this.guestProfile.username;
      if (email) GlobaldataService.userObject.email = this.guestProfile.email;
    }
    this.saveGuestProfile();
  }

  /**
   * Upgrades a guest session to a verified account using just an email (Brief 06/01/23)
   * and migrates all guest-owned tiles & pins to the verified user profile.
   */
  public verifyEmailAndUpgradeGuest(email: string, username?: string, fullname?: string): any {
    const cleanEmail = email.trim().toLowerCase();
    const derivedHandle = (username || cleanEmail.split('@')[0] || this.guestProfile.username)
      .replace(/[^a-zA-Z0-9_]/g, '_')
      .toLowerCase();
    const derivedName = fullname?.trim() || derivedHandle.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

    const oldGuestId = this.guestProfile.id;
    const newUserId = 'user_' + Math.abs(this.hashString(cleanEmail));

    const userObj = {
      id: newUserId,
      user_id: newUserId,
      email: cleanEmail,
      username: derivedHandle,
      fullname: derivedName,
      user_image: this.guestProfile.user_image,
      avatarConfig: this.guestProfile.avatarConfig,
      verified: true,
    };

    // Migrate guest tiles to verified user ID
    const tiles = this.tiles$.value.map((t) => {
      if (String(t.user_id) === String(oldGuestId) || String(t.user_id) === String(newUserId)) {
        return {
          ...t,
          user_id: newUserId,
          username: derivedHandle,
          fullname: derivedName,
          user_avatar: userObj.user_image,
        };
      }
      return t;
    });

    this.guestProfile.unsavedChanges = 0;
    this.guestProfile.email = cleanEmail;
    this.guestProfile.username = derivedHandle;
    this.guestProfile.fullname = derivedName;
    this.saveGuestProfile();

    GlobaldataService.userObject = userObj;
    GlobaldataService.loginToken = 'flatmeta_verified_' + btoa(cleanEmail);

    this.saveTiles(tiles);
    this.recalculateStats();
    return userObj;
  }

  private hashString(str: string): number {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(31, h) + str.charCodeAt(i) | 0;
    }
    return h;
  }

  public createRandomAvatarConfig(): AvatarConfig {
    const pick = (arr: string[]) => arr[Math.floor(Math.random() * arr.length)];
    const cleanTops = GlobaldataService.topType.map((s) => s.replace(/,/g, ''));
    const circles = ['#2563eb', '#0891b2', '#7c3aed', '#059669', '#db2777', '#d97706', '#4f46e5'];
    return {
      topType: pick(cleanTops),
      accessoriesType: pick(GlobaldataService.accessoriesType),
      hairColor: pick(GlobaldataService.hairColor),
      facialHairType: pick(GlobaldataService.facialHairType),
      clotheType: pick(GlobaldataService.clotheType),
      eyeType: pick(['Default', 'Happy', 'Wink', 'Surprised', 'Hearts']),
      eyebrowType: pick(['Default', 'DefaultNatural', 'RaisedExcited', 'UpDown']),
      mouthType: pick(['Smile', 'Twinkle', 'Default', 'Tongue']),
      skinColor: pick(GlobaldataService.skinColor),
      circleBg: pick(circles),
    };
  }

  /**
   * Detects smileys in a chat message and returns an expression key
   * Brief: "as you type a smiley - your characters face changes to it."
   */
  public detectSmileyExpression(text: string): string | undefined {
    if (!text) return undefined;
    if (/(:\)|:-\)|😊|🙂|😄)/.test(text)) return 'Smile';
    if (/(:D|:-D|😂|🤣|😆)/.test(text)) return 'Twinkle';
    if (/(:\(|:-\(|😢|😭|☹️)/.test(text)) return 'Sad';
    if (/(:O|:-O|:o|😮|😱)/.test(text)) return 'ScreamOpen';
    if (/(;\)|;-\)|😉)/.test(text)) return 'Wink';
    if (/(<3|❤️|😍|🥰)/.test(text)) return 'Hearts';
    if (/(:P|:-P|:p|😛|😜)/.test(text)) return 'Tongue';
    if (/(B\)|8\)|😎)/.test(text)) return 'Cool';
    return undefined;
  }

  /**
   * Generates a crisp, self-contained SVG data URI for an avatar configuration.
   * Works 100% offline/client-side without external SSRF or broken URLs.
   */
  public generateAvatarDataUrl(config: AvatarConfig, expressionOverride?: string): string {
    if (config?.customImage) {
      return config.customImage;
    }
    const c = config || this.createRandomAvatarConfig();
    const skinMap: Record<string, string> = {
      Tanned: '#FD9841',
      Yellow: '#F8D25C',
      Pale: '#FFDBB4',
      Light: '#EDB98A',
      Brown: '#D08B5B',
      DarkBrown: '#AE5D29',
      Black: '#614335',
    };
    const hairMap: Record<string, string> = {
      Auburn: '#A55728',
      Black: '#2C1B18',
      Blonde: '#B58143',
      BlondeGolden: '#D6B370',
      Brown: '#724133',
      BrownDark: '#4A312C',
      PastelPink: '#F59797',
      Blue: '#006494',
      Platinum: '#ECDCBF',
      Red: '#C93305',
      SilverGray: '#E8E1E1',
    };
    const clothMap: Record<string, string> = {
      BlazerShirt: '#1e293b',
      BlazerSweater: '#334155',
      CollarSweater: '#0284c7',
      GraphicShirt: '#10b981',
      Overall: '#ea580c',
      ShirtCrewNeck: '#6366f1',
      ShirtScoopNeck: '#ec4899',
      ShirtVNeck: '#8b5cf6',
    };

    const skin = skinMap[c.skinColor] || '#FFDBB4';
    const hair = hairMap[c.hairColor] || '#4A312C';
    const cloth = clothMap[c.clotheType] || '#3b82f6';
    const bg = c.circleBg || '#2563eb';

    const effectiveMouth = expressionOverride || c.mouthType || 'Smile';
    const effectiveEye =
      expressionOverride === 'Wink'
        ? 'Wink'
        : expressionOverride === 'Hearts'
        ? 'Hearts'
        : expressionOverride === 'ScreamOpen'
        ? 'Surprised'
        : c.eyeType || 'Default';

    // Eyes SVG
    let eyesSvg = `<circle cx="38" cy="46" r="3.4" fill="#1e293b"/><circle cx="62" cy="46" r="3.4" fill="#1e293b"/><circle cx="39.2" cy="44.8" r="1.1" fill="#fff"/><circle cx="63.2" cy="44.8" r="1.1" fill="#fff"/>`;
    if (effectiveEye === 'Happy' || effectiveEye === 'Close') {
      eyesSvg = `<path d="M33 46 Q38 41 43 46" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M57 46 Q62 41 67 46" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
    } else if (effectiveEye === 'Wink' || effectiveEye === 'WinkWacky') {
      eyesSvg = `<path d="M33 46 Q38 41 43 46" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/><circle cx="62" cy="46" r="3.6" fill="#1e293b"/><circle cx="63.2" cy="44.8" r="1.2" fill="#fff"/>`;
    } else if (effectiveEye === 'Hearts') {
      eyesSvg = `<path d="M38 49 L34 45 A2.5 2.5 0 0 1 38 42 A2.5 2.5 0 0 1 42 45 Z" fill="#f43f5e"/><path d="M62 49 L58 45 A2.5 2.5 0 0 1 62 42 A2.5 2.5 0 0 1 66 45 Z" fill="#f43f5e"/>`;
    } else if (effectiveEye === 'Surprised' || effectiveEye === 'Dizzy') {
      eyesSvg = `<circle cx="38" cy="46" r="4.6" fill="#fff" stroke="#1e293b" stroke-width="2"/><circle cx="38" cy="46" r="2.2" fill="#1e293b"/><circle cx="62" cy="46" r="4.6" fill="#fff" stroke="#1e293b" stroke-width="2"/><circle cx="62" cy="46" r="2.2" fill="#1e293b"/>`;
    }

    // Eyebrows SVG
    let browSvg = `<path d="M32 39 Q38 36 44 39" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M56 39 Q62 36 68 39" stroke="${hair}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    if (c.eyebrowType?.includes('Angry')) {
      browSvg = `<path d="M32 37 L44 41" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/><path d="M68 37 L56 41" stroke="${hair}" stroke-width="2.6" stroke-linecap="round"/>`;
    }

    // Mouth SVG
    let mouthSvg = `<path d="M41 59 Q50 67 59 59" stroke="#1e293b" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (effectiveMouth === 'Twinkle' || effectiveMouth === 'Eating') {
      mouthSvg = `<path d="M39 57 Q50 70 61 57 Z" fill="#ffffff" stroke="#1e293b" stroke-width="2.4"/>`;
    } else if (effectiveMouth === 'Sad' || effectiveMouth === 'Concerned') {
      mouthSvg = `<path d="M41 64 Q50 56 59 64" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/>`;
    } else if (effectiveMouth === 'ScreamOpen' || effectiveMouth === 'Disbelief') {
      mouthSvg = `<ellipse cx="50" cy="61" rx="6" ry="5" fill="#991b1b" stroke="#1e293b" stroke-width="2.2"/>`;
    } else if (effectiveMouth === 'Tongue') {
      mouthSvg = `<path d="M41 58 Q50 66 59 58" stroke="#1e293b" stroke-width="2.8" fill="none" stroke-linecap="round"/><path d="M47 61 Q50 69 53 61 Z" fill="#fb7185"/>`;
    } else if (effectiveMouth === 'Serious' || effectiveMouth === 'Grimace') {
      mouthSvg = `<line x1="42" y1="60" x2="58" y2="60" stroke="#1e293b" stroke-width="2.8" stroke-linecap="round"/>`;
    }

    // Hair / Hat SVG
    let topSvg = `<path d="M24 42 C24 20 76 20 76 42 C72 29 60 26 50 26 C40 26 28 29 24 42 Z" fill="${hair}"/>`;
    if (c.topType === 'NoHair') {
      topSvg = '';
    } else if (c.topType?.includes('LongHair')) {
      topSvg = `<path d="M21 45 C20 18 80 18 79 45 L82 74 L71 74 L71 42 C64 29 36 29 29 42 L29 74 L18 74 Z" fill="${hair}"/>`;
    } else if (c.topType?.includes('Hat') || c.topType === 'Turban' || c.topType === 'Hijab') {
      topSvg = `<path d="M22 39 C22 19 78 19 78 39 Z" fill="#0f172a"/><rect x="17" y="36" width="66" height="6" rx="3" fill="#334155"/>`;
    }

    // Glasses / Accessories SVG
    let accSvg = '';
    if (c.accessoriesType && c.accessoriesType !== 'Blank') {
      const glassFill = c.accessoriesType === 'Sunglasses' || c.accessoriesType === 'Wayfarers' || expressionOverride === 'Cool'
        ? 'rgba(15,23,42,0.85)'
        : 'rgba(255,255,255,0.25)';
      accSvg = `<rect x="29" y="40" width="18" height="12" rx="4" fill="${glassFill}" stroke="#0f172a" stroke-width="2.4"/><rect x="53" y="40" width="18" height="12" rx="4" fill="${glassFill}" stroke="#0f172a" stroke-width="2.4"/><line x1="47" y1="45" x2="53" y2="45" stroke="#0f172a" stroke-width="2.4"/>`;
    } else if (expressionOverride === 'Cool') {
      accSvg = `<rect x="29" y="40" width="18" height="12" rx="3" fill="#0f172a"/><rect x="53" y="40" width="18" height="12" rx="3" fill="#0f172a"/><line x1="47" y1="45" x2="53" y2="45" stroke="#0f172a" stroke-width="2.6"/>`;
    }

    // Facial hair SVG
    let beardSvg = '';
    if (c.facialHairType && c.facialHairType !== 'Blank') {
      if (c.facialHairType.includes('Moustache')) {
        beardSvg = `<path d="M38 56 Q50 51 62 56 Q50 54 38 56 Z" fill="${hair}"/>`;
      } else {
        beardSvg = `<path d="M27 52 C27 72 73 72 73 52 L69 52 C67 65 33 65 31 52 Z" fill="${hair}" opacity="0.88"/>`;
      }
    }

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100">
      <circle cx="50" cy="50" r="48" fill="${bg}"/>
      <path d="M18 96 C20 74 80 74 82 96 Z" fill="${cloth}"/>
      <rect x="43" y="64" width="14" height="14" rx="5" fill="${skin}"/>
      <circle cx="25" cy="49" r="5" fill="${skin}"/>
      <circle cx="75" cy="49" r="5" fill="${skin}"/>
      <ellipse cx="50" cy="48" rx="24" ry="25" fill="${skin}"/>
      ${browSvg}
      ${eyesSvg}
      <path d="M48 50 Q50 54 52 50" stroke="rgba(0,0,0,0.28)" stroke-width="2" fill="none" stroke-linecap="round"/>
      ${beardSvg}
      ${mouthSvg}
      ${topSvg}
      ${accSvg}
    </svg>`;

    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  /**
   * Generates a crisp canvas/SVG banner image for showcase or default land
   */
  public generateLandBannerDataUrl(title: string, subtitle: string, theme: 'cyan' | 'emerald' | 'purple' | 'amber' = 'cyan'): string {
    const palettes: Record<string, [string, string, string]> = {
      cyan: ['#0f172a', '#0284c7', '#38bdf8'],
      emerald: ['#064e3b', '#059669', '#34d399'],
      purple: ['#2e1065', '#7c3aed', '#c084fc'],
      amber: ['#451a03', '#d97706', '#fbbf24'],
    };
    const [bg1, bg2, accent] = palettes[theme] || palettes.cyan;
    const safeTitle = title.replace(/[<>&"']/g, '');
    const safeSub = subtitle.replace(/[<>&"']/g, '');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bg1}"/>
          <stop offset="100%" stop-color="${bg2}"/>
        </linearGradient>
      </defs>
      <rect width="240" height="240" fill="url(#g)"/>
      <circle cx="200" cy="40" r="65" fill="${accent}" opacity="0.16"/>
      <circle cx="40" cy="200" r="55" fill="${accent}" opacity="0.12"/>
      <rect x="14" y="14" width="212" height="212" rx="16" fill="none" stroke="${accent}" stroke-width="2" stroke-opacity="0.45"/>
      <text x="120" y="95" text-anchor="middle" fill="${accent}" font-family="sans-serif" font-size="14" font-weight="700" letter-spacing="2">FLATMETA.IO</text>
      <text x="120" y="130" text-anchor="middle" fill="#ffffff" font-family="sans-serif" font-size="22" font-weight="800">${safeTitle}</text>
      <text x="120" y="158" text-anchor="middle" fill="#e2e8f0" font-family="sans-serif" font-size="13" font-weight="600">${safeSub}</text>
    </svg>`;
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  }

  // ============================================================================
  // 3. LAND TILES, SEEDED SHOWCASE AREAS & MULTI-TILE IMAGE SPANNING
  // ============================================================================

  private loadTiles() {
    let loaded: LandTile[] = [];
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.TILES);
      if (raw) {
        loaded = JSON.parse(raw);
      }
    } catch (e) {}

    if (!loaded || loaded.length === 0) {
      loaded = this.createInitialSeedTiles();
      this.saveTiles(loaded);
    } else {
      this.tiles$.next(loaded);
    }
  }

  private saveTiles(tiles: LandTile[]) {
    this.tiles$.next(tiles);
    try {
      localStorage.setItem(STORAGE_KEYS.TILES, JSON.stringify(tiles));
    } catch (e) {}
    this.recalculateStats();
  }

  /**
   * Seeds the FlatMeta Home showcase district ([51.50972, -0.104317]) and
   * sample Marketplace listings so the platform works immediately on first load.
   */
  private createInitialSeedTiles(): LandTile[] {
    const seeded: LandTile[] = [];
    const homeGrid = this.latLngToGrid(
      MetaverseService.FLATMETA_HOME_COORDS[0],
      MetaverseService.FLATMETA_HOME_COORDS[1]
    );

    // 1. FlatMeta Home Official 3x3 Showcase Area (9 tiles spanned by 1 seamless banner)
    const hMinGx = homeGrid.gx - 1;
    const hMaxGx = homeGrid.gx + 1;
    const hMinGy = homeGrid.gy - 1;
    const hMaxGy = homeGrid.gy + 1;
    const homeBanner = this.generateLandBannerDataUrl('FLATMETA HOME', 'Welcome HQ · 3x3 Area', 'cyan');

    for (let gx = hMinGx; gx <= hMaxGx; gx++) {
      for (let gy = hMinGy; gy <= hMaxGy; gy++) {
        const ll = this.gridToLatLng(gx, gy);
        seeded.push({
          gx,
          gy,
          lat: ll.lat,
          lng: ll.lng,
          order_id: 'flatmeta_home_hq',
          area_id: 'flatmeta_home_hq',
          user_id: 'flatmeta_official',
          username: 'flatmeta',
          fullname: 'FlatMeta Official HQ',
          user_avatar: 'assets/icon/favicon.png',
          image: homeBanner,
          span_bounds: { minGx: hMinGx, minGy: hMinGy, maxGx: hMaxGx, maxGy: hMaxGy },
          area_title: 'FlatMeta Official Home & Welcome Plaza',
          slug: 'flatmeta-home',
          three_words: 'flatmeta.welcome.home',
          custom_details:
            '<h4>Welcome to FlatMeta.io!</h4><p>This 3x3 multi-tile showcase is the official <strong>FlatMeta Home</strong> plaza. Every user gets <strong>100 free squares</strong> to claim and personalize with custom images, multi-tile banners, custom URLs, and interactive content!</p><ul><li>Double-click or use arrow keys to walk your avatar</li><li>Chat live with nearby citizens in the Hangouts bar</li><li>Toggle the <strong>Buy Grid</strong> at 15x zoom to claim land</li></ul>',
          on_sale: false,
          sale_price: 0,
          amount: 0.1,
          views: 420,
          promoted: true,
          created_at: '2026-10-01T10:00:00.000Z',
        });
      }
    }

    // 2. Sample Promoted Brand Area nearby ("Pepsi Land" - 2x2 spanned area, per Brief 06/01/23 line 107)
    const pMinGx = homeGrid.gx + 3;
    const pMaxGx = homeGrid.gx + 4;
    const pMinGy = homeGrid.gy - 1;
    const pMaxGy = homeGrid.gy;
    const pepsiBanner = this.generateLandBannerDataUrl('PEPSI LAND', 'flatmeta.io/u/pepsi-land', 'purple');

    for (let gx = pMinGx; gx <= pMaxGx; gx++) {
      for (let gy = pMinGy; gy <= pMaxGy; gy++) {
        const ll = this.gridToLatLng(gx, gy);
        seeded.push({
          gx,
          gy,
          lat: ll.lat,
          lng: ll.lng,
          order_id: 'area_pepsi_land',
          area_id: 'area_pepsi_land',
          user_id: 'citizen_brand_1',
          username: 'pepsi_official',
          fullname: 'Pepsi Brand Pavilion',
          image: pepsiBanner,
          span_bounds: { minGx: pMinGx, minGy: pMinGy, maxGx: pMaxGx, maxGy: pMaxGy },
          area_title: 'Pepsi Refresh Zone',
          slug: 'pepsi-land',
          three_words: 'pepsi.refresh.zone',
          custom_details:
            '<h4>Pepsi Refresh Pavilion</h4><p>Visit our 2x2 custom showcase at <code>flatmeta.io/u/pepsi-land</code>! Listed on the Marketplace for collectors.</p>',
          on_sale: true,
          sale_price: 2.5,
          amount: 0.1,
          views: 315,
          promoted: true,
          created_at: '2026-10-10T14:30:00.000Z',
        });
      }
    }

    // 3. Thames Cyber Gallery (2x1 On-Sale Listing nearby)
    const gMinGx = homeGrid.gx - 4;
    const gMaxGx = homeGrid.gx - 3;
    const gGy = homeGrid.gy + 1;
    const galleryBanner = this.generateLandBannerDataUrl('CYBER GALLERY', 'Prime Thames Riverfront', 'emerald');

    for (let gx = gMinGx; gx <= gMaxGx; gx++) {
      const ll = this.gridToLatLng(gx, gGy);
      seeded.push({
        gx,
        gy: gGy,
        lat: ll.lat,
        lng: ll.lng,
        order_id: 'area_cyber_gallery',
        area_id: 'area_cyber_gallery',
        user_id: 'citizen_art_2',
        username: 'neo_architect',
        fullname: 'Neo Architect Studio',
        image: galleryBanner,
        span_bounds: { minGx: gMinGx, minGy: gGy, maxGx: gMaxGx, maxGy: gGy },
        area_title: 'Thames Riverfront Art Deck',
        slug: 'cyber-gallery',
        three_words: 'thames.cyber.deck',
        custom_details:
          '<h4>Thames Riverfront Art Deck</h4><p>Prime 2-tile riverfront parcel right next to FlatMeta Home. Available for immediate acquisition!</p>',
        on_sale: true,
        sale_price: 1.5,
        amount: 0.1,
        views: 190,
        promoted: false,
        created_at: '2026-10-12T09:15:00.000Z',
      });
    }

    // 4. London Eye Sky Lounge (Single tile listing)
    const sGx = homeGrid.gx;
    const sGy = homeGrid.gy + 3;
    const sLl = this.gridToLatLng(sGx, sGy);
    seeded.push({
      gx: sGx,
      gy: sGy,
      lat: sLl.lat,
      lng: sLl.lng,
      order_id: 'area_sky_lounge',
      area_id: 'area_sky_lounge',
      user_id: 'citizen_sky_3',
      username: 'london_trader',
      fullname: 'London Meta Trader',
      image: this.generateLandBannerDataUrl('SKY LOUNGE', '1x1 Prime Corner', 'amber'),
      span_bounds: null,
      area_title: 'Southbank Sky Lounge',
      slug: 'sky-lounge',
      three_words: 'south.sky.lounge',
      custom_details: '<p>High-footfall corner square south of FlatMeta Home.</p>',
      on_sale: true,
      sale_price: 0.8,
      amount: 0.1,
      views: 95,
      promoted: false,
      created_at: '2026-10-13T18:00:00.000Z',
    });

    return seeded;
  }

  /**
   * Merges backend API tiles (`PurchasedTiles`) into our deterministic grid store
   */
  public mergeBackendTiles(apiTiles: any[]) {
    if (!Array.isArray(apiTiles) || apiTiles.length === 0) return;
    const current = [...this.tiles$.value];

    apiTiles.forEach((raw) => {
      const lat = Number(raw.lat);
      const lng = Number(raw.lng);
      if (isNaN(lat) || isNaN(lng)) return;

      const { gx, gy } = this.latLngToGrid(lat, lng);
      const existsIdx = current.findIndex((t) => t.gx === gx && t.gy === gy);
      const snapped = this.gridToLatLng(gx, gy);
      const orderId = String(raw.order_id || raw.id || `order_${gx}_${gy}`);

      const mapped: LandTile = {
        gx,
        gy,
        lat: snapped.lat,
        lng: snapped.lng,
        order_id: orderId,
        area_id: orderId,
        user_id: String(raw.user_id || 'citizen'),
        username: raw.username || (raw.fullname ? raw.fullname.toLowerCase().replace(/\s+/g, '_') : 'citizen'),
        fullname: raw.fullname || 'Metaverse Citizen',
        image: raw.image || '',
        span_bounds: existsIdx > -1 ? current[existsIdx].span_bounds : null,
        area_title: raw.area_title || `Parcel #${orderId}`,
        slug: raw.slug || `parcel-${orderId}`,
        three_words: raw.three_words || this.gridToThreeWords(gx, gy),
        custom_details: raw.custom_details || '',
        on_sale: raw.sale_status == '1' || Number(raw.sale_price) > 0,
        sale_price: Number(raw.sale_price || 0),
        amount: Number(raw.amount || 0.1),
        views: Number(raw.views || 10),
        promoted: Boolean(raw.promoted),
        created_at: raw.created_at || new Date().toISOString(),
      };

      if (existsIdx > -1) {
        // Keep richer local properties if already customized
        current[existsIdx] = {
          ...mapped,
          ...current[existsIdx],
          image: current[existsIdx].image || mapped.image,
          custom_details: current[existsIdx].custom_details || mapped.custom_details,
        };
      } else {
        current.push(mapped);
      }
    });

    this.saveTiles(current);
  }

  public getTileAtGrid(gx: number, gy: number): LandTile | undefined {
    return this.tiles$.value.find((t) => t.gx === gx && t.gy === gy);
  }

  /**
   * Claims selected grid squares for the current user (Guest or Logged-in).
   * Respects the 100 Free Squares quota and updates portfolio stats.
   */
  public claimSelectedSquares(
    selections: Array<{ gx: number; gy: number; lat: number; lng: number }>,
    options?: { areaTitle?: string; slug?: string; customDetails?: string; image?: string; spanImage?: boolean }
  ): { claimed: LandTile[]; orderId: string; usedFreeQuota: number; billableAdded: number } {
    const uid = this.getCurrentUserId();
    const username = this.getCurrentUsername();
    const fullname = this.getCurrentFullname();
    const avatar = this.getCurrentAvatar();
    const current = [...this.tiles$.value];

    const available = selections.filter((s) => !current.some((t) => t.gx === s.gx && t.gy === s.gy));
    if (available.length === 0) {
      return { claimed: [], orderId: '', usedFreeQuota: 0, billableAdded: 0 };
    }

    const statsBefore = this.stats$.value;
    const freeLeft = statsBefore.freeQuotaRemaining;
    const usedFreeQuota = Math.min(freeLeft, available.length);
    const billableAdded = Math.max(0, available.length - usedFreeQuota);

    const orderId = 'deed_' + Date.now();
    const first = available[0];
    const defaultThreeWords = this.gridToThreeWords(first.gx, first.gy);
    const cleanSlug = (options?.slug || `${username}-${first.gx}-${first.gy}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-');

    let spanBounds: LandTile['span_bounds'] = null;
    if (options?.spanImage !== false && available.length > 1) {
      spanBounds = {
        minGx: Math.min(...available.map((a) => a.gx)),
        minGy: Math.min(...available.map((a) => a.gy)),
        maxGx: Math.max(...available.map((a) => a.gx)),
        maxGy: Math.max(...available.map((a) => a.gy)),
      };
    }

    const defaultBanner =
      options?.image !== undefined
        ? options.image
        : this.generateLandBannerDataUrl(
            options?.areaTitle || `${username.toUpperCase()}'S LAND`,
            `${available.length} Parcel${available.length > 1 ? 's' : ''} · ${defaultThreeWords}`,
            'emerald'
          );

    const claimed: LandTile[] = available.map((s) => {
      const snapped = this.gridToLatLng(s.gx, s.gy);
      return {
        gx: s.gx,
        gy: s.gy,
        lat: snapped.lat,
        lng: snapped.lng,
        order_id: orderId,
        area_id: orderId,
        user_id: uid,
        username,
        fullname,
        user_avatar: avatar,
        image: defaultBanner,
        span_bounds: spanBounds,
        area_title: options?.areaTitle || `${fullname}'s Land (${defaultThreeWords})`,
        slug: cleanSlug,
        three_words: this.gridToThreeWords(s.gx, s.gy),
        custom_details:
          options?.customDetails ||
          `<h4>${fullname}'s Land Area</h4><p>Address: <code>${defaultThreeWords}</code> · Share URL: <code>flatmeta.io/u/${cleanSlug}</code></p>`,
        on_sale: false,
        sale_price: 0,
        amount: usedFreeQuota >= available.length ? 0 : MetaverseService.PRICE_PER_TILE_MONTH,
        views: 1,
        promoted: false,
        created_at: new Date().toISOString(),
      };
    });

    current.push(...claimed);
    if (this.isGuest()) {
      this.guestProfile.unsavedChanges += claimed.length;
      this.saveGuestProfile();
    }
    if (billableAdded > 0) {
      this.ledger.totalBoughtUsd += billableAdded * MetaverseService.PRICE_PER_TILE_MONTH;
      this.saveLedger();
    }

    this.saveTiles(current);
    this.broadcastEvent('tiles_updated', { orderId, count: claimed.length });
    return { claimed, orderId, usedFreeQuota, billableAdded };
  }

  /**
   * Updates image on 1 or multiple owned tiles.
   * Supports spanning 1 image seamlessly across the bounding box of selected owned tiles!
   */
  public updateTilesArtwork(
    targetTiles: Array<{ gx: number; gy: number }>,
    imageUrl: string,
    spanAcrossSelection: boolean = true
  ) {
    if (!targetTiles.length) return;
    const current = [...this.tiles$.value];

    const spanBounds =
      spanAcrossSelection && targetTiles.length > 1
        ? {
            minGx: Math.min(...targetTiles.map((t) => t.gx)),
            minGy: Math.min(...targetTiles.map((t) => t.gy)),
            maxGx: Math.max(...targetTiles.map((t) => t.gx)),
            maxGy: Math.max(...targetTiles.map((t) => t.gy)),
          }
        : null;

    const sharedAreaId = 'area_' + Date.now();

    targetTiles.forEach((sel) => {
      const idx = current.findIndex((t) => t.gx === sel.gx && t.gy === sel.gy);
      if (idx > -1) {
        current[idx] = {
          ...current[idx],
          previous_image: current[idx].image || current[idx].previous_image,
          image: imageUrl,
          span_bounds: spanBounds,
          area_id: spanBounds ? sharedAreaId : current[idx].area_id,
        };
      }
    });

    if (this.isGuest()) {
      this.guestProfile.unsavedChanges++;
      this.saveGuestProfile();
    }
    this.saveTiles(current);
    this.broadcastEvent('tiles_updated', { updated: targetTiles.length });
  }

  /**
   * Reverts selected owned tiles back to their previous image or default map (no image)
   */
  public revertTilesArtwork(targetTiles: Array<{ gx: number; gy: number }>, toDefaultMap: boolean = false) {
    const current = [...this.tiles$.value];
    targetTiles.forEach((sel) => {
      const idx = current.findIndex((t) => t.gx === sel.gx && t.gy === sel.gy);
      if (idx > -1) {
        current[idx] = {
          ...current[idx],
          image: toDefaultMap ? '' : current[idx].previous_image || '',
          span_bounds: null,
        };
      }
    });
    this.saveTiles(current);
    this.broadcastEvent('tiles_updated', { reverted: targetTiles.length });
  }

  /**
   * Updates area metadata (Title, Custom URL slug, 3-word address, Rich HTML details, Interactive Embed URL, Sale Listing)
   */
  public updateAreaMetadata(
    targetTiles: Array<{ gx: number; gy: number }>,
    metadata: {
      area_title?: string;
      slug?: string;
      three_words?: string;
      custom_details?: string;
      embed_url?: string;
      on_sale?: boolean;
      sale_price?: number;
    }
  ) {
    if (!targetTiles.length) return;
    const current = [...this.tiles$.value];
    const cleanSlug = metadata.slug
      ? metadata.slug
          .trim()
          .toLowerCase()
          .replace(/^\/+|\/+$/g, '')
          .replace(/^u\//, '')
          .replace(/[^a-z0-9-_]/g, '-')
      : undefined;

    targetTiles.forEach((sel) => {
      const idx = current.findIndex((t) => t.gx === sel.gx && t.gy === sel.gy);
      if (idx > -1) {
        current[idx] = {
          ...current[idx],
          area_title: metadata.area_title !== undefined ? metadata.area_title : current[idx].area_title,
          slug: cleanSlug !== undefined ? cleanSlug : current[idx].slug,
          three_words: metadata.three_words !== undefined ? metadata.three_words : current[idx].three_words,
          custom_details: metadata.custom_details !== undefined ? metadata.custom_details : current[idx].custom_details,
          embed_url: metadata.embed_url !== undefined ? metadata.embed_url : current[idx].embed_url,
          on_sale: metadata.on_sale !== undefined ? metadata.on_sale : current[idx].on_sale,
          sale_price: metadata.sale_price !== undefined ? Number(metadata.sale_price) : current[idx].sale_price,
        };
      }
    });

    if (this.isGuest()) {
      this.guestProfile.unsavedChanges++;
      this.saveGuestProfile();
    }
    this.saveTiles(current);
    this.broadcastEvent('tiles_updated', { metadata: true });
  }

  /**
   * Releases (deletes ownership of) an area or set of tiles, updating subscription quantity
   */
  public releaseAreaByOrderId(orderId: string) {
    const filtered = this.tiles$.value.filter((t) => String(t.order_id) !== String(orderId) && String(t.area_id) !== String(orderId));
    this.saveTiles(filtered);
    this.broadcastEvent('tiles_updated', { released: orderId });
  }

  public releaseTiles(targetTiles: Array<{ gx: number; gy: number }>): number {
    if (!targetTiles?.length) return 0;
    const before = this.tiles$.value.length;
    const filtered = this.tiles$.value.filter((t) => !targetTiles.some((s) => s.gx === t.gx && s.gy === t.gy));
    this.saveTiles(filtered);
    this.broadcastEvent('tiles_updated', { releasedCount: before - filtered.length });
    return before - filtered.length;
  }

  public updateAreaDetails(
    areaIdOrOrderId: string,
    details: {
      title?: string;
      slug?: string;
      three_words?: string;
      description?: string;
      embed_url?: string;
      on_sale?: boolean;
      sale_price?: number;
    }
  ): { ok: boolean; message: string } {
    const matching = this.tiles$.value.filter(
      (t) => String(t.area_id) === String(areaIdOrOrderId) || String(t.order_id) === String(areaIdOrOrderId)
    );
    if (!matching.length) {
      return { ok: false, message: 'Land area not found.' };
    }
    this.updateAreaMetadata(
      matching.map((t) => ({ gx: t.gx, gy: t.gy })),
      {
        area_title: details.title,
        slug: details.slug,
        three_words: details.three_words,
        custom_details: details.description,
        embed_url: details.embed_url,
        on_sale: details.on_sale,
        sale_price: details.sale_price,
      }
    );
    return { ok: true, message: 'Land area & listing updated!' };
  }

  /**
   * Purchases an On-Sale listing from the marketplace and transfers ownership to the buyer,
   * recording the 10% platform commission and 90% seller payout!
   */
  public buyMarketplaceListing(orderId: string): {
    success: boolean;
    ok: boolean;
    message: string;
    totalPaid: number;
    commission: number;
    sellerNet: number;
    tilesTransferred: number;
    area?: LandAreaSummary;
  } {
    const current = [...this.tiles$.value];
    const targetTiles = current.filter(
      (t) => String(t.order_id) === String(orderId) || String(t.area_id) === String(orderId)
    );
    if (targetTiles.length === 0) {
      return {
        success: false,
        ok: false,
        message: 'Listing could not be found.',
        totalPaid: 0,
        commission: 0,
        sellerNet: 0,
        tilesTransferred: 0,
      };
    }

    const pricePerTile = Number(targetTiles[0].sale_price || targetTiles[0].amount || 0.5);
    const totalPaid = Number((pricePerTile * targetTiles.length).toFixed(2));
    const commission = Number((totalPaid * MetaverseService.PLATFORM_COMMISSION_RATE).toFixed(2));
    const sellerNet = Number((totalPaid - commission).toFixed(2));

    const buyerId = this.getCurrentUserId();
    const buyerUsername = this.getCurrentUsername();
    const buyerFullname = this.getCurrentFullname();
    const buyerAvatar = this.getCurrentAvatar();

    const updated = current.map((t) => {
      if (String(t.order_id) === String(orderId) || String(t.area_id) === String(orderId)) {
        return {
          ...t,
          user_id: buyerId,
          username: buyerUsername,
          fullname: buyerFullname,
          user_avatar: buyerAvatar,
          on_sale: false,
          amount: pricePerTile,
        };
      }
      return t;
    });

    this.ledger.totalBoughtUsd = Number((this.ledger.totalBoughtUsd + totalPaid).toFixed(2));
    this.saveLedger();
    this.saveTiles(updated);

    const areas = this.getGroupedAreas(updated);
    const boughtArea = areas.find(
      (a) => String(a.order_id) === String(orderId) || String(a.area_id) === String(orderId)
    );
    this.broadcastEvent('tiles_updated', { purchasedOrderId: orderId });

    return {
      success: true,
      ok: true,
      message: `Acquired ${targetTiles.length} square(s) for $${totalPaid.toFixed(2)} USD! You now own this land area.`,
      totalPaid,
      commission,
      sellerNet,
      tilesTransferred: targetTiles.length,
      area: boughtArea,
    };
  }

  /**
   * Groups individual tiles by `order_id` into LandAreaSummary objects for Marketplace,
   * My Land Portfolio, and Recent Purchases.
   */
  public getGroupedAreas(tilesInput?: LandTile[]): LandAreaSummary[] {
    const tiles = tilesInput || this.tiles$.value;
    const byOrder = new Map<string, LandTile[]>();
    const currentUid = this.getCurrentUserId();

    tiles.forEach((t) => {
      const key = String(t.order_id || t.area_id || `${t.gx}_${t.gy}`);
      if (!byOrder.has(key)) {
        byOrder.set(key, []);
      }
      byOrder.get(key)!.push(t);
    });

    const summaries: LandAreaSummary[] = [];
    byOrder.forEach((group, orderId) => {
      const first = group[0];
      const avgLat = group.reduce((s, x) => s + x.lat, 0) / group.length;
      const avgLng = group.reduce((s, x) => s + x.lng, 0) / group.length;
      const salePrice = Number(first.sale_price ?? 0);
      const createdAt = first.created_at || '2026-10-13T12:00:00.000Z';
      summaries.push({
        order_id: orderId,
        area_id: first.area_id || orderId,
        user_id: first.user_id,
        username: first.username || 'citizen',
        fullname: first.fullname || 'Metaverse Citizen',
        user_avatar: first.user_avatar,
        title: first.area_title || `Metaverse Plot #${orderId}`,
        slug: first.slug || orderId,
        three_words: first.three_words || this.gridToThreeWords(first.gx, first.gy),
        location_label: this.formatCoordsLabel(avgLat, avgLng),
        custom_details: first.custom_details || '',
        description: first.custom_details || '',
        embed_url: first.embed_url,
        image: first.image || 'assets/icon/placeholder-land.svg',
        no_of_tiles: group.length,
        lat: avgLat,
        lng: avgLng,
        center_lat: avgLat,
        center_lng: avgLng,
        amount: Number(first.amount ?? 0.1),
        sale_price: salePrice,
        total_sale_value: Number((salePrice * group.length).toFixed(2)),
        on_sale: Boolean(first.on_sale),
        is_mine: String(first.user_id) === String(currentUid),
        sale_status: first.on_sale ? '1' : '0',
        views: Number(first.views || 1),
        promoted: Boolean(first.promoted),
        created_at: createdAt,
        updated_at: createdAt,
        tiles: group,
      });
    });

    return summaries;
  }

  public getMyAreas(): LandAreaSummary[] {
    const uid = this.getCurrentUserId();
    return this.getGroupedAreas().filter((a) => String(a.user_id) === String(uid));
  }

  public getMarketplaceAreas(filter: 'recent' | 'popular' | 'promoted' | 'all' = 'all'): LandAreaSummary[] {
    let list = this.getGroupedAreas().filter((a) => a.on_sale && a.sale_price > 0);
    if (filter === 'promoted') {
      list = list.filter((a) => a.promoted);
    } else if (filter === 'popular') {
      list = [...list].sort((a, b) => b.views - a.views);
    } else {
      list = [...list].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
    }
    return list;
  }

  public findAreaBySlugOrThreeWords(query: string): LandAreaSummary | undefined {
    if (!query) return undefined;
    const q = query.trim().toLowerCase().replace(/^\/+|\/+$/g, '').replace(/^(u|uri)\//, '');
    const areas = this.getGroupedAreas();
    return areas.find(
      (a) =>
        a.slug?.toLowerCase() === q ||
        a.three_words?.toLowerCase() === q ||
        a.order_id?.toLowerCase() === q ||
        a.title?.toLowerCase() === q
    );
  }

  private formatCoordsLabel(lat: number, lng: number): string {
    if (Math.abs(lat - 51.5097) < 0.08 && Math.abs(lng - -0.1043) < 0.08) {
      return `London Prime (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
    }
    return `${lat.toFixed(4)}°, ${lng.toFixed(4)}°`;
  }

  // ============================================================================
  // 4. PORTFOLIO & QUOTA STATS (100 Free Squares + $0.10/mo + Worth)
  // ============================================================================

  public getPortfolioStats(): PortfolioStats {
    this.recalculateStats();
    return this.stats$.value;
  }

  public recalculateStats() {
    const uid = this.getCurrentUserId();
    const myTiles = this.tiles$.value.filter((t) => String(t.user_id) === String(uid));
    const totalOwned = myTiles.length;
    const freeUsed = Math.min(MetaverseService.FREE_TILE_QUOTA, totalOwned);
    const freeRemaining = Math.max(0, MetaverseService.FREE_TILE_QUOTA - totalOwned);
    const billable = Math.max(0, totalOwned - MetaverseService.FREE_TILE_QUOTA);
    const monthlyCost = Number((billable * MetaverseService.PRICE_PER_TILE_MONTH).toFixed(2));

    const estimatedWorth = Number(
      myTiles
        .reduce((sum, t) => sum + (t.on_sale && t.sale_price ? Number(t.sale_price) : Math.max(0.5, Number(t.amount || 0.5))), 0)
        .toFixed(2)
    );

    this.stats$.next({
      totalTilesOwned: totalOwned,
      ownedTilesCount: totalOwned,
      freeQuotaTotal: MetaverseService.FREE_TILE_QUOTA,
      freeQuotaUsed: freeUsed,
      freeQuotaRemaining: freeRemaining,
      freeSquaresRemaining: freeRemaining,
      billableTiles: billable,
      paidSubscriptionSquares: billable,
      monthlySubscriptionCost: monthlyCost,
      monthlySubscriptionUsd: monthlyCost,
      estimatedWorth,
      worthUsd: estimatedWorth,
      totalBoughtUsd: this.ledger.totalBoughtUsd,
      boughtTotalUsd: this.ledger.totalBoughtUsd,
      totalSoldUsd: this.ledger.totalSoldUsd,
      soldTotalUsd: this.ledger.totalSoldUsd,
      unsavedGuestChanges: this.isGuest() ? this.guestProfile?.unsavedChanges || 0 : 0,
    });
  }

  private loadLedger() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.LEDGER);
      if (raw) {
        this.ledger = JSON.parse(raw);
      }
    } catch (e) {}
  }

  private saveLedger() {
    try {
      localStorage.setItem(STORAGE_KEYS.LEDGER, JSON.stringify(this.ledger));
    } catch (e) {}
  }

  // ============================================================================
  // 5. SAVED PINS & SHARING (Brief 06/01/23 lines 105-106)
  // ============================================================================

  private loadPins() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PINS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.pins$.next(parsed);
          return;
        }
      }
    } catch (e) {}

    // Default starter pins so user immediately sees how pins work
    const starterPins: SavedPin[] = [
      {
        id: 'pin_flatmeta_home',
        name: 'FlatMeta Home HQ',
        lat: MetaverseService.FLATMETA_HOME_COORDS[0],
        lng: MetaverseService.FLATMETA_HOME_COORDS[1],
        zoom: 15,
        three_words: 'flatmeta.welcome.home',
        created_at: '2026-10-01T10:00:00.000Z',
      },
      {
        id: 'pin_pepsi_land',
        name: 'Pepsi Refresh Zone',
        lat: 51.5098,
        lng: -0.1032,
        zoom: 15,
        three_words: 'pepsi.refresh.zone',
        created_at: '2026-10-10T12:00:00.000Z',
      },
    ];
    this.savePins(starterPins);
  }

  private savePins(pins: SavedPin[]) {
    this.pins$.next(pins);
    try {
      localStorage.setItem(STORAGE_KEYS.PINS, JSON.stringify(pins));
    } catch (e) {}
  }

  public addPin(name: string, lat: number, lng: number, zoom: number = 15): SavedPin {
    const { gx, gy } = this.latLngToGrid(lat, lng);
    const pin: SavedPin = {
      id: 'pin_' + Date.now(),
      name: name.trim() || 'Saved Pin',
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      zoom,
      three_words: this.gridToThreeWords(gx, gy),
      created_at: new Date().toISOString(),
    };
    const updated = [pin, ...this.pins$.value];
    this.savePins(updated);
    if (this.isGuest()) {
      this.guestProfile.unsavedChanges++;
      this.saveGuestProfile();
      this.recalculateStats();
    }
    return pin;
  }

  public deletePin(id: string) {
    const updated = this.pins$.value.filter((p) => p.id !== id);
    this.savePins(updated);
  }

  public findPinById(id: string): SavedPin | undefined {
    return this.pins$.value.find((p) => p.id === id);
  }

  // ============================================================================
  // 6. SETTINGS & FRIENDS / CONNECTIONS
  // ============================================================================

  private loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) {
        this.settings$.next({ ...this.settings$.value, ...JSON.parse(raw) });
      }
    } catch (e) {}
  }

  public updateSettings(partial: Partial<UserSettings>) {
    const next = { ...this.settings$.value, ...partial };
    this.settings$.next(next);
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(next));
    } catch (e) {}
  }

  private loadFriends() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FRIENDS);
      if (raw) {
        const arr: string[] = JSON.parse(raw);
        this.friendIds = new Set(arr.map(String));
      }
    } catch (e) {}
  }

  public isFriend(userId: string): boolean {
    return this.friendIds.has(String(userId));
  }

  public toggleFriend(userId: string): boolean {
    const id = String(userId);
    if (this.friendIds.has(id)) {
      this.friendIds.delete(id);
    } else {
      this.friendIds.add(id);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.FRIENDS, JSON.stringify(Array.from(this.friendIds)));
    } catch (e) {}
    return this.friendIds.has(id);
  }

  // ============================================================================
  // 7. REALTIME MULTI-BROWSER BUS (WebSocket + BroadcastChannel + Storage Sync)
  // ============================================================================

  private initRealtimeBus() {
    // 1. Native Browser BroadcastChannel for instant multi-window / multi-tab presence & chat
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.broadcastChannel = new BroadcastChannel('flatmeta_metaverse_live_v1');
        this.broadcastChannel.onmessage = (ev) => {
          this.zone.run(() => {
            this.handleIncomingRealtimeEvent(ev.data);
          });
        };
      } catch (e) {}
    }

    // 2. WebSocket events from backend server (ws://localhost:3500 or wss://api.flatmeta.io:3500)
    this.socket.fromEvent('location').subscribe((data: any) => {
      const payload = data?.data || data;
      if (payload) {
        this.remoteLocation$.next(payload);
      }
    });

    this.socket.fromEvent('typing').subscribe((data: any) => {
      const payload = data?.data || data;
      if (payload && String(payload.userId) !== String(this.getCurrentUserId())) {
        this.remoteTyping$.next(payload);
      }
    });

    this.socket.fromEvent('message').subscribe((data: any) => {
      const payload = data?.data || data;
      if (payload) {
        this.ingestIncomingChatMessage(payload);
      }
    });

    this.socket.fromEvent('user_disconnect').subscribe((data: any) => {
      const uid = data?.userId || data;
      if (uid) {
        this.remoteDisconnect$.next(String(uid));
      }
    });

    // 3. Clean up presence when tab/window closes (Brief 28/4/22: "If I create window, and close window... old one was not destroyed")
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        const uid = this.getCurrentUserId();
        this.broadcastEvent('user_disconnect', { userId: uid });
        this.socket.emit('user_disconnect', { userId: uid });
      });
    }
  }

  private handleIncomingRealtimeEvent(packet: { event: string; data: any }) {
    if (!packet || !packet.event) return;
    const { event, data } = packet;
    if (event === 'location' && data) {
      this.remoteLocation$.next(data);
    } else if (event === 'typing' && data) {
      if (String(data.userId) !== String(this.getCurrentUserId())) {
        this.remoteTyping$.next(data);
      }
    } else if (event === 'message' && data) {
      this.ingestIncomingChatMessage(data);
    } else if (event === 'user_disconnect' && data?.userId) {
      this.remoteDisconnect$.next(String(data.userId));
    } else if (event === 'tiles_updated') {
      this.loadTiles();
      this.recalculateStats();
    }
  }

  public broadcastEvent(event: string, data: any) {
    if (this.broadcastChannel) {
      try {
        this.broadcastChannel.postMessage({ event, data });
      } catch (e) {}
    }
  }

  public emitMyLocation(lat: number, lng: number, expression?: string) {
    const payload = {
      userId: this.getCurrentUserId(),
      username: this.getCurrentUsername(),
      fullname: this.getCurrentFullname(),
      image: this.getCurrentAvatar(),
      expression,
      location: { lat, lng },
    };
    this.socket.emit('location', payload);
    this.broadcastEvent('location', payload);
  }

  public emitTyping(text: string) {
    const payload = {
      userId: this.getCurrentUserId(),
      username: this.getCurrentUsername(),
      text,
    };
    this.socket.emit('typing', payload);
    this.broadcastEvent('typing', payload);
  }

  // ============================================================================
  // 8. HANGOUTS-STYLE CHAT (Nearby + Direct + Smiley Expressions)
  // ============================================================================

  private loadChatHistory() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.CHAT_HISTORY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.chatMessages$.next(parsed);
          return;
        }
      }
    } catch (e) {}

    // Seed initial welcome messages in the Nearby Chat
    const starter: LiveChatMessage[] = [
      {
        id: 'msg_welcome_1',
        roomId: 'global_nearby',
        scope: 'nearby',
        senderId: 'flatmeta_official',
        senderName: 'FlatMeta Guide',
        senderUsername: 'flatmeta_guide',
        senderAvatar: this.generateAvatarDataUrl({
          ...this.createRandomAvatarConfig(),
          circleBg: '#0284c7',
          mouthType: 'Smile',
        }),
        message: 'Welcome to FlatMeta! You can chat with anyone nearby right here, or type a smiley like :) or :D to change your avatar expression!',
        expression: 'Smile',
        lat: MetaverseService.FLATMETA_HOME_COORDS[0],
        lng: MetaverseService.FLATMETA_HOME_COORDS[1],
        created_at: new Date(Date.now() - 120000).toISOString(),
      },
    ];
    this.saveChatHistory(starter);
  }

  private saveChatHistory(msgs: LiveChatMessage[]) {
    const trimmed = msgs.slice(-150);
    this.chatMessages$.next(trimmed);
    try {
      localStorage.setItem(STORAGE_KEYS.CHAT_HISTORY, JSON.stringify(trimmed));
    } catch (e) {}
  }

  public sendChatMessage(
    text: string,
    options?: { scope?: 'nearby' | 'direct'; roomId?: string; recipientId?: string; lat?: number; lng?: number }
  ): LiveChatMessage | null {
    const clean = (text || '').trim();
    if (!clean) return null;

    const expression = this.detectSmileyExpression(clean);
    const msg: LiveChatMessage = {
      id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      roomId: options?.roomId || 'global_nearby',
      scope: options?.scope || 'nearby',
      senderId: this.getCurrentUserId(),
      senderName: this.getCurrentFullname(),
      senderUsername: this.getCurrentUsername(),
      senderAvatar: this.getCurrentAvatar(),
      recipientId: options?.recipientId,
      message: clean,
      expression,
      lat: options?.lat,
      lng: options?.lng,
      created_at: new Date().toISOString(),
    };

    const current = [...this.chatMessages$.value, msg];
    this.saveChatHistory(current);

    // Emit to WebSocket & BroadcastChannel
    this.socket.emit('message', msg);
    this.broadcastEvent('message', msg);

    // Trigger speech bubble on map
    this.speechBubble$.next({
      senderId: msg.senderId,
      text: msg.message,
      expression: msg.expression,
    });

    return msg;
  }

  private ingestIncomingChatMessage(raw: any) {
    if (!raw || !raw.message) return;
    const senderId = String(raw.senderId || raw.sender_id || 'citizen');
    if (senderId === String(this.getCurrentUserId())) return;

    // Respect Friends-Only chat filter if enabled
    const settings = this.settings$.value;
    if (settings.chatScope === 'friends' && !this.isFriend(senderId)) {
      return;
    }

    const msgId = raw.id || `msg_${senderId}_${raw.created_at || Date.now()}`;
    if (this.chatMessages$.value.some((m) => m.id === msgId)) return;

    const expression = raw.expression || this.detectSmileyExpression(raw.message);
    const incoming: LiveChatMessage = {
      id: msgId,
      roomId: raw.roomId || raw.room_id || 'global_nearby',
      scope: raw.scope || 'nearby',
      senderId,
      senderName: raw.senderName || raw.fullname || `Citizen #${senderId}`,
      senderUsername: raw.senderUsername || raw.username || `citizen_${senderId}`,
      senderAvatar: raw.senderAvatar || 'assets/icon/avatar-default.svg',
      recipientId: raw.recipientId,
      message: raw.message,
      expression,
      lat: raw.lat,
      lng: raw.lng,
      created_at: raw.created_at || raw.createdAt || new Date().toISOString(),
    };

    const next = [...this.chatMessages$.value, incoming];
    this.saveChatHistory(next);

    this.speechBubble$.next({
      senderId: incoming.senderId,
      text: incoming.message,
      expression: incoming.expression,
    });
  }
}

import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject, Subject } from 'rxjs';
import { AvatarConfig, avatarDataUrl, detectSmileyExpression, sanitizeAvatarConfig } from '../core/avatar';
import { LatLngBox, isLatLngBox } from '../core/grid';
import { FriendsService } from './friends.service';
import { HttpService } from './http.service';
import { SessionService } from './session.service';
import { SettingsService } from './settings.service';
import { WebSocketService } from './websocket.service';

/** Another person currently on the map. */
export interface Citizen {
  id: string;
  isGuest: boolean;
  username: string;
  fullname: string;
  avatarConfig: AvatarConfig | null;
  avatarUrl: string;
  lat: number;
  lng: number;
  expression?: string;
  lastSeen: number;
}

export interface ChatMessage {
  id: string;
  /** 'nearby' for the public room, otherwise the other person's id for a direct chat. */
  conversation: string;
  senderId: string;
  senderName: string;
  senderUsername: string;
  senderAvatar: string;
  recipientId?: string;
  message: string;
  expression?: string;
  created_at: string;
  mine: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  avatar: string;
  unread: number;
}

/** People within this distance of my avatar can see my nearby chat. */
export const NEARBY_KM = 5;
const HEARTBEAT_MS = 15000;
const STALE_MS = 45000;
const HISTORY_KEY = 'flatmeta_nearby_chat_v3';
const MAX_HISTORY = 200;

function distanceKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Live multi-user layer over the WebSocket: avatars moving, typing callouts,
 * nearby chat and direct messages. Nothing here is simulated: if you are alone
 * on the map you see no one, and opening the site in a second browser shows two
 * avatars that can talk.
 */
@Injectable({ providedIn: 'root' })
export class PresenceService {
  readonly citizens$ = new BehaviorSubject<Citizen[]>([]);
  readonly messages$ = new BehaviorSubject<ChatMessage[]>([]);
  readonly conversations$ = new BehaviorSubject<Conversation[]>([{ id: 'nearby', title: 'Nearby', avatar: '', unread: 0 }]);
  readonly typing$ = new Subject<{ userId: string; text: string }>();
  readonly bubble$ = new Subject<{ userId: string; text: string; expression?: string }>();
  /** Someone's land changed. `bounds` is the changed area; null means "could be anywhere". */
  readonly tilesChanged$ = new Subject<{ by: string; bounds: LatLngBox | null }>();
  readonly connected$;

  private citizens = new Map<string, Citizen>();
  private myPos: { lat: number; lng: number } | null = null;
  private myExpression?: string;
  private heartbeat: any;
  private activeConversation = 'nearby';
  private dmRooms = new Map<string, number>();
  private lastBeat = 0;

  constructor(
    private socket: WebSocketService,
    private session: SessionService,
    private settings: SettingsService,
    private friends: FriendsService,
    private http: HttpService,
    private zone: NgZone
  ) {
    this.connected$ = this.socket.isConnected$;
    this.messages$.next(this.loadHistory());

    this.socket.isConnected$.subscribe((up) => up && this.sayHello());
    this.session.identity$.subscribe(() => this.socket.connected && this.sayHello());

    this.socket.fromEvent('location').subscribe((d) => this.onLocation(d));
    this.socket.fromEvent('typing').subscribe((d) => this.onTyping(d));
    this.socket.fromEvent('message').subscribe((d) => this.onMessage(d));
    this.socket.fromEvent('user_disconnect').subscribe((d) => this.removeCitizen(String(d?.userId ?? d)));
    this.socket
      .fromEvent('tiles_updated')
      .subscribe((d) => this.tilesChanged$.next({ by: String(d?.by ?? ''), bounds: isLatLngBox(d?.bounds) ? d.bounds : null }));

    this.zone.runOutsideAngular(() => {
      this.heartbeat = setInterval(() => this.zone.run(() => this.tick()), HEARTBEAT_MS / 3);
    });

    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', () => this.socket.emit('user_disconnect', { userId: this.session.identity.id }));
    }
  }

  // ---------------------------------------------------------------------------
  // My avatar
  // ---------------------------------------------------------------------------

  get position() {
    return this.myPos;
  }

  moveTo(lat: number, lng: number) {
    this.myPos = { lat, lng };
    this.sendLocation();
  }

  setExpression(expression?: string) {
    if (expression === this.myExpression) return;
    this.myExpression = expression;
    this.sendLocation();
  }

  get expression() {
    return this.myExpression;
  }

  /** Let others know my land changed; they reload it if `bounds` overlaps what they are looking at. */
  announceTilesChanged(bounds?: LatLngBox | null) {
    this.socket.emit('tiles_updated', bounds ? { by: this.session.identity.id, bounds } : { by: this.session.identity.id });
  }

  // ---------------------------------------------------------------------------
  // Chat
  // ---------------------------------------------------------------------------

  setActiveConversation(id: string) {
    this.activeConversation = id;
    this.conversations$.next(this.conversations$.value.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
    if (id !== 'nearby') this.loadDirectHistory(id);
  }

  openDirect(citizen: Pick<Citizen, 'id' | 'fullname' | 'username' | 'avatarUrl'>) {
    this.ensureConversation(citizen.id, citizen.fullname || citizen.username, citizen.avatarUrl);
    this.setActiveConversation(citizen.id);
  }

  closeConversation(id: string) {
    if (id === 'nearby') return;
    this.conversations$.next(this.conversations$.value.filter((c) => c.id !== id));
    if (this.activeConversation === id) this.activeConversation = 'nearby';
  }

  messagesFor(conversation: string): ChatMessage[] {
    return this.messages$.value.filter((m) => m.conversation === conversation);
  }

  typing(text: string) {
    this.socket.emit('typing', { ...this.wireIdentity(), text: text.slice(0, 140) });
    this.setExpression(detectSmileyExpression(text) || this.myExpression);
  }

  send(text: string, conversation: string = this.activeConversation): ChatMessage | null {
    const clean = (text || '').trim().slice(0, 1000);
    if (!clean) return null;
    const me = this.session.identity;
    const expression = detectSmileyExpression(clean);
    const msg: ChatMessage = {
      id: `msg_${me.id}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
      conversation,
      senderId: me.id,
      senderName: me.fullname,
      senderUsername: me.username,
      senderAvatar: me.avatarUrl,
      recipientId: conversation === 'nearby' ? undefined : conversation,
      message: clean,
      expression,
      created_at: new Date().toISOString(),
      mine: true,
    };
    this.pushMessage(msg);
    if (expression) this.setExpression(expression);
    this.bubble$.next({ userId: me.id, text: clean, expression });

    this.socket.emit('message', {
      ...this.wireIdentity(),
      id: msg.id,
      scope: conversation === 'nearby' ? 'nearby' : 'direct',
      roomId: conversation === 'nearby' ? 'global_nearby' : `room_${conversation}`,
      recipientId: msg.recipientId,
      senderId: me.id,
      senderName: me.fullname,
      senderUsername: me.username,
      message: clean,
      expression,
      lat: this.myPos?.lat,
      lng: this.myPos?.lng,
      created_at: msg.created_at,
    });

    // Direct messages between verified users are saved so either side can scroll back later.
    if (conversation !== 'nearby' && !me.isGuest && /^\d+$/.test(conversation)) {
      this.http.postAsync('AddNewMessaage', { room_id: this.dmRooms.get(conversation) || `room_${conversation}`, message: clean })
        .then((res) => {
          if (res?.status === true && res.data?.room_id) this.dmRooms.set(conversation, Number(res.data.room_id));
        });
    }
    return msg;
  }

  // ---------------------------------------------------------------------------
  // Incoming
  // ---------------------------------------------------------------------------

  private onLocation(raw: any) {
    const d = raw?.data && raw?.data.userId ? raw.data : raw;
    const id = String(d?.userId ?? '');
    if (!id || id === this.session.identity.id) return;
    const loc = d.location || d;
    const lat = Number(loc.lat ?? loc[0]);
    const lng = Number(loc.lng ?? loc[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;

    const config = sanitizeAvatarConfig(d.avatar || d.avatarConfig);
    const photo = typeof d.image === 'string' && /^https?:\/\//i.test(d.image) ? d.image : '';
    const expression = typeof d.expression === 'string' ? d.expression.slice(0, 20) : undefined;
    const prev = this.citizens.get(id);
    const citizen: Citizen = {
      id,
      isGuest: !/^\d+$/.test(id),
      username: String(d.username || prev?.username || 'citizen').slice(0, 40),
      fullname: String(d.fullname || prev?.fullname || d.username || 'Citizen').slice(0, 60),
      avatarConfig: config || prev?.avatarConfig || null,
      avatarUrl: photo || (config ? avatarDataUrl(config, expression) : prev?.avatarUrl || 'assets/icon/avatar-default.svg'),
      lat,
      lng,
      expression,
      lastSeen: Date.now(),
    };
    this.citizens.set(id, citizen);
    this.publishCitizens();

    // A newcomer: tell them where I am straight away instead of waiting for my next heartbeat.
    if (!prev) this.sendLocation();
  }

  private onTyping(raw: any) {
    const id = String(raw?.userId ?? '');
    if (!id || id === this.session.identity.id || !this.citizens.has(id)) return;
    if (!this.canHear(id)) return;
    this.typing$.next({ userId: id, text: String(raw.text || '').slice(0, 140) });
  }

  private onMessage(raw: any) {
    const senderId = String(raw?.senderId ?? raw?.sender_id ?? '');
    const me = this.session.identity;
    const text = String(raw?.message ?? '').trim().slice(0, 1000);
    if (!senderId || senderId === me.id || !text) return;

    const isDirect = raw.scope === 'direct' || (raw.recipientId !== undefined && raw.recipientId !== null);
    if (isDirect && String(raw.recipientId) !== me.id) return; // not for me
    if (!isDirect) {
      if (!this.canHear(senderId)) return;
      const lat = Number(raw.lat);
      const lng = Number(raw.lng);
      if (this.myPos && Number.isFinite(lat) && Number.isFinite(lng) && distanceKm(this.myPos.lat, this.myPos.lng, lat, lng) > NEARBY_KM) {
        return; // too far away
      }
    }

    const sender = this.citizens.get(senderId);
    const conversation = isDirect ? senderId : 'nearby';
    const msg: ChatMessage = {
      id: String(raw.id || `msg_${senderId}_${Date.now()}`).slice(0, 80),
      conversation,
      senderId,
      senderName: String(raw.senderName || sender?.fullname || 'Citizen').slice(0, 60),
      senderUsername: String(raw.senderUsername || sender?.username || 'citizen').slice(0, 40),
      senderAvatar: sender?.avatarUrl || 'assets/icon/avatar-default.svg',
      recipientId: isDirect ? me.id : undefined,
      message: text,
      expression: detectSmileyExpression(text),
      created_at: new Date().toISOString(),
      mine: false,
    };
    if (this.messages$.value.some((m) => m.id === msg.id)) return;
    if (isDirect) this.ensureConversation(senderId, msg.senderName, msg.senderAvatar);
    this.pushMessage(msg);
    if (conversation !== this.activeConversation) {
      this.conversations$.next(
        this.conversations$.value.map((c) => (c.id === conversation ? { ...c, unread: c.unread + 1 } : c))
      );
    }
    this.bubble$.next({ userId: senderId, text, expression: msg.expression });
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private canHear(userId: string): boolean {
    return this.settings.value.chatScope === 'everyone' || this.friends.isFriend(userId);
  }

  private wireIdentity() {
    const me = this.session.identity;
    return {
      userId: me.id,
      username: me.username,
      fullname: me.fullname,
      avatar: me.avatarConfig.customImage ? { ...me.avatarConfig, customImage: undefined } : me.avatarConfig,
      image: me.avatarConfig.customImage || '',
    };
  }

  private sayHello() {
    // The server checks the token to confirm a signed-in user's identity; guests send none.
    this.socket.emit('hello', { ...this.wireIdentity(), token: this.session.accessToken || undefined });
    this.sendLocation();
  }

  private sendLocation() {
    if (!this.myPos) return;
    this.socket.emit('location', {
      ...this.wireIdentity(),
      expression: this.myExpression,
      location: { lat: Number(this.myPos.lat.toFixed(6)), lng: Number(this.myPos.lng.toFixed(6)) },
    });
  }

  private tick() {
    const now = Date.now();
    let changed = false;
    this.citizens.forEach((c, id) => {
      if (now - c.lastSeen > STALE_MS) {
        this.citizens.delete(id);
        changed = true;
      }
    });
    if (changed) this.publishCitizens();
    if (now - this.lastBeat >= HEARTBEAT_MS) {
      this.lastBeat = now;
      this.sendLocation();
    }
  }

  private removeCitizen(id: string) {
    if (this.citizens.delete(id)) this.publishCitizens();
  }

  private publishCitizens() {
    this.citizens$.next(Array.from(this.citizens.values()));
  }

  private ensureConversation(id: string, title: string, avatar: string) {
    if (this.conversations$.value.some((c) => c.id === id)) return;
    this.conversations$.next([...this.conversations$.value, { id, title, avatar, unread: 0 }]);
  }

  private async loadDirectHistory(otherId: string) {
    if (this.session.isGuest || !/^\d+$/.test(otherId)) return;
    const res = await this.http.postAsync('GetRoomId', { follower_user_id: Number(otherId) });
    if (res?.status !== true) return;
    if (res.data?.room_id) this.dmRooms.set(otherId, Number(res.data.room_id));
    const me = this.session.identity;
    const other = this.conversations$.value.find((c) => c.id === otherId);
    const history: ChatMessage[] = (res.data?.messages || []).map((m: any) => {
      const mine = String(m.sender_id ?? m.senderId) === me.id;
      return {
        id: `db_${m.id}`,
        conversation: otherId,
        senderId: String(m.sender_id ?? m.senderId),
        senderName: mine ? me.fullname : other?.title || 'Citizen',
        senderUsername: mine ? me.username : '',
        senderAvatar: mine ? me.avatarUrl : other?.avatar || 'assets/icon/avatar-default.svg',
        message: String(m.message || ''),
        created_at: m.created_at || m.createdAt || '',
        mine,
      };
    });
    const others = this.messages$.value.filter((m) => m.conversation !== otherId || !m.id.startsWith('db_'));
    const live = others.filter((m) => m.conversation === otherId);
    const rest = others.filter((m) => m.conversation !== otherId);
    // Drop live copies of messages that are now in the saved history.
    const dedupedLive = live.filter((l) => !history.some((h) => h.message === l.message && h.senderId === l.senderId));
    this.messages$.next([...rest, ...history, ...dedupedLive]);
  }

  private pushMessage(msg: ChatMessage) {
    const next = [...this.messages$.value, msg].slice(-MAX_HISTORY);
    this.messages$.next(next);
    this.saveHistory(next);
  }

  private loadHistory(): ChatMessage[] {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list.filter((m: any) => m?.conversation === 'nearby') : [];
    } catch {
      return [];
    }
  }

  private saveHistory(list: ChatMessage[]) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(list.filter((m) => m.conversation === 'nearby').slice(-MAX_HISTORY)));
    } catch {}
  }
}

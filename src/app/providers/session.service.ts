import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AvatarConfig, avatarDataUrl, createRandomAvatarConfig, sanitizeAvatarConfig } from '../core/avatar';

/** User record as returned by the API (`login`, `VerifyEmail`, `getuserbytoken`, `UpdateUser`). */
export interface ApiUser {
  user_id: number;
  fullname: string;
  username: string;
  email: string;
  user_image?: string;
  status?: string;
  phone?: string;
  clan?: string;
  paypal_email?: string;
  avatar_config?: AvatarConfig | string | null;
}

/**
 * Who is using the app right now. Guests get a stable local id so they can roam,
 * chat and draft land without signing in; verifying an email turns them into a
 * real account and their drafts are saved to the server.
 */
export interface Identity {
  id: string;
  isGuest: boolean;
  userId: number | null;
  username: string;
  fullname: string;
  email: string;
  clan: string;
  phone: string;
  /** Where marketplace sale money is paid (PayPal account email). */
  paypalEmail: string;
  avatarConfig: AvatarConfig;
  /** Rendered avatar (SVG data URI or uploaded photo URL). */
  avatarUrl: string;
}

interface GuestProfile {
  id: string;
  username: string;
  fullname: string;
  avatarConfig: AvatarConfig;
}

const KEYS = {
  TOKEN: 'flatmeta_token',
  USER: 'flatmeta_user',
  GUEST: 'flatmeta_guest_v3',
  AVATARS: 'flatmeta_avatar_configs',
};

export const DEFAULT_CLAN = 'Cyber Architects';

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    if (value === null || value === undefined) {
      localStorage.removeItem(key);
    } else {
      localStorage.setItem(key, JSON.stringify(value));
    }
  } catch {}
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly apiUrl = environment.apiUrl;
  private token: string | null = null;
  private user: ApiUser | null = null;
  private guest: GuestProfile;

  readonly identity$: BehaviorSubject<Identity>;
  /** Fires after a guest becomes a signed-in user (used to save guest drafts). */
  readonly signedIn$ = new Subject<Identity>();
  readonly signedOut$ = new Subject<void>();
  /** Ask the app shell to show the sign-in popup. */
  readonly authRequested$ = new Subject<{ reason?: string; mode?: 'email' | 'password' }>();

  constructor(private http: HttpClient) {
    this.guest = this.loadGuest();
    this.migrateLegacyStorage();
    this.token = readJson<string>(KEYS.TOKEN);
    this.user = this.token ? readJson<ApiUser>(KEYS.USER) : null;
    this.identity$ = new BehaviorSubject<Identity>(this.buildIdentity());
    if (this.token) {
      this.refreshMe();
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  get identity(): Identity {
    return this.identity$.value;
  }

  get isGuest(): boolean {
    return !this.user || !this.token;
  }

  get accessToken(): string | null {
    return this.token;
  }

  requestAuth(reason = '', mode: 'email' | 'password' = 'email') {
    this.authRequested$.next({ reason, mode });
  }

  // ---------------------------------------------------------------------------
  // Email-code sign in (the brief: "it just needs email ... validate their email")
  // ---------------------------------------------------------------------------

  async requestEmailCode(email: string): Promise<{ ok: boolean; message: string }> {
    const res: any = await this.post('VerifyEmail', { email: email.trim().toLowerCase() });
    return {
      ok: res?.status === true,
      message: res?.message || res?.data?.message || (res?.status ? 'Code sent.' : 'Could not send code.'),
    };
  }

  async verifyEmailCode(email: string, code: string, username?: string): Promise<{ ok: boolean; message: string }> {
    const handle = this.cleanHandle(username || '');
    const res: any = await this.post('VerifyEmail', {
      email: email.trim().toLowerCase(),
      code: code.trim(),
      // New accounts take the chosen handle; guest_xxx handles fall back to the email name server-side.
      username: handle && !handle.startsWith('guest_') ? handle : undefined,
      fullname: this.guest.fullname.startsWith('Guest ') ? undefined : this.guest.fullname,
    });
    if (res?.status === true && res.access_token && res.data) {
      await this.completeSignIn(res.access_token, res.data);
      return { ok: true, message: res.message || 'Email verified.' };
    }
    return { ok: false, message: res?.message || res?.data?.message || 'Invalid or expired code.' };
  }

  async loginWithPassword(login: string, password: string): Promise<{ ok: boolean; message: string }> {
    const res: any = await this.post('login', { email: login.trim(), password });
    if (res?.status === true && res.access_token && res.data) {
      await this.completeSignIn(res.access_token, res.data);
      return { ok: true, message: 'Signed in.' };
    }
    return { ok: false, message: res?.message || res?.data?.message || 'Wrong email or password.' };
  }

  signOut() {
    this.token = null;
    this.user = null;
    writeJson(KEYS.TOKEN, null);
    writeJson(KEYS.USER, null);
    this.emit();
    this.signedOut$.next();
  }

  /** Called by HttpService when the API rejects our token. */
  handleUnauthorized() {
    if (this.token) {
      this.signOut();
    }
  }

  async refreshMe(): Promise<void> {
    const res: any = await this.get('getuserbytoken');
    if (res?.status === true && res.data) {
      this.setUser(res.data);
    } else if (res?.__unauthorized) {
      this.signOut();
    }
  }

  // ---------------------------------------------------------------------------
  // Profile & avatar
  // ---------------------------------------------------------------------------

  async updateProfile(changes: { fullname?: string; username?: string; email?: string; phone?: string; clan?: string; paypal_email?: string }) {
    const clean = {
      ...changes,
      username: changes.username !== undefined ? this.cleanHandle(changes.username) : undefined,
    };
    if (this.isGuest) {
      if (clean.fullname) this.guest.fullname = clean.fullname.trim().slice(0, 50);
      if (clean.username) this.guest.username = clean.username;
      this.saveGuest();
      this.emit();
      return { ok: true, message: 'Saved on this device. Verify your email to keep it.' };
    }
    const res: any = await this.post('UpdateUser', clean, true);
    if (res?.status === true && res.data) {
      this.setUser(res.data);
      return { ok: true, message: 'Profile saved.' };
    }
    return { ok: false, message: res?.message || 'Could not save profile.' };
  }

  async setAvatarConfig(config: AvatarConfig): Promise<void> {
    const clean = sanitizeAvatarConfig(config) || createRandomAvatarConfig();
    if (this.isGuest) {
      this.guest.avatarConfig = clean;
      this.saveGuest();
      this.emit();
      return;
    }
    this.rememberUserAvatar(this.user!.user_id, clean);
    this.emit();
    const res: any = await this.post('UpdateUser', { avatar_config: JSON.stringify(clean) }, true);
    if (res?.status === true && res.data) {
      this.setUser({ ...res.data, avatar_config: res.data.avatar_config || clean });
    }
  }

  /** Uploads a photo to use as the avatar (signed-in users only). */
  async uploadAvatarPhoto(file: File): Promise<{ ok: boolean; message: string }> {
    if (this.isGuest) {
      return { ok: false, message: 'Verify your email to upload a photo avatar.' };
    }
    const form = new FormData();
    form.append('images', file);
    const res: any = await this.request('POST', 'UploadUserImage', form, true);
    if (res?.status === true && res.data?.user_image) {
      await this.setAvatarConfig({ ...this.identity.avatarConfig, customImage: res.data.user_image });
      return { ok: true, message: 'Photo avatar saved.' };
    }
    return { ok: false, message: res?.message || res?.data?.message || 'Upload failed.' };
  }

  async clearAvatarPhoto() {
    const { customImage, ...rest } = this.identity.avatarConfig;
    await this.setAvatarConfig(rest as AvatarConfig);
  }

  // ---------------------------------------------------------------------------
  // Internals
  // ---------------------------------------------------------------------------

  private async completeSignIn(token: string, user: ApiUser) {
    const guestAvatar = this.guest.avatarConfig;
    this.token = token;
    writeJson(KEYS.TOKEN, token);
    // Carry the guest's avatar over if the account doesn't have one yet.
    if (!this.parseAvatar(user.avatar_config) && !readJson<any>(KEYS.AVATARS)?.[user.user_id]) {
      this.rememberUserAvatar(user.user_id, guestAvatar);
      this.post('UpdateUser', { avatar_config: JSON.stringify(guestAvatar) }, true);
    }
    this.setUser(user);
    this.signedIn$.next(this.identity);
  }

  private setUser(user: ApiUser) {
    const parsed = this.parseAvatar(user.avatar_config);
    if (parsed) this.rememberUserAvatar(user.user_id, parsed);
    this.user = { ...user, user_id: Number(user.user_id) };
    writeJson(KEYS.USER, this.user);
    this.emit();
  }

  private emit() {
    this.identity$.next(this.buildIdentity());
  }

  private buildIdentity(): Identity {
    if (this.user && this.token) {
      const cfg =
        this.parseAvatar(this.user.avatar_config) ||
        readJson<Record<string, AvatarConfig>>(KEYS.AVATARS)?.[this.user.user_id] ||
        this.guest.avatarConfig;
      const avatarConfig = sanitizeAvatarConfig(cfg) || this.guest.avatarConfig;
      return {
        id: String(this.user.user_id),
        isGuest: false,
        userId: this.user.user_id,
        username: this.user.username || 'citizen',
        fullname: this.user.fullname || this.user.username || 'Citizen',
        email: this.user.email || '',
        clan: this.user.clan || DEFAULT_CLAN,
        phone: this.user.phone || '',
        paypalEmail: this.user.paypal_email || this.user.email || '',
        avatarConfig,
        avatarUrl: avatarDataUrl(avatarConfig),
      };
    }
    return {
      id: this.guest.id,
      isGuest: true,
      userId: null,
      username: this.guest.username,
      fullname: this.guest.fullname,
      email: '',
      clan: DEFAULT_CLAN,
      phone: '',
      paypalEmail: '',
      avatarConfig: this.guest.avatarConfig,
      avatarUrl: avatarDataUrl(this.guest.avatarConfig),
    };
  }

  private parseAvatar(raw: any): AvatarConfig | null {
    if (!raw) return null;
    try {
      return sanitizeAvatarConfig(typeof raw === 'string' ? JSON.parse(raw) : raw);
    } catch {
      return null;
    }
  }

  private rememberUserAvatar(userId: number, config: AvatarConfig) {
    const map = readJson<Record<string, AvatarConfig>>(KEYS.AVATARS) || {};
    map[userId] = config;
    writeJson(KEYS.AVATARS, map);
  }

  private loadGuest(): GuestProfile {
    const saved = readJson<GuestProfile>(KEYS.GUEST);
    if (saved?.id && saved.username) {
      return { ...saved, avatarConfig: sanitizeAvatarConfig(saved.avatarConfig) || createRandomAvatarConfig() };
    }
    const suffix = Math.random().toString(36).slice(2, 7);
    const guest: GuestProfile = {
      id: `guest_${suffix}${Date.now().toString(36).slice(-3)}`,
      username: `guest_${suffix}`,
      fullname: `Guest ${suffix.toUpperCase()}`,
      avatarConfig: createRandomAvatarConfig(),
    };
    writeJson(KEYS.GUEST, guest);
    return guest;
  }

  private saveGuest() {
    writeJson(KEYS.GUEST, this.guest);
  }

  /** Drops the old fake "flatmeta_verified_" sessions and other legacy keys. */
  private migrateLegacyStorage() {
    try {
      ['flatmeta_guest_profile_v2', 'flatmeta_land_tiles_v2', 'flatmeta_ledger_stats_v2', 'flatmeta_connections_v2',
        'flatmeta_chat_history_v2', 'CapacitorStorage.userObject', 'CapacitorStorage.login_token'].forEach((k) =>
        localStorage.removeItem(k)
      );
    } catch {}
  }

  private cleanHandle(value: string): string {
    return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 30);
  }

  private get(path: string) {
    return this.request('GET', path, undefined, true);
  }

  private post(path: string, body: any, auth = false) {
    return this.request('POST', path, body, auth);
  }

  private async request(method: 'GET' | 'POST', path: string, body?: any, auth = false): Promise<any> {
    let headers = new HttpHeaders({ Accept: 'application/json' });
    if (auth && this.token) headers = headers.set('Authorization', `Bearer ${this.token}`);
    try {
      const req$: Observable<any> =
        method === 'GET' ? this.http.get(this.apiUrl + path, { headers }) : this.http.post(this.apiUrl + path, body ?? {}, { headers });
      return await req$.pipe(take(1)).toPromise();
    } catch (err: any) {
      if (err?.status === 401) return { status: false, __unauthorized: true, message: 'Please sign in again.' };
      return { status: false, message: err?.error?.message || 'Network error. Please try again.' };
    }
  }
}

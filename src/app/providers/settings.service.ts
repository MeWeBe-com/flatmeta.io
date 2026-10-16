import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface UserSettings {
  /** Who can reach me in nearby chat. */
  chatScope: 'everyone' | 'friends';
  /** Which other avatars to draw on my map. */
  avatarVisibility: 'all' | 'friends' | 'none';
  /** Show the squares' outlines even where owners have added artwork. */
  showGridOnImages: boolean;
  darkMode: boolean | null;
  welcomeDismissed: boolean;
}

const KEY = 'flatmeta_settings_v3';

const DEFAULTS: UserSettings = {
  chatScope: 'everyone',
  avatarVisibility: 'all',
  showGridOnImages: false,
  darkMode: null,
  welcomeDismissed: false,
};

@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly settings$ = new BehaviorSubject<UserSettings>(this.load());

  get value(): UserSettings {
    return this.settings$.value;
  }

  update(partial: Partial<UserSettings>) {
    const next = { ...this.value, ...partial };
    this.settings$.next(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  }

  private load(): UserSettings {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }
}

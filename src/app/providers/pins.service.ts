import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { gridToThreeWords, latLngToGrid } from '../core/grid';

export interface SavedPin {
  id: string;
  name: string;
  lat: number;
  lng: number;
  zoom: number;
  three_words: string;
  created_at: string;
}

const KEY = 'flatmeta_pins_v3';

/**
 * Named bookmarks on the map ("add and save pins with a name, so they can go
 * back to them"). Pins are shared as links that carry the position, so anyone
 * can open them without an account.
 */
@Injectable({ providedIn: 'root' })
export class PinsService {
  readonly pins$ = new BehaviorSubject<SavedPin[]>(this.load());

  add(name: string, lat: number, lng: number, zoom: number): SavedPin {
    const { gx, gy } = latLngToGrid(lat, lng);
    const pin: SavedPin = {
      id: 'pin_' + Date.now().toString(36),
      name: name.trim().slice(0, 60) || 'Saved place',
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      zoom,
      three_words: gridToThreeWords(gx, gy),
      created_at: new Date().toISOString(),
    };
    this.save([pin, ...this.pins$.value]);
    return pin;
  }

  remove(id: string) {
    this.save(this.pins$.value.filter((p) => p.id !== id));
  }

  rename(id: string, name: string) {
    this.save(this.pins$.value.map((p) => (p.id === id ? { ...p, name: name.trim().slice(0, 60) || p.name } : p)));
  }

  find(id: string): SavedPin | undefined {
    return this.pins$.value.find((p) => p.id === id);
  }

  /** Path that opens the map at this pin, e.g. `at/51.50972,-0.10432,15?name=Office`. */
  sharePath(pin: Pick<SavedPin, 'lat' | 'lng' | 'zoom' | 'name'>): string {
    return `at/${pin.lat.toFixed(5)},${pin.lng.toFixed(5)},${pin.zoom}?name=${encodeURIComponent(pin.name)}`;
  }

  private save(pins: SavedPin[]) {
    this.pins$.next(pins);
    try {
      localStorage.setItem(KEY, JSON.stringify(pins));
    } catch {}
  }

  private load(): SavedPin[] {
    try {
      const raw = localStorage.getItem(KEY) || localStorage.getItem('flatmeta_saved_pins_v2');
      const list = raw ? JSON.parse(raw) : [];
      // Drop the old demo pins that pointed at fake land.
      return Array.isArray(list) ? list.filter((p: any) => p?.id && !/^pin_(flatmeta_home|pepsi_land)$/.test(p.id)) : [];
    } catch {
      return [];
    }
  }
}

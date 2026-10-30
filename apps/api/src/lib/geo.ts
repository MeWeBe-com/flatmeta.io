import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import countriesLib from 'i18n-iso-countries';
import type { Feature, MultiPolygon, Polygon, Position } from 'geojson';
import type { Topology } from 'topojson-specification';
import { CITIES, type City } from '../data/cities.js';

const require = createRequire(import.meta.url);

interface CountryShape {
  code: string;
  name: string;
  feature: Feature<Polygon | MultiPolygon>;
  bbox: [number, number, number, number];
  centroid: { lat: number; lng: number };
}

let shapes: CountryShape[] | null = null;

function ringArea(ring: Position[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i]!;
    const q = ring[j]!;
    a += (q[0]! + p[0]!) * (q[1]! - p[1]!);
  }
  return Math.abs(a / 2);
}

function ringCentroid(ring: Position[]): { lat: number; lng: number } {
  let x = 0;
  let y = 0;
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const p = ring[i]!;
    const q = ring[j]!;
    const f = p[0]! * q[1]! - q[0]! * p[1]!;
    x += (p[0]! + q[0]!) * f;
    y += (p[1]! + q[1]!) * f;
    a += f * 3;
  }
  if (a === 0) return { lng: ring[0]![0]!, lat: ring[0]![1]! };
  return { lng: x / a, lat: y / a };
}

function load(): CountryShape[] {
  if (shapes) return shapes;
  // Natural Earth 1:50m via world-atlas; ids are ISO 3166-1 numeric codes.
  const topo = require('world-atlas/countries-50m.json') as Topology;
  const fc = feature(topo, topo.objects.countries!) as unknown as { features: Feature<Polygon | MultiPolygon>[] };
  const out: CountryShape[] = [];
  for (const f of fc.features) {
    const numeric = String(f.id ?? '').padStart(3, '0');
    const code = countriesLib.numericToAlpha2(numeric);
    if (!code) continue;
    const polys: Position[][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    let minX = 180, minY = 90, maxX = -180, maxY = -90;
    let best: Position[] | null = null;
    let bestArea = -1;
    for (const poly of polys) {
      const outer = poly[0]!;
      const area = ringArea(outer);
      if (area > bestArea) {
        bestArea = area;
        best = outer;
      }
      for (const [x, y] of outer as [number, number][]) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
    out.push({
      code,
      name: countriesLib.getName(code, 'en', { select: 'official' }) ?? code,
      feature: f,
      bbox: [minX, minY, maxX, maxY],
      centroid: best ? ringCentroid(best) : { lat: (minY + maxY) / 2, lng: (minX + maxX) / 2 },
    });
  }
  shapes = out;
  return out;
}

export function countryAt(lat: number, lng: number): string | null {
  for (const s of load()) {
    const [w, so, e, n] = s.bbox;
    if (lng < w || lng > e || lat < so || lat > n) continue;
    if (booleanPointInPolygon([lng, lat], s.feature)) return s.code;
  }
  return null;
}

export function allCountries(): { code: string; name: string; lat: number; lng: number; bbox: [number, number, number, number] }[] {
  const seen = new Set<string>();
  const list = [];
  for (const s of load()) {
    if (seen.has(s.code)) continue;
    seen.add(s.code);
    const short = countriesLib.getName(s.code, 'en') ?? s.name;
    list.push({ code: s.code, name: short, lat: s.centroid.lat, lng: s.centroid.lng, bbox: s.bbox });
  }
  return list.sort((a, b) => a.name.localeCompare(b.name));
}

export function countryName(code: string): string {
  return countriesLib.getName(code.toUpperCase(), 'en') ?? code.toUpperCase();
}

export function flagEmoji(code: string): string {
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

export function haversineKm(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export function nearestCity(lat: number, lng: number, maxKm = Infinity): { city: City; km: number } | null {
  let best: { city: City; km: number } | null = null;
  for (const c of CITIES) {
    if (Math.abs(c.lat - lat) > 3 || Math.abs(c.lng - lng) > 4) continue;
    const km = haversineKm(lat, lng, c.lat, c.lng);
    if (km <= maxKm && (!best || km < best.km)) best = { city: c, km };
  }
  return best;
}


/** Country for a point, falling back to the nearest featured city (coastlines at 1:50m miss some city centres). */
export function resolveCountry(lat: number, lng: number): string | null {
  return countryAt(lat, lng) ?? nearestCity(lat, lng, 30)?.city.country ?? null;
}

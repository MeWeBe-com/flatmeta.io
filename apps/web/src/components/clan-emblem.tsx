import { Castle, Compass, Crown, Flame, Gem, Globe2, Rocket, Shield, Star, Sun } from 'lucide-react';
import type { ClanEmblem as Emblem } from '@/lib/types';

export const EMBLEM_ICONS: Record<string, typeof Shield> = { shield: Shield, castle: Castle, flame: Flame, star: Star, globe: Globe2, rocket: Rocket, crown: Crown, compass: Compass, gem: Gem, sun: Sun };
export const EMBLEM_COLORS = ['#2DE2C4', '#8B7CFF', '#FFC94D', '#FF8FB1', '#3FA9F5', '#4ADE80', '#FB923C', '#F472B6'];

export function ClanEmblem({ emblem, size = 40 }: { emblem: Emblem; size?: number }) {
  const Icon = EMBLEM_ICONS[emblem.icon] ?? Shield;
  return (
    <span className="inline-grid place-items-center rounded-2xl shrink-0" style={{ width: size, height: size, background: `color-mix(in srgb, ${emblem.color} 22%, #0b1020)`, border: `2px solid ${emblem.color}`, color: emblem.color }} aria-hidden>
      <Icon size={size * 0.52} />
    </span>
  );
}

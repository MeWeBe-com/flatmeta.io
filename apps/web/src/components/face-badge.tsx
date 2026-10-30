import type { AvatarLook } from '@/lib/types';

export const FACES = ['🙂', '😎', '🤠', '🧑‍🚀', '🦊', '🐼', '🐙', '🦉', '🐯', '🦄', '🐸', '🤖', '👾', '🧙', '🥷', '🐧'];
export const ACCESSORIES = ['', '👑', '🎩', '🕶️', '🎧', '⭐', '🌸', '🔥'];
export const COLORS = ['#2DE2C4', '#8B7CFF', '#FFC94D', '#FF8FB1', '#3FA9F5', '#4ADE80', '#FB923C', '#F472B6'];

/** A round emoji avatar (the same look that walks on the map). */
export function FaceBadge({ look, size = 32 }: { look: AvatarLook | null | undefined; size?: number }) {
  const color = look?.color ?? '#8B7CFF';
  return (
    <span className="relative inline-grid place-items-center shrink-0 rounded-full" style={{ width: size, height: size, background: `color-mix(in srgb, ${color} 35%, #0b1020)`, border: `2px solid ${color}`, fontSize: size * 0.55, lineHeight: 1 }} aria-hidden>
      {look?.face ?? '🙂'}
      {look?.accessory ? <span className="absolute -top-1 -right-1" style={{ fontSize: size * 0.4 }}>{look.accessory}</span> : null}
    </span>
  );
}

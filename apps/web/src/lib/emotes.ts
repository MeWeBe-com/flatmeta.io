/** The emotes anyone on the map can send (G9). Same keys as the API's EMOTES (realtime/hub.ts). */
export const EMOTE_ICONS = { wave: '👋', heart: '❤️', laugh: '😂', clap: '👏', dance: '💃', party: '🎉', thumbs: '👍', wow: '😮' } as const;
export type Emote = keyof typeof EMOTE_ICONS;
export const EMOTE_LABELS: Record<Emote, string> = { wave: 'Wave', heart: 'Love', laugh: 'Laugh', clap: 'Clap', dance: 'Dance', party: 'Party', thumbs: 'Thumbs up', wow: 'Wow' };

/** Avatar bodies (G9). Same keys as the API's PATCH /me avatar.style. */
export const AVATAR_STYLES = [
  { key: 'classic', label: 'Classic' },
  { key: 'bubble', label: 'Bubble' },
  { key: 'pixel', label: 'Pixel' },
  { key: 'neon', label: 'Neon' },
  { key: 'ghost', label: 'Ghost' },
] as const;
export type AvatarStyle = (typeof AVATAR_STYLES)[number]['key'];

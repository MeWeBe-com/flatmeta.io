'use client';

import { useEffect, useRef, useState } from 'react';
import { Smile } from 'lucide-react';
import { EMOTE_ICONS, EMOTE_LABELS, type Emote } from '@/lib/emotes';
import { clsx } from '../ui';

/**
 * G9 walk controls: an on-screen joystick (touch devices; WASD and the arrow keys do the same on a keyboard) and the
 * emote bar. Both are only shown at the City and Land levels, where avatars are drawn.
 */
export function WalkControls({ onEmote, visible }: { onEmote: (e: Emote) => void; visible: boolean }) {
  const [open, setOpen] = useState(false);
  if (!visible) return null;
  return (
    <>
      <div className="absolute z-20 right-3 bottom-[calc(env(safe-area-inset-bottom)+208px)] md:bottom-24 flex flex-col items-end gap-2">
        {open && (
          <div role="toolbar" aria-label="Emotes" className="surface p-1.5 grid grid-cols-4 gap-1 shadow-xl">
            {(Object.keys(EMOTE_ICONS) as Emote[]).map((k) => (
              <button
                key={k}
                type="button"
                className="h-11 w-11 rounded-xl text-2xl grid place-items-center hover:bg-white/10 focus-visible:outline-2"
                aria-label={EMOTE_LABELS[k]}
                title={EMOTE_LABELS[k]}
                onClick={() => {
                  onEmote(k);
                  setOpen(false);
                }}
              >
                {EMOTE_ICONS[k]}
              </button>
            ))}
          </div>
        )}
        <button type="button" className={clsx('btn-ghost h-11 w-11 p-0 rounded-full grid place-items-center surface', open && 'ring-2 ring-[var(--color-teal)]')} aria-label="Emotes" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <Smile size={20} />
        </button>
      </div>
    </>
  );
}

const R = 46; // knob travel in px

/** Touch screens walk with this (keyboards use WASD / the arrows). */
export function useTouch() {
  const [touch, setTouch] = useState(false);
  useEffect(() => setTouch(window.matchMedia('(pointer: coarse)').matches), []);
  return touch;
}

/**
 * The on-screen joystick. It sits in the map's left control column (world-experience.tsx), in normal flow, so it can
 * never cover the locate / help buttons; the zoom buttons hide while it is shown (pinch still zooms).
 */
export function Joystick({ onStick }: { onStick: (x: number, y: number) => void }) {
  const base = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState<[number, number]>([0, 0]);
  const active = useRef<number | null>(null);
  const move = (e: React.PointerEvent) => {
    if (active.current !== e.pointerId || !base.current) return;
    const r = base.current.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2);
    let y = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(x, y);
    if (len > R) {
      x = (x / len) * R;
      y = (y / len) * R;
    }
    setKnob([x, y]);
    onStick(x / R, -y / R); // screen y grows downwards; walking north is +y
  };
  const end = () => {
    active.current = null;
    setKnob([0, 0]);
    onStick(0, 0);
  };
  return (
    <div
      ref={base}
      role="application"
      aria-label="Walk joystick"
      className="fm-joystick relative h-32 w-32 rounded-full border border-white/20 bg-[rgb(11_16_32/0.45)] backdrop-blur-sm select-none"
      onPointerDown={(e) => {
        active.current = e.pointerId;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        move(e);
      }}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
    >
      <div className="absolute left-1/2 top-1/2 h-14 w-14 -ml-7 -mt-7 rounded-full bg-[var(--color-teal)]/80 shadow-lg pointer-events-none" style={{ transform: `translate(${knob[0]}px, ${knob[1]}px)` }} />
    </div>
  );
}

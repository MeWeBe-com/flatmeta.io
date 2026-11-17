'use client';
import { useEffect } from 'react';
import { track, type FunnelEvent } from '@/lib/funnel';

/** R3f: counts one funnel event when it mounts (the layout uses it for visits, /demo for demo views). */
export function FunnelBeacon({ event = 'visit' }: { event?: FunnelEvent }) {
  useEffect(() => track(event), [event]);
  return null;
}

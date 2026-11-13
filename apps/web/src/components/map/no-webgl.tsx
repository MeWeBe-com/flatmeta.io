import Link from 'next/link';

/** Shown instead of the map where WebGL is off or unsupported (the page's first screen stays behind it). */
export function NoWebglNotice() {
  return (
    <div role="status" className="absolute z-10 inset-x-3 top-[76px] sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:w-[24rem] glass rounded-2xl p-3 text-sm">
      This browser can’t draw the live map (WebGL is off or not supported). You can still <Link className="underline" href="/explore">explore places</Link> and{' '}
      <Link className="underline" href="/brands">companies</Link>.
    </div>
  );
}

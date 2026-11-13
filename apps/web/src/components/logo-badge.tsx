/**
 * M7: a company's logo as a small badge. One look in both themes: a neutral light surface (logos are drawn for light
 * backgrounds), padding, and object-fit: contain, so a wide mark is never cropped or stretched. Stored logos are
 * trimmed to their visible pixels; when what is left covers less than ~30 % of the square badge (a thin wordmark), or
 * there is no logo, the company's initials are shown instead.
 */
export const MIN_LOGO_FILL = 0.3;

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s&-]/gu, ' ').split(/[\s-]+/).filter((w) => w && w !== '&');
  const pick = words.length > 1 ? words[0]![0]! + words[1]![0]! : (words[0] ?? '?').slice(0, 2);
  return pick.toUpperCase();
}

export function LogoBadge({ name, url, fill, size = 40, className = '' }: { name: string; url?: string | null; fill?: number | null; size?: number; className?: string }) {
  const showLogo = !!url && (fill == null || fill >= MIN_LOGO_FILL);
  const box = `inline-flex items-center justify-center shrink-0 rounded-xl bg-[#f4f5f8] ring-1 ring-black/10 shadow-sm ${className}`;
  if (showLogo) {
    return (
      <span className={box} style={{ width: size, height: size, padding: Math.round(size * 0.12) }} data-testid="logo-badge">
        <img src={url!} alt={`${name} logo`} width={size} height={size} className="size-full object-contain" loading="lazy" />
      </span>
    );
  }
  return (
    <span className={`${box} font-bold text-[#1d2433]`} style={{ width: size, height: size, fontSize: Math.max(12, Math.round(size * 0.36)) }} aria-hidden="true" data-testid="logo-initials">
      {initials(name)}
    </span>
  );
}

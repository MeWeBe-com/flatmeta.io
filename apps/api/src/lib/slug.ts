export function slugify(value: string, max = 60): string {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

const RESERVED = new Set(['admin', 'api', 'new', 'edit', 'claim', 'flatmeta', 'settings', 'dashboard', 'login', 'me', 'help', 'support']);
export const isReservedSlug = (s: string) => RESERVED.has(s);

/** Finds a free slug by appending -2, -3… using the provided existence check. */
export async function uniqueSlug(base: string, exists: (s: string) => Promise<boolean>): Promise<string> {
  let root = slugify(base) || 'plot';
  if (isReservedSlug(root)) root = `${root}-plot`;
  if (!(await exists(root))) return root;
  for (let i = 2; i < 500; i++) {
    const s = `${root.slice(0, 55)}-${i}`;
    if (!(await exists(s))) return s;
  }
  return `${root.slice(0, 40)}-${Date.now().toString(36)}`;
}

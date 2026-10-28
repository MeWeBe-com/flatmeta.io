import en from '../../messages/en.json';

/** i18n-ready: all copy lives in messages/<locale>.json. Only English ships today. */
export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';

const catalogs: Record<Locale, unknown> = { en };

export function t(key: string, vars?: Record<string, string | number>, locale: Locale = DEFAULT_LOCALE): string {
  const parts = key.split('.');
  let node: unknown = catalogs[locale];
  for (const p of parts) node = (node as Record<string, unknown> | undefined)?.[p];
  if (typeof node !== 'string') return key;
  return vars ? node.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : node;
}

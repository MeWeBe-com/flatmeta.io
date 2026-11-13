import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import localFont from 'next/font/local';
import './globals.css';
import { Providers } from '@/components/providers';
import { GlobalOverlays } from '@/components/overlays';
import { StagingBanner } from '@/components/site-chrome';
import { ServiceWorkerRegister } from '@/components/sw-register';
import { CookieNotice } from '@/components/cookie-notice';
import { APP_ENV, PLAUSIBLE_DOMAIN, SITE_URL } from '@/lib/config';
import { DEFAULT_LOCALE, t } from '@/lib/i18n';

// M2: the fonts are self-hosted through next/font, with size-matched fallbacks (adjustFontFallback) so text paints at
// once in the fallback and doesn't jump when the fonts arrive.
const inter = localFont({
  src: [
    { path: './fonts/inter-latin-wght-normal.woff2', weight: '100 900', style: 'normal' },
  ],
  variable: '--font-inter',
  display: 'swap',
  // Not preloaded either: text paints at once in the size-matched fallback and the font swaps in without a shift,
  // so no font download sits between a phone and its first readable screen.
  preload: false,
  adjustFontFallback: 'Arial',
});
const grotesk = localFont({
  src: [
    { path: './fonts/space-grotesk-latin-wght-normal.woff2', weight: '300 700', style: 'normal' },
  ],
  variable: '--font-grotesk',
  display: 'swap',
  // Headings only: not on the critical path (body text in Inter is), so it isn't preloaded.
  preload: false,
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: `${t('app.name')} · ${t('app.tagline')}`, template: `%s · ${t('app.name')}` },
  description: t('app.description'),
  applicationName: 'FlatMeta',
  openGraph: { type: 'website', siteName: 'FlatMeta', title: `${t('app.name')} · ${t('app.tagline')}`, description: t('app.description') },
  twitter: { card: 'summary_large_image' },
  appleWebApp: { capable: true, title: 'FlatMeta', statusBarStyle: 'black-translucent' },
  // Only production is indexed; staging and dev also block crawlers in robots.txt.
  robots: APP_ENV === 'production' ? { index: true, follow: true } : { index: false, follow: false },
  icons: { icon: [{ url: '/favicon.svg', type: 'image/svg+xml' }, { url: '/icons/icon-192.png', sizes: '192x192' }], apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#0B1020',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Per-request CSP nonce from src/proxy.ts (this also makes pages render per request, which nonces require).
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  return (
    <html lang={DEFAULT_LOCALE} data-theme="dark" className={`${inter.variable} ${grotesk.variable}`} suppressHydrationWarning>
      <head>
        {/* Apply the saved theme before paint to avoid a flash. */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('fm-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}` }} />
        {PLAUSIBLE_DOMAIN && <script nonce={nonce} defer data-domain={PLAUSIBLE_DOMAIN} src="https://plausible.io/js/script.js" />}
      </head>
      <body>
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] btn-primary">Skip to content</a>
        <Providers>
          {children}
          <GlobalOverlays />
          <StagingBanner />
          <CookieNotice />
        </Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}

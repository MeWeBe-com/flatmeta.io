import type { MetadataRoute } from 'next';
import { t } from '@/lib/i18n';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${t('app.name')} · ${t('app.tagline')}`,
    short_name: 'FlatMeta',
    description: t('app.description'),
    id: '/',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0B1020',
    theme_color: '#0B1020',
    categories: ['games', 'social', 'navigation'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Explore', url: '/explore' },
      { name: 'My plots', url: '/dashboard/plots' },
      { name: 'Quests', url: '/dashboard/progress' },
    ],
  };
}

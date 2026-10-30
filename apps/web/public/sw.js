/* FlatMeta service worker: offline shell, cache-first for static assets and media, network-first for pages.
   API calls, WebSockets and map tiles are never cached here (tiles are cached by the browser/CDN). */
const VERSION = 'fm-v1';
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const MEDIA = `${VERSION}-media`;
const PRECACHE = ['/offline', '/favicon.svg', '/icons/icon-192.png', '/manifest.webmanifest'];
const MAX_MEDIA = 300;
const MAX_PAGES = 40;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(STATIC).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i++) await cache.delete(keys[i]);
}

async function cacheFirst(req, cacheName, max) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) {
    cache.put(req, res.clone());
    if (max) trim(cacheName, max);
  }
  return res;
}

async function networkFirst(req) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(req);
    if (res.ok) {
      cache.put(req, res.clone());
      trim(PAGES, MAX_PAGES);
    }
    return res;
  } catch {
    return (await cache.match(req)) || (await caches.match('/offline')) || Response.error();
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/admin') || url.pathname.startsWith('/dashboard')) return;

  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/vendor/') || url.pathname === '/favicon.svg') {
    event.respondWith(cacheFirst(req, STATIC));
  } else if (url.pathname.startsWith('/media/')) {
    event.respondWith(cacheFirst(req, MEDIA, MAX_MEDIA));
  } else if (req.mode === 'navigate') {
    event.respondWith(networkFirst(req));
  }
});

/* Online List — offline shell + fresh data */
const VERSION = 'v1.4.0';
const CACHE = `online-list-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './help/',
  './help/index.html',
  './assets/css/help.css',
  './assets/js/help.js',
  './manifest.webmanifest',
  './assets/css/tokens.css',
  './assets/css/base.css',
  './assets/css/app.css',
  './assets/js/theme-boot.js',
  './assets/js/icons.js',
  './assets/js/util.js',
  './assets/js/model.js',
  './assets/js/state.js',
  './assets/js/api.js',
  './assets/js/ui.js',
  './assets/js/crypto.js',
  './assets/js/render.js',
  './assets/js/admin.js',
  './assets/js/app.js',
  './assets/fonts/Vazirmatn-Variable.woff2',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './data/store.json',
  './data/site.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.allSettled(ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' }))));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  if (request.mode === 'navigate') {
    // Offline fallback depends on the section: the handbook should not dump the
    // visitor on the shop page.
    const fallback = url.pathname.includes('/help') ? './help/index.html' : './index.html';
    event.respondWith(networkFirst(request, fallback));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    if (fallbackUrl) {
      const fallback = await cache.match(fallbackUrl);
      if (fallback) return fallback;
    }
    return new Response('آفلاین', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached || (await fetchPromise) || new Response('', { status: 504 });
}

/* Online List — offline shell + fresh data */
const VERSION = 'v1.24.0';
const CACHE = `online-list-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './help/',
  './help/index.html',
  './assets/css/help.css',
  './assets/js/help.js',
  './manifest.webmanifest',
  './assets/css/fast-v24/site.css',
  './assets/js/theme-boot.js',
  './assets/js/fast-v24/gradient-loader.js',
  './assets/js/fast-v24/icons.js',
  './assets/js/fast-v24/util.js',
  './assets/js/fast-v24/model.js',
  './assets/js/fast-v24/state.js',
  './assets/js/fast-v24/api.js',
  './assets/js/fast-v24/ui.js',
  './assets/js/fast-v24/crypto.js',
  './assets/js/fast-v24/render.js',
  './assets/js/fast-v24/app.js',
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
  // These paths change whenever the source changes. Cached modules and CSS
  // can load instantly on return visits without serving an obsolete release.
  if (/\/assets\/(?:js|css)\/fast-v\d+\//.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.includes('/data/')) {
    event.respondWith(networkFirst(request));
    return;
  }
  // A theme fix must not be hidden for one visit by a stale JS/CSS response.
  // Browser HTTP caching still applies; offline requests use the precache.
  if (/\.(?:js|css)$/.test(url.pathname)) {
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

async function cacheFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE);
  try {
    // Bypass the browser's HTTP cache for HTML and unversioned files.
    // The CDN may still need time to publish a commit, but an old local
    // max-age must not add another several minutes on top of that.
    const fresh = await fetch(request, { cache: 'no-store' });
    if (fresh && fresh.ok) cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
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

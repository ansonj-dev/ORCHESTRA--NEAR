/* Orchestra PWA service worker v2. Bump VERSION when the shell changes. */
const VERSION = 'v2';
const SHELL_CACHE = `orchestra-shell-${VERSION}`;
const ASSET_CACHE = `orchestra-assets-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const ROUTES = ['/', '/agents', '/near', '/docs', '/roster', '/tools', '/dashboard', '/studio', '/ide-bridge', '/demo-target'];
const SHELL = [
  OFFLINE_URL, '/manifest.webmanifest',
  '/icons/orchestra.svg', '/icons/orchestra-maskable.svg',
  '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-192.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL);
    // Warm every route best-effort; an offline install must not fail.
    await Promise.all(ROUTES.map(async (route) => {
      try {
        const response = await fetch(route, { credentials: 'same-origin' });
        if (response.ok) await cache.put(route, response);
      } catch { /* offline page remains the fallback */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = [SHELL_CACHE, ASSET_CACHE];
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => !keep.includes(key)).map((key) => caches.delete(key)));
    if (self.registration.navigationPreload) await self.registration.navigationPreload.enable();
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Never cache API responses, wallet state, or hot-reload traffic.
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_next/webpack-hmr')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const preloaded = await event.preloadResponse;
        const response = preloaded || await fetch(request);
        if (response.ok) {
          const cache = await caches.open(SHELL_CACHE);
          await cache.put(request, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(request, { ignoreSearch: true })) || (await cache.match(OFFLINE_URL));
      }
    })());
    return;
  }

  const isStatic = url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')
    || url.pathname.startsWith('/screenshots/') || /\.(?:woff2?|css|js|png|svg|webp)$/.test(url.pathname);
  if (isStatic) {
    // Stale-while-revalidate
    event.respondWith((async () => {
      const cache = await caches.open(ASSET_CACHE);
      const cached = await cache.match(request);
      const network = fetch(request).then((response) => {
        if (response.ok) cache.put(request, response.clone());
        return response;
      }).catch(() => cached);
      return cached || network;
    })());
  }
});

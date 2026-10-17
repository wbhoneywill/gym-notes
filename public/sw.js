const CACHE_NAME = 'gymnotes-shell-v9';
const STATIC_ASSETS = [
  '/offline.html',
  '/manifest.webmanifest',
  '/icons/gymnotes-192.png',
  '/icons/gymnotes-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || (url.origin === self.location.origin && url.pathname.startsWith('/api/'))) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cacheKey = new Request(`${url.origin}${url.pathname}`);
      try {
        const response = await fetch(request);
        const isRecorderShell = url.origin === self.location.origin && /^\/train(?:\/[^/]+)?$/.test(url.pathname);
        const isHtml = response.headers.get('content-type')?.includes('text/html');
        if (isRecorderShell && response.ok && !response.redirected && isHtml) {
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch {
        if (/^\/train\/[^/]+$/.test(url.pathname)) {
          const recorderShell = await cache.match(new Request(`${url.origin}/train/offline`));
          if (recorderShell) return recorderShell;
        }
        return (await cache.match(cacheKey)) || (await cache.match('/offline.html'));
      }
    })());
    return;
  }

  const cacheableAsset = ['script', 'style', 'image', 'font'].includes(request.destination);
  if (cacheableAsset && (url.origin === self.location.origin || request.destination === 'script')) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok || response.type === 'opaque') caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone()));
        return response;
      }))
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'CACHE_LOADED_ASSETS') {
    const assets = Array.isArray(event.data.assets) ? event.data.assets.slice(0, 100) : [];
    event.waitUntil((async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(assets.map(async (assetUrl) => {
        try {
          const url = new URL(assetUrl);
          const allowed = (url.origin === self.location.origin && !url.pathname.startsWith('/api/'))
            || (url.pathname.includes('/npm/@clerk/') && url.pathname.endsWith('.js'));
          if (!allowed) return;
          const response = await fetch(assetUrl, { mode: url.origin === self.location.origin ? 'same-origin' : 'no-cors' });
          if (response.ok || response.type === 'opaque') await cache.put(assetUrl, response);
        } catch {
          // A missing optional asset must not block shell caching.
        }
      }));
    })());
    return;
  }
  if (event.data?.type !== 'CACHE_TRAINING_ROUTE') return;
  const path = event.data.path;
  if (typeof path !== 'string' || !/^\/train(?:\/[^/]+)?$/.test(path)) return;
  event.waitUntil((async () => {
    try {
      const response = await fetch(path, { credentials: 'include' });
      if (!response.ok || response.redirected || !response.headers.get('content-type')?.includes('text/html')) return;
      const cache = await caches.open(CACHE_NAME);
      await cache.put(new Request(`${self.location.origin}${path}`), response);
    } catch {
      // A previously cached shell remains available.
    }
  })());
});

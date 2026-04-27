// Osprey Service Worker
// Strategy: network-first for all requests, cache as fallback for app shell only.
// We do NOT cache API responses or user data — only the static app shell.

const CACHE_VERSION = 'osprey-v2';

// Only these paths are cached for offline fallback
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/osprey-icon.svg',
];

// These origins are never cached — always go to network
const NO_CACHE_ORIGINS = [
  'api.hyperliquid.xyz',
  'api.hyperliquid-testnet.xyz',
  'fonts.googleapis.com',
  'fonts.gstatic.com',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_VERSION)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Never cache external origins — always network
  if (NO_CACHE_ORIGINS.some(origin => url.hostname.includes(origin))) {
    e.respondWith(
      fetch(e.request).catch(() =>
        new Response(JSON.stringify({ error: 'offline' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      )
    );
    return;
  }

  // For navigation requests (HTML pages), network-first with app shell fallback
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // For static assets (JS, CSS, fonts, images): cache-first
  // These are content-hashed by Vite so cache invalidation is automatic
  if (
    url.pathname.startsWith('/assets/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.ico')
  ) {
    e.respondWith(
      caches.match(e.request).then(cached => {
        if (cached) return cached;
        return fetch(e.request).then(res => {
          const clone = res.clone();
          caches.open(CACHE_VERSION).then(c => c.put(e.request, clone));
          return res;
        });
      })
    );
    return;
  }

  // Everything else: network only, no caching
  e.respondWith(fetch(e.request));
});

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
  // SW-01: merged — single activate handler runs cache cleanup AND schedules alarm.
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k !== CACHE_VERSION)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
      .then(() => scheduleNextDailyAlarm())
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

// ── Phase 3: Push Notifications ───────────────────────────────────────────────

self.addEventListener('push', (e) => {
  /** @type {{ title?: string; body?: string; tag?: string; data?: unknown }} */
  const payload = e.data ? e.data.json() : {};
  const title   = payload.title ?? 'Osprey';
  const options = {
    body:    payload.body ?? 'Daily funding harvest summary ready.',
    icon:    '/osprey-icon.svg',
    badge:   '/osprey-icon.svg',
    tag:     payload.tag ?? 'osprey-daily',
    data:    payload.data ?? {},
    actions: [
      { action: 'open',    title: 'Open Osprey' },
      { action: 'dismiss', title: 'Dismiss' },
    ],
  };
  e.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  if (e.action === 'dismiss') return;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      const existing = list.find(c => c.url.includes(self.location.origin) && 'focus' in c);
      if (existing) return existing.focus();
      return clients.openWindow('/portfolio');
    })
  );
});

// ── Daily 08:00 summary alarm ─────────────────────────────────────────────────

function scheduleNextDailyAlarm() {
  const now  = new Date();
  const next = new Date(now);
  next.setHours(8, 0, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  const msUntil = next.getTime() - now.getTime();

  setTimeout(() => {
    fireDailySummaryNotification();
    scheduleNextDailyAlarm(); // reschedule for next day
  }, msUntil);
}

function fireDailySummaryNotification() {
  // Read stored summary from IndexedDB / message from main thread
  // Falls back to a generic push if no data is available
  const prefs = {};
  try {
    const raw = /* storage not available in SW; clients send via postMessage */ null;
    Object.assign(prefs, raw);
  } catch { /* ignore */ }

  self.registration.showNotification('Osprey · Daily Summary', {
    body:  'Check your funding harvest P&L for today.',
    icon:  '/osprey-icon.svg',
    badge: '/osprey-icon.svg',
    tag:   'osprey-daily-summary',
  });
}

// SW-01: second activate listener removed — merged into the single handler above.

// Allow main thread to send daily P&L data for richer notification
self.addEventListener('message', (e) => {
  if (!e.data) return;
  if (e.data.type === 'DAILY_SUMMARY') {
    const { netPnl, positions, regime } = e.data;
    self.registration.showNotification('Osprey · Daily Summary', {
      body:  `Net P&L: $${netPnl?.toFixed(2) ?? '0.00'} · ${positions ?? 0} open · Regime: ${regime ?? 'NEUTRAL'}`,
      icon:  '/osprey-icon.svg',
      badge: '/osprey-icon.svg',
      tag:   'osprey-daily-summary',
    });
  }
  if (e.data.type === 'REGIME_CHANGE') {
    self.registration.showNotification('Osprey · Regime Change', {
      body:  `Market shifted to ${e.data.newRegime ?? 'NEUTRAL'}`,
      icon:  '/osprey-icon.svg',
      tag:   'osprey-regime',
    });
  }
  if (e.data.type === 'POSITION_EXITED') {
    self.registration.showNotification('Osprey · Position Exited', {
      body:  `${e.data.symbol ?? 'Unknown'} exited · Net: $${e.data.net?.toFixed(2) ?? '0.00'}`,
      icon:  '/osprey-icon.svg',
      tag:   `osprey-exit-${e.data.symbol}`,
    });
  }
  if (e.data.type === 'RATE_DROP') {
    self.registration.showNotification('Osprey · Rate Alert', {
      body:  `${e.data.symbol ?? 'Unknown'} rate dropped below exit threshold`,
      icon:  '/osprey-icon.svg',
      tag:   `osprey-rate-${e.data.symbol}`,
    });
  }
});

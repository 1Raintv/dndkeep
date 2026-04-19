// DNDKeep Service Worker
// IMPORTANT: CACHE_NAME is auto-rewritten by deploy.bat on every deploy
// to match the app version (e.g. 'dndkeep-v2.27.0'). Any byte change to
// this file forces browsers to install the new SW, which (with skipWaiting +
// clients.claim below) immediately replaces the old one and clears its cache.
const CACHE_NAME = 'dndkeep-v2.27.0';
const STATIC_ASSETS = [
  '/',
  '/manifest.json',
];

// Install — cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch(() => {
        // Non-fatal — just skip caching if offline during install
      });
    })
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// Fetch — network first, fall back to cache
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.includes('supabase.co')) return;
  if (event.request.url.includes('stripe.com')) return;

  const url = new URL(event.request.url);

  // Never cache hashed JS/CSS chunks — they change every deploy
  // These have content hashes in filenames (e.g. index-Abc123.js)
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          if (event.request.mode === 'navigate') {
            // Return cached shell for any app route when offline
            return caches.match('/') || caches.match(event.request);
          }
        });
      })
  );
});

// Push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'DNDKeep', body: 'New update from your campaign!' };
  try {
    data = event.data ? event.data.json() : data;
  } catch {}

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || 'dndkeep-notification',
    data: data.url ? { url: data.url } : {},
    vibrate: [200, 100, 200],
    requireInteraction: data.requireInteraction || false,
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Notification click — open relevant page
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/campaigns';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing window if open
      for (const client of clients) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      // Otherwise open new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(url);
      }
    })
  );
});

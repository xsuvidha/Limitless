/* ANKIT — offline shell.

   Strategy matters here:
   • HTML  → NETWORK-FIRST. Always try the network, fall back to cache
     when offline. Without this, a cache-first shell serves stale HTML
     forever and new deploys never reach returning visitors.
   • Static assets (icon, manifest) → cache-first; they rarely change.
   • /api/ → never touched. Generation is always live.                */

const CACHE = 'ankit-v6-1';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      // addAll() is all-or-nothing: one 404 rejects the whole install.
      // Adding individually means a missing optional asset can't break us.
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.pathname.startsWith('/api/')) return;          // always live

  const isDoc = req.mode === 'navigate' ||
                (req.headers.get('accept') || '').includes('text/html');

  if (isDoc) {
    // NETWORK-FIRST: fresh HTML whenever the network allows.
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html').then(hit => hit || Response.error()))
    );
    return;
  }

  // CACHE-FIRST for everything else, refreshing in the background.
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res.ok && url.origin === location.origin) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});

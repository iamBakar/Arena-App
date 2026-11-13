/* Service worker: lets the app open offline once it has been loaded.
   Change VERSION whenever you upload new files so phones pick up the update. */
const VERSION = 'arena-v5';
const FILES = ['./', 'index.html', 'style.css', 'core.js', 'engine.js', 'store.js', 'setup.js', 'exporter.js', 'firebase-config.js', 'cloud.js', 'auth.js', 'tournament.js', 'app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first (so updates show up), cache as the offline fallback. Also keeps Google Fonts for offline.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  // Only handle our own files, Firebase's script files and fonts. Never touch login or database traffic.
  const host = new URL(e.request.url).hostname;
  if (new URL(e.request.url).origin !== self.location.origin && !['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'].includes(host)) return;
  e.respondWith(
    fetch(e.request).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

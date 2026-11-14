/* Service worker: lets the app open offline once it has been loaded.
   Change VERSION whenever you upload new files so phones pick up the update. */
const VERSION = 'arena-v10';
const FILES = ['./', 'index.html', 'style.css', 'core.js', 'engine.js', 'store.js', 'setup.js', 'schedule.js', 'exporter.js', 'firebase-config.js', 'cloud.js', 'auth.js', 'sync.js', 'watch.js', 'tournament.js', 'app.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png'];
const THIRD_PARTY = ['www.gstatic.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

// Install: always fetch fresh copies (skip the browser's own cache, which can hold old files for ~10 minutes after an upload).
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION)
    .then(c => Promise.all(FILES.map(f => fetch(new Request(f, { cache: 'reload' })).then(r => { if (!r.ok) throw new Error('missing ' + f); return c.put(f, r); }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// Network first, checking with the server every time (so updates show up and files never mix), cache as the offline fallback.
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url), same = u.origin === self.location.origin;
  if (!same && !THIRD_PARTY.includes(u.hostname)) return;                 // never touch login or database traffic
  const req = same ? new Request(e.request.url, { cache: 'no-cache' }) : e.request;
  e.respondWith(
    fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});

// Offline shell. Bump CACHE on every release so phones pick up the new files.
const CACHE = 'bonsai-0.2.0';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'sources.json',
  'css/tokens.css', 'css/app.css',
  'js/app.js', 'js/db.js', 'js/ui.js', 'js/logic.js', 'js/books.js', 'js/epub.js', 'js/sanitize.js',
  'js/selection.js', 'js/sidequest.js',
  'js/screens/feed.js', 'js/screens/item.js', 'js/screens/library.js', 'js/screens/reader.js',
  'js/screens/saved.js', 'js/screens/settings.js',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Fonts: cache-first (they never change).
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(CACHE).then(async (c) => {
      const hit = await c.match(e.request);
      if (hit) return hit;
      const res = await fetch(e.request);
      if (res.ok || res.type === 'opaque') c.put(e.request, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return; // feed server, Side Quest, articles: straight to network

  // App files: network first so updates land, cache when offline.
  e.respondWith(fetch(e.request).then((res) => {
    if (res.ok) caches.open(CACHE).then((c) => c.put(e.request, res.clone()));
    return res;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});

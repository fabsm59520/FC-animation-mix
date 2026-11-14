const CACHE = 'galactic-dj-v2';
const SHELL = ['./', './index.html', './style.css', './script.js', './outils.js', './manifest.json', './icon-192.png', './icon-512.png'];
const CDN = ['cdnjs.cloudflare.com', 'unpkg.com'];

self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', (e) => {
    e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
    self.clients.claim();
});
// Réseau d'abord (toujours à jour), cache en secours hors ligne. YouTube / API Google : jamais interceptés.
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    if (e.request.method !== 'GET' || !(url.origin === location.origin || CDN.includes(url.hostname))) return;
    e.respondWith(fetch(e.request).then(r => {
        const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r;
    }).catch(() => caches.match(e.request)));
});

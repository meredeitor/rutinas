importScripts('./js/version.js');
const CACHE = `rutinas-v${self.APP_VERSION}`;
const ASSETS = ['./', './index.html', './css/styles.css', './css/machine-photo.css', './css/qr-stickers.css', './css/audits.css', './css/access-control-theme.css', './js/app.js?v=1.3.2', './js/firebase-config.js', './js/version.js?v=1.3.2', './js/theme.js?v=1.3.2', './manifest.webmanifest', './icons/icon.svg'];
self.addEventListener('install', event => event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS))));
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))));
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (new URL(event.request.url).origin !== location.origin) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok) caches.open(CACHE).then(cache => cache.put(event.request, response.clone()));
    return response;
  }).catch(async () => (await caches.match(event.request)) || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});

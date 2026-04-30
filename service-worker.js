const CACHE = 'hajj-dua-companion-2026-04-30';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.webmanifest',
  './icon.svg',
  './apple-touch-icon.png',
  './icons/favicon-16.png',
  './icons/favicon-32.png',
  './icons/favicon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-1024.png',
  './print.html',
  './hajj_dua_companion_mobile.pdf',
  './data/duas.json',
  './assets/fonts/UthmanicHafs1Ver18.woff2',
  './assets/fonts/AmiriQuran-Regular.ttf',
  './assets/fonts/NotoNaskhArabic-Regular.ttf',
  './assets/fonts/NotoNaskhArabic-SemiBold.ttf',
  './assets/fonts/NotoNaskhArabic-Bold.ttf'
];
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});
self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))));
  self.clients.claim();
});
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
    const copy = response.clone();
    caches.open(CACHE).then((cache) => cache.put(event.request, copy));
    return response;
  }).catch(() => caches.match('./index.html'))));
});

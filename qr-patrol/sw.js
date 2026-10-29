/* QR Patrol service worker — precaches the whole app so it runs fully offline.
 * Bump APP_VERSION on every deploy so phones pick up the new files when they are next online. */
const APP_VERSION = '1.1.0';
const CACHE = 'qr-patrol-' + APP_VERSION;
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './js/util.js',
  './js/db.js',
  './js/logic.js',
  './js/scanner.js',
  './js/labels.js',
  './js/export.js',
  './js/report.js',
  './js/app.js',
  './lib/qrcode.js',
  './lib/jsQR.js',
  './lib/xlsx.mini.min.js',
  './lib/jspdf.umd.min.js',
  './icons/favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('qr-patrol-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'GET_VERSION' && event.source) event.source.postMessage({ type: 'VERSION', version: APP_VERSION });
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((cached) => {
      if (cached) return cached;
      if (req.mode === 'navigate') {
        return caches.match('./index.html').then((index) => index || fetch(req));
      }
      return fetch(req).then((resp) => {
        if (resp && resp.ok && resp.type === 'basic') {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      });
    })
  );
});

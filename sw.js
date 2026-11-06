'use strict';

// Bei jeder Änderung an den App-Dateien erhöhen, damit die Handys die neue Version laden.
const CACHE = 'buecher-v3';
// Cover (Google, Open Library, Amazon und eingefügte Bildadressen) bleiben über App-Updates hinweg erhalten.
const COVER_CACHE = 'buecher-cover';
const DATEIEN = [
  './',
  'index.html',
  'styles.css',
  'app.js',
  'manifest.webmanifest',
  'icons/icon-192.png',
  'icons/icon-512.png',
];

// Fremde Bilder belegen viel Speicherkontingent; die ältesten fliegen ab 400 Stück raus.
const MAX_COVER = 400;
function kuerzeCoverCache(cache) {
  return cache.keys().then((schluessel) => Promise.all(
    schluessel.slice(0, Math.max(0, schluessel.length - MAX_COVER)).map((s) => cache.delete(s))
  ));
}

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((namen) => Promise.all(namen.filter((n) => n !== CACHE && n !== COVER_CACHE).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Cover: erst Cache, sonst laden und merken (auch undurchsichtige Antworten von <img>).
  if (e.request.destination === 'image' && url.origin !== location.origin && url.protocol === 'https:') {
    e.respondWith(
      caches.open(COVER_CACHE).then((c) => c.match(e.request).then((treffer) => treffer || fetch(e.request).then((antwort) => {
        if (antwort.ok || antwort.type === 'opaque') {
          c.put(e.request, antwort.clone()).then(() => kuerzeCoverCache(c)).catch(() => {});
        }
        return antwort;
      })))
    );
    return;
  }

  if (url.origin !== location.origin) return;

  // Erst Netz, damit Änderungen sofort ankommen; ohne Verbindung aus dem Cache.
  e.respondWith(
    fetch(e.request)
      .then((antwort) => {
        if (antwort.ok) {
          const kopie = antwort.clone();
          caches.open(CACHE).then((c) => c.put(e.request, kopie));
        }
        return antwort;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true })
        .then((treffer) => treffer || caches.match('./')))
  );
});

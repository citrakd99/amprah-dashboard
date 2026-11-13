/* Service worker: menyimpan HANYA berkas aplikasi (kode, ikon) supaya bisa dipasang & dibuka cepat.
 * Data Google Sheet tidak pernah disimpan di cache – selalu diambil langsung dari Google. */
const CACHE = 'amprah-shell-v1';
const SHELL = ['./', 'index.html', 'css/style.css', 'js/config.js', 'js/extract.js', 'js/app.js',
  'vendor/xlsx.full.min.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // hanya berkas dari situs ini; permintaan ke Google (data) dilewatkan apa adanya
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // jaringan dulu supaya versi terbaru selalu terpakai; cache dipakai saat offline
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
      return res;
    }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});

// Cache halaman/aset app ini. Nama diberi awalan 'quran-shell-' supaya hanya cache miliknya yang dibersihkan.
// Cache 'mushaf-v1' (unduhan gambar, dipakai bersama Kuis Murojaah v3) dan cache app lain TIDAK dihapus.
const CACHE = 'quran-shell-v6'; // naik versi: mushaf.html kini melanjutkan murattal otomatis setelah jeda sistem + tombol lanjut ayat terakhir
const ASSETS = ['./', './index.html', './mushaf.html', './config.js', './manifest.webmanifest', './icon-192.png', './icon-512.png'];
self.addEventListener('install', e => {
  // simpan per file: satu file yang tidak ada tidak menggagalkan instalasi
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(ASSETS.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(
    ks.filter(k => k === 'quran-v1' || (k.startsWith('quran-shell-') && k !== CACHE)).map(k => caches.delete(k))
  )).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  // audio murattal (everyayah): biarkan browser mengurusnya sendiri (permintaan Range, dan tidak digandakan ke cache ini;
  // simpanan offline audio ada di cache 'mushaf-audio-v1' yang diatur mushaf.html)
  if (r.headers.has('range') || r.destination === 'audio' || r.destination === 'video' || /\.(mp3|m4a|ogg|wav)$/i.test(new URL(r.url).pathname)) return;
  // gambar mushaf: pakai simpanan offline dulu (dari unduhan), lalu internet; tidak digandakan ke cache lain
  if (/\.(jpe?g|png|webp)$/i.test(new URL(r.url).pathname)) {
    e.respondWith(caches.match(r).then(hit => hit || fetch(r)));
    return;
  }
  e.respondWith(
    fetch(r).then(res => {
      if (res.ok && !res.redirected) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); }
      return res;
    }).catch(() => caches.match(r, { ignoreSearch: true }))
  );
});

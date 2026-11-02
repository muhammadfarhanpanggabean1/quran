/* Service worker Mushaf
 * - Shell app (HTML/JS/JSON/ikon) di-cache di 'mushaf-shell-v1' agar app terbuka offline.
 * - Cache gambar 'mushaf-v1' dan audio 'mushaf-audio-v1' DIKELOLA oleh halaman (tombol simpan offline),
 *   jadi SW hanya MEMBACA dari sana dan tidak pernah menulis atau menghapusnya.
 * Naikkan SHELL setiap kali mushaf.html / config.js berubah agar pengguna mendapat versi baru.
 */
const SHELL = 'mushaf-shell-v2';
const IMG_CACHE = 'mushaf-v1';
const AUDIO_CACHE = 'mushaf-audio-v1';

const PRECACHE = [
  './',
  'mushaf.html',
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'icon-192.png',
  'ayah-boxes-P.json',
  'ayah-boxes-L.json'
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    // satu per satu: file yang belum ada tidak menggagalkan instalasi
    await Promise.all(PRECACHE.map(u => c.add(new Request(u, { cache: 'reload' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    // hanya hapus cache shell versi lama; cache gambar/audio/kuis tidak disentuh
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('mushaf-shell-') && k !== SHELL).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

const isImg = req => req.destination === 'image' || /\.(png|jpe?g|webp|avif|gif|svg)(\?|$)/i.test(req.url);
const isAudio = req => req.destination === 'audio' || /\.mp3(\?|$)/i.test(req.url);

async function fromMedia(req) {
  // cari di cache gambar/audio milik halaman (abaikan header Range: kembalikan penuh bila ada)
  for (const name of [IMG_CACHE, AUDIO_CACHE]) {
    try {
      const c = await caches.open(name);
      const r = await c.match(req.url, { ignoreVary: true });
      if (r) return r;
    } catch (_) {}
  }
  return null;
}

// Selalu ambil versi TERBARU dari server (lewati cache HTTP GitHub Pages); cache hanya cadangan saat offline
async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok && res.type === 'basic') c.put(req, res.clone());
    return res;
  } catch (_) {
    const hit = await c.match(req, { ignoreSearch: true });
    return hit || Response.error();
  }
}

async function navigate(req) {
  const c = await caches.open(SHELL);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res && res.ok) c.put(req, res.clone());
    return res;
  } catch (_) {
    const hit = (await c.match(req, { ignoreSearch: true })) ||
                (await c.match('mushaf.html')) ||
                (await c.match('./'));
    return hit || Response.error();
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Gambar halaman & audio: pakai salinan offline bila ada, kalau tidak lanjut ke jaringan
  if (isImg(req) || isAudio(req)) {
    // permintaan Range (audio streaming) dibiarkan ke jaringan kecuali sudah tersimpan utuh
    e.respondWith((async () => {
      const hit = await fromMedia(req);
      if (hit) return hit;
      return fetch(req);
    })());
    return;
  }

  // Lintas-origin lainnya: biarkan browser
  if (url.origin !== location.origin) return;

  // Pindah halaman: jaringan dulu, cadangan dari cache
  if (req.mode === 'navigate') {
    e.respondWith(navigate(req));
    return;
  }

  // File app (JS/JSON/manifest/ikon): jaringan dulu supaya selalu yang terbaru
  e.respondWith(networkFirst(req));
});

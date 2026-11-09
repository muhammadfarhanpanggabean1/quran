/* sw.js — Mushaf (mushaf.html)
 *
 * Tugas:
 *  1. Cangkang app (HTML, config.js, manifest, ikon, ayah-boxes-*.json) bisa dibuka offline.
 *  2. Gambar halaman yang sudah diunduh lewat tombol "Simpan offline" (cache 'mushaf-v1')
 *     dilayani dari cache itu saat dimuat <img>, sehingga bisa dibaca tanpa internet.
 *
 * Yang SENGAJA tidak dilakukan:
 *  - Tidak menulis ke 'mushaf-v1' dan 'mushaf-audio-v1'. Dua cache itu dikelola penuh oleh app
 *    (status unduhan per juz dibaca dari daftar kuncinya, dan dipakai bersama Kuis Murojaah),
 *    jadi SW hanya MEMBACA dari 'mushaf-v1'.
 *  - Tidak menghapus cache selain milik sendiri ('mushaf-shell-*') saat activate.
 *  - Tidak mencegat audio (mp3 / permintaan Range): app menanganinya sendiri.
 */
const VERSION = 'v1';
const SHELL = 'mushaf-shell-' + VERSION;
const IMG_CACHE = 'mushaf-v1'; // hanya dibaca

// Berkas opsional boleh tidak ada (mis. icon-512.png); install tidak gagal karenanya.
const PRECACHE = [
  './',
  'mushaf.html',
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'ayah-boxes-P.json',
  'ayah-boxes-L.json'
];

const IMG_RE = /\.(?:png|jpe?g|webp|avif|gif|svg)(?:$|\?)/i;
const AUDIO_RE = /\.(?:mp3|m4a|ogg|wav)(?:$|\?)/i;

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL);
    await Promise.allSettled(PRECACHE.map(async (u) => {
      const r = await fetch(new Request(u, { cache: 'reload' }));
      if (r && r.ok) await c.put(u, r);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('mushaf-shell-') && k !== SHELL).map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (req.headers.has('range')) return; // audio/video: biarkan langsung ke jaringan

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (!/^https?:$/.test(url.protocol)) return;
  if (AUDIO_RE.test(url.pathname) || req.destination === 'audio') return;

  // Gambar halaman: pakai salinan yang sudah diunduh bila ada, kalau tidak ke jaringan.
  if (req.destination === 'image' || IMG_RE.test(url.pathname)) {
    e.respondWith(imageFromSaved(req));
    return;
  }

  // Selebihnya hanya berkas satu asal (origin) dengan app.
  if (url.origin !== self.location.origin) return;

  // Halaman & skrip: jaringan dulu (selalu versi terbaru), cache bila offline.
  if (req.mode === 'navigate' || /\.(?:html|js|webmanifest)$/i.test(url.pathname)) {
    e.respondWith(networkFirst(req));
    return;
  }

  // Data kotak ayat (bertambah bertahap): tampilkan cache dulu, segarkan di latar.
  if (/ayah-boxes-[A-Za-z]+\.json$/i.test(url.pathname)) {
    e.respondWith(staleWhileRevalidate(req));
    return;
  }

  // Ikon dan berkas statis lain.
  e.respondWith(cacheFirst(req));
});

async function imageFromSaved(req) {
  try {
    const c = await caches.open(IMG_CACHE);
    const hit = (await c.match(req.url, { ignoreVary: true })) || (await c.match(req, { ignoreVary: true }));
    if (hit) return hit;
  } catch (_) { /* lanjut ke jaringan */ }
  // Gambar yang belum diunduh: langsung dari jaringan, tidak disimpan oleh SW.
  return fetch(req);
}

async function networkFirst(req) {
  const c = await caches.open(SHELL);
  try {
    const r = await fetch(req);
    if (r && r.ok && r.type === 'basic') c.put(req, r.clone()).catch(() => {});
    return r;
  } catch (err) {
    const hit = (await c.match(req, { ignoreSearch: true })) || (await caches.match(req, { ignoreSearch: true }));
    if (hit) return hit;
    if (req.mode === 'navigate') {
      const fb = (await c.match('mushaf.html')) || (await c.match('./'));
      if (fb) return fb;
    }
    throw err;
  }
}

async function staleWhileRevalidate(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req)
    .then((r) => {
      if (r && r.ok) c.put(req, r.clone()).catch(() => {});
      return r;
    })
    .catch(() => null);
  if (hit) { net.catch(() => {}); return hit; }
  const r = await net;
  return r || new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
}

async function cacheFirst(req) {
  const c = await caches.open(SHELL);
  const hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const r = await fetch(req);
  if (r && r.ok && r.type === 'basic') c.put(req, r.clone()).catch(() => {});
  return r;
}

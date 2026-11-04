// Keeps a copy of the whole game on the device so it runs with no connection.
//
// Files come from the network first and the copy is only a fallback, so edits show up on a
// normal reload. Adding or removing a file means updating FILES: `npm run check:offline` catches a miss.

const CACHE = 'breakwater-v2';
const NETWORK_TIMEOUT_MS = 3000;

const FILES = [
  './',
  'index.html',
  'styles.css',
  'manifest.webmanifest',
  'src/audio.js',
  'src/content.js',
  'src/level-tuning.js',
  'src/levels.js',
  'src/main.js',
  'src/sim.js',
  'src/render/models.js',
  'src/render/overlay.js',
  'src/render/view.js',
  'src/render/world.js',
  'vendor/three/three.module.js',
  'vendor/fonts/barlow-condensed-500.woff2',
  'vendor/fonts/barlow-condensed-700.woff2',
  'vendor/fonts/barlow-condensed-800.woff2',
  'vendor/fonts/saira-stencil-one.woff2',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(FILES.map((file) => new Request(file, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

// The page is stored under both of its addresses. They're updated together because only one gets
// visited, and the other would otherwise go stale and stop matching the scripts.
const PAGE_ADDRESSES = ['./', 'index.html'].map((file) => new URL(file, self.location).href);

function store(cache, request, response) {
  const url = new URL(request.url);
  const address = url.origin + url.pathname;
  const keys = PAGE_ADDRESSES.includes(address) ? PAGE_ADDRESSES : [request];
  return Promise.all(keys.map((key) => cache.put(key, response.clone())));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(request, { ignoreSearch: true })
    ?? (request.mode === 'navigate' ? await cache.match('index.html') : undefined);

  // With a copy to fall back on, a slow connection shouldn't hold up the game.
  const controller = new AbortController();
  const timer = cached ? setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS) : null;
  try {
    // no-cache makes the browser ask the server whether a file changed. Without it, the browser
    // decides for itself that a recent copy is still good and a reload can miss an update.
    const response = await fetch(request, { signal: controller.signal, cache: 'no-cache' });
    if (response.ok) await store(cache, request, response);
    return response;
  } catch (err) {
    if (cached) return cached;
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(request));
});

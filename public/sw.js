const CACHE_PREFIX = "alamo-static-";
const CACHE_NAME = `${CACHE_PREFIX}v1`;
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/brand/alamo-ah-mark.svg",
  "/pwa/alamo-favicon-32-v1.png",
  "/pwa/alamo-apple-touch-icon-180-v1.png",
  "/pwa/alamo-app-icon-192-v1.png",
  "/pwa/alamo-app-icon-512-v1.png",
  "/pwa/alamo-app-icon-1024-v1.png",
  "/pwa/alamo-app-icon-maskable-512-v1.png",
  "/pwa/alamo-app-icon-maskable-1024-v1.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(pruneOldAlamoCaches().then(() => self.clients.claim()));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "ALAMO_PRUNE_DESKTOP_CACHES") {
    event.waitUntil(pruneOldAlamoCaches());
    return;
  }
  if (event.data?.type !== "ALAMO_DISABLE_DESKTOP_CACHE") return;
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(
        names.filter((name) => name.startsWith(CACHE_PREFIX)).map((name) => caches.delete(name))
      ))
      .then(() => self.registration.unregister())
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Authenticated pages and APIs remain network-only and are never persisted.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return await cache.match(OFFLINE_URL) ?? new Response("A connection is required.", {
        status: 503,
        headers: { "Content-Type": "text/plain; charset=utf-8" }
      });
    }));
    return;
  }

  if (!url.search && (STATIC_ASSETS.includes(url.pathname) || url.pathname.startsWith("/assets/"))) {
    event.respondWith(cacheStaticAsset(request));
  }
});

async function cacheStaticAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok && response.type === "basic" && !response.headers.has("set-cookie")) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function pruneOldAlamoCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name))
  );
}

const CACHE_PREFIX = "alamo-static-";
const CACHE_NAME = `${CACHE_PREFIX}v8`;
const OFFLINE_URL = "/offline.html";
const STATIC_ASSETS = [
  OFFLINE_URL,
  "/brand/alamo-health-management-logo.png",
  "/brand/alamo-head-tree-mark.png",
  "/pwa/alamo-favicon-32-v2.png",
  "/pwa/alamo-apple-touch-icon-180-v2.png",
  "/pwa/alamo-app-icon-192-v2.png",
  "/pwa/alamo-app-icon-512-v2.png",
  "/pwa/alamo-app-icon-1024-v2.png",
  "/pwa/alamo-app-icon-maskable-512-v2.png",
  "/pwa/alamo-app-icon-maskable-1024-v2.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateLatestRelease());
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
    // Do not let an installed app or a long-lived browser tab reuse an older
    // HTML shell after a deployment. Hashed static assets remain cacheable,
    // but every navigation must discover the current bundle entry point.
    const networkRequest = new Request(request, { cache: "no-store" });
    event.respondWith(fetch(networkRequest).catch(async () => {
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

async function activateLatestRelease() {
  const cacheNames = await caches.keys();
  const replacesOlderRelease = cacheNames.some(
    (name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME
  );
  await pruneOldAlamoCaches();
  await self.clients.claim();
  if (!replacesOlderRelease) return;

  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  await Promise.all(windows.map(async (client) => {
    try {
      await client.navigate(client.url);
    } catch {
      // A closed or cross-process window must not block worker activation.
    }
  }));
}

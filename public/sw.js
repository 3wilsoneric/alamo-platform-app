const CACHE_PREFIX = "alamo-static-";

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(retireLegacyWorker());
});

self.addEventListener("message", (event) => {
  if (!event.data?.type?.startsWith("ALAMO_")) return;
  event.waitUntil(retireLegacyWorker());
});

async function deleteLegacyAlamoCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.startsWith(CACHE_PREFIX))
      .map((name) => caches.delete(name))
  );
}

async function retireLegacyWorker() {
  await deleteLegacyAlamoCaches();
  await self.clients.claim();
  await self.registration.unregister();

  const windows = await self.clients.matchAll({
    type: "window",
    includeUncontrolled: true
  });
  await Promise.all(windows.map(async (client) => {
    try {
      const destination = new URL(client.url);
      destination.searchParams.set("alamo-current-release", String(Date.now()));
      await client.navigate(destination.toString());
    } catch {
      // A closed window must not block retirement for the remaining clients.
    }
  }));
}

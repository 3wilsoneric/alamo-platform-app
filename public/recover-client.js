(async function recoverAlamoClient() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name.startsWith("alamo-static-"))
          .map((name) => caches.delete(name))
      );
    }
  } finally {
    const dashboardUrl = new URL("/executive/dashboard", window.location.origin);
    dashboardUrl.searchParams.set("alamo-recovered", String(Date.now()));
    window.location.replace(dashboardUrl.toString());
  }
})();

(async function recoverAlamoClient() {
  const releaseToken = String(Date.now());

  try {
    const releaseUrl = new URL("/", window.location.origin);
    releaseUrl.searchParams.set("alamo-recovery-release", releaseToken);
    const releaseResponse = await fetch(releaseUrl, {
      cache: "no-store",
      credentials: "omit",
      headers: { "cache-control": "no-cache" }
    });
    if (!releaseResponse.ok) throw new Error("Current release shell is unavailable.");

    const releaseDocument = new DOMParser().parseFromString(
      await releaseResponse.text(),
      "text/html"
    );
    const releaseScript = releaseDocument.querySelector(
      'script[type="module"][src^="/assets/"]'
    )?.getAttribute("src");
    if (!releaseScript) throw new Error("Current release entry point is unavailable.");

    const releaseStyles = Array.from(
      releaseDocument.querySelectorAll('link[rel="stylesheet"][href^="/assets/"]')
    ).map((link) => link.getAttribute("href")).filter(Boolean);

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

    for (const stylesheetPath of releaseStyles) {
      const stylesheetUrl = new URL(stylesheetPath, window.location.origin);
      stylesheetUrl.searchParams.set("alamo-recovered", releaseToken);
      const stylesheet = document.createElement("link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = stylesheetUrl.toString();
      document.head.append(stylesheet);
    }

    const dashboardUrl = new URL("/executive/dashboard", window.location.origin);
    dashboardUrl.searchParams.set("alamo-recovered", releaseToken);
    window.history.replaceState({}, "", dashboardUrl);
    document.body.innerHTML = '<div id="root"></div>';

    const releaseScriptUrl = new URL(releaseScript, window.location.origin);
    releaseScriptUrl.searchParams.set("alamo-recovered", releaseToken);
    await import(releaseScriptUrl.toString());
  } catch {
    const fallbackUrl = new URL("/executive/dashboard", window.location.origin);
    fallbackUrl.searchParams.set("alamo-recovered", releaseToken);
    window.location.replace(fallbackUrl.toString());
  }
})();

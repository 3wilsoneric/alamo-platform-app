import { useEffect } from "react";

const RELEASE_CHECK_INTERVAL_MS = 60_000;
const LEGACY_CACHE_PREFIX = "alamo-static-";

function getBundlePath(documentValue: Document) {
  const script = documentValue.querySelector<HTMLScriptElement>(
    'script[type="module"][src^="/assets/"]'
  );
  if (!script?.src) return null;

  try {
    return new URL(script.src, window.location.origin).pathname;
  } catch {
    return null;
  }
}

async function getPublishedBundlePath(signal: AbortSignal) {
  const releaseUrl = new URL("/", window.location.origin);
  releaseUrl.searchParams.set("alamo-release-check", String(Date.now()));

  const response = await fetch(releaseUrl, {
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "cache-control": "no-cache"
    },
    signal
  });
  if (!response.ok) return null;

  const documentValue = new DOMParser().parseFromString(await response.text(), "text/html");
  return getBundlePath(documentValue);
}

export function DesktopRuntime() {
  useEffect(() => {
    if (!window.isSecureContext && window.location.hostname !== "localhost") return;

    let cancelled = false;
    let releaseCheckInFlight = false;
    let reloadRequested = false;
    const controller = new AbortController();

    const requestReload = () => {
      if (cancelled || reloadRequested) return;
      reloadRequested = true;
      window.location.reload();
    };

    const checkForCurrentRelease = async () => {
      if (cancelled || releaseCheckInFlight || document.visibilityState === "hidden") return;

      const currentBundlePath = getBundlePath(document);
      if (!currentBundlePath) return;

      releaseCheckInFlight = true;
      try {
        const publishedBundlePath = await getPublishedBundlePath(controller.signal);
        if (publishedBundlePath && publishedBundlePath !== currentBundlePath) {
          requestReload();
        }
      } catch {
        // A release check must never interrupt the current working session.
      } finally {
        releaseCheckInFlight = false;
      }
    };

    const checkVisibleRelease = () => {
      if (document.visibilityState === "visible") void checkForCurrentRelease();
    };

    const retireLegacyDesktopCache = async () => {
      try {
        if ("serviceWorker" in navigator) {
          const registrations = await navigator.serviceWorker.getRegistrations();
          await Promise.all(registrations.map((registration) => registration.unregister()));
        }
        if ("caches" in window) {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames
              .filter((name) => name.startsWith(LEGACY_CACHE_PREFIX))
              .map((name) => caches.delete(name))
          );
        }
      } catch {
        // Legacy install cleanup must never block the web application.
      }

      await checkForCurrentRelease();
    };

    const releaseCheckInterval = window.setInterval(
      () => void checkForCurrentRelease(),
      RELEASE_CHECK_INTERVAL_MS
    );
    document.addEventListener("visibilitychange", checkVisibleRelease);
    window.addEventListener("focus", checkVisibleRelease);
    window.addEventListener("online", checkVisibleRelease);
    void retireLegacyDesktopCache();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(releaseCheckInterval);
      document.removeEventListener("visibilitychange", checkVisibleRelease);
      window.removeEventListener("focus", checkVisibleRelease);
      window.removeEventListener("online", checkVisibleRelease);
    };
  }, []);

  return null;
}

import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";
const RELEASE_CHECK_INTERVAL_MS = 60_000;

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

    const supportsServiceWorker = "serviceWorker" in navigator;
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

    const register = async () => {
      if (!supportsServiceWorker) {
        await checkForCurrentRelease();
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
          scope: SERVICE_WORKER_SCOPE,
          updateViaCache: "none"
        });
        if (cancelled) return;

        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({ type: "ALAMO_PRUNE_DESKTOP_CACHES" });
        await registration.update();
        await checkForCurrentRelease();
      } catch {
        // Desktop installation support must never block the web application.
      }
    };

    const releaseCheckInterval = window.setInterval(
      () => void checkForCurrentRelease(),
      RELEASE_CHECK_INTERVAL_MS
    );
    document.addEventListener("visibilitychange", checkVisibleRelease);
    window.addEventListener("focus", checkVisibleRelease);
    window.addEventListener("online", checkVisibleRelease);
    if (supportsServiceWorker) {
      navigator.serviceWorker.addEventListener("controllerchange", requestReload);
    }

    void register();
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(releaseCheckInterval);
      document.removeEventListener("visibilitychange", checkVisibleRelease);
      window.removeEventListener("focus", checkVisibleRelease);
      window.removeEventListener("online", checkVisibleRelease);
      if (supportsServiceWorker) {
        navigator.serviceWorker.removeEventListener("controllerchange", requestReload);
      }
    };
  }, []);

  return null;
}

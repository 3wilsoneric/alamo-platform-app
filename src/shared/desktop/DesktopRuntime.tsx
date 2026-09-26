import { useEffect } from "react";

const SERVICE_WORKER_PATH = "/sw.js";
const SERVICE_WORKER_SCOPE = "/";

export function DesktopRuntime() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!window.isSecureContext && window.location.hostname !== "localhost") return;

    let cancelled = false;
    const register = async () => {
      try {
        const registration = await navigator.serviceWorker.register(SERVICE_WORKER_PATH, {
          scope: SERVICE_WORKER_SCOPE,
          updateViaCache: "none"
        });
        if (cancelled) return;

        const ready = await navigator.serviceWorker.ready;
        ready.active?.postMessage({ type: "ALAMO_PRUNE_DESKTOP_CACHES" });
        await registration.update();
      } catch {
        // Desktop installation support must never block the web application.
      }
    };

    void register();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

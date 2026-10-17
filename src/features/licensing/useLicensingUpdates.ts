import { useEffect, useState } from "react";
import type { LicensingUpdates } from "../../../shared/licensing-contracts.mjs";
import { fetchLicensingUpdates } from "./licensingApi";

export function useLicensingUpdates() {
  const [feed, setFeed] = useState<LicensingUpdates | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { void fetchLicensingUpdates(controller.signal).then(data => {
      if (!controller.signal.aborted) { setFeed(data); setFailed(false); }
    }).catch(() => { if (!controller.signal.aborted) setFailed(true); }); };
    refresh(); const timer = globalThis.setInterval(refresh, 60_000);
    return () => { controller.abort(); globalThis.clearInterval(timer); };
  }, []);
  return { feed, failed };
}

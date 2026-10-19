import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { getApiAuthCachePartition } from "../../shared/api/authenticatedFetch";
import { readPresentationApi } from "./presentationApi";

// The server validates the exact account; client claims never grant access.
export function usePresentationAccess() {
  useMsal();
  const accountKey = getApiAuthCachePartition();
  const [result, setResult] = useState<{ accountKey: string; allowed: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setResult(null);
    readPresentationApi<{ allowed: boolean }>("/access", controller.signal)
      .then((response) => { if (!controller.signal.aborted) setResult({ accountKey, allowed: response.allowed }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ accountKey, allowed: false }); });
    return () => controller.abort();
  }, [accountKey]);
  return { allowed: result?.accountKey === accountKey && result.allowed, pending: result?.accountKey !== accountKey };
}

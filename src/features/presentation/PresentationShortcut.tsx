import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import { Presentation } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getApiAuthCachePartition } from "../../shared/api/authenticatedFetch";
import { readPresentationApi } from "./presentationApi";

export default function PresentationShortcut() {
  useMsal();
  const accountKey = getApiAuthCachePartition();
  const [allowedAccount, setAllowedAccount] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => {
    const controller = new AbortController();
    setAllowedAccount(null);
    readPresentationApi<{ allowed: boolean }>("/access", controller.signal)
      .then((result) => { if (!controller.signal.aborted && result.allowed) setAllowedAccount(accountKey); })
      .catch(() => { /* Permission failures keep the shortcut hidden. */ });
    return () => controller.abort();
  }, [accountKey]);
  if (allowedAccount !== accountKey) return null;
  return (
    <button type="button" aria-label="Open presentation" title="Presentation"
      className="ml-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded border border-[#dce5e0] text-[#315b54] hover:bg-[#eef5f1]"
      onClick={() => {
        if (document.documentElement.requestFullscreen) void document.documentElement.requestFullscreen().catch(() => {});
        navigate("/presentation", { state: { returnTo: `${location.pathname}${location.search}${location.hash}` } });
      }}>
      <Presentation size={20} aria-hidden="true" />
    </button>
  );
}

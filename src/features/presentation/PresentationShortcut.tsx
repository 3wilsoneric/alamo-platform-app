import { Presentation } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { usePresentationAccess } from "./usePresentationAccess";

export default function PresentationShortcut() {
  const { allowed } = usePresentationAccess();
  const location = useLocation();
  const navigate = useNavigate();
  if (!allowed) return null;
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

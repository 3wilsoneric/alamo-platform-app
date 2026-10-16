import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AnalyticsSectionNavigation from "../../california/components/AnalyticsSectionNavigation";
import LicensingWorkspace from "../../licensing/pages/LicensingPage";
import { useLicensingAccess } from "../../../shared/auth/licensingAccess";
import EveryAgentWorkspace from "../components/EveryAgentWorkspace";
import { getApiAuthCachePartition } from "../../../shared/api/authenticatedFetch";

export default function AgentPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const canUseLicensingSkill = useLicensingAccess();
  // Licensing is the first connected skill; keep its existing access boundary.
  if (!canUseLicensingSkill) return <Navigate to="/analytics" replace />;
  return <>
    <AnalyticsSectionNavigation active="agent" onNavigate={section => navigate(section === "reports" ? "/analytics" : `/analytics/${section}`)} />
    {["skill", "report", "question", "q", "community"].some(key => params.has(key)) ? <>
      <Link to="/analytics/agent" className="mx-auto block min-h-11 w-full max-w-[1100px] px-4 pt-4 text-sm text-[#087d64] sm:px-6">← EveryAgent work</Link>
      <LicensingWorkspace />
    </> : <EveryAgentWorkspace key={getApiAuthCachePartition()} />}
  </>;
}

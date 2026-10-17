import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import AnalyticsSectionNavigation from "../../california/components/AnalyticsSectionNavigation";
import LicensingWorkspace from "../../licensing/pages/LicensingPage";
import { useEveryAgentAccess } from "../../../shared/auth/everyAgentAccess";
import EveryAgentWorkspace from "../components/EveryAgentWorkspace";
import { getApiAuthCachePartition } from "../../../shared/api/authenticatedFetch";
import EmbeddedAgentChats from "../conversations/EmbeddedAgentChats";
import { agentChatConfigured } from "../conversations/agentTransport";

export default function AgentPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const canUseEveryAgent = useEveryAgentAccess();
  if (!canUseEveryAgent) return <Navigate to="/analytics" replace />;
  if (params.has("chat") && agentChatConfigured) return <EmbeddedAgentChats />;
  return <>
    <AnalyticsSectionNavigation active="agent" onNavigate={section => navigate(section === "reports" ? "/analytics" : `/analytics/${section}`)} />
    {["skill", "report", "question", "q", "community"].some(key => params.has(key)) ? <>
      <Link to="/analytics/agent" className="mx-auto block min-h-11 w-full max-w-[1100px] px-4 pt-4 text-sm text-[#087d64] sm:px-6">← Updates</Link>
      <LicensingWorkspace agentMode />
    </> : <EveryAgentWorkspace key={getApiAuthCachePartition()} />}
  </>;
}

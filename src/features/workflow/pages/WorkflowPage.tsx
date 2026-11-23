import { useEffect, useMemo } from "react";
import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { Navigate, useLocation } from "react-router-dom";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { AuthenticationProgress } from "../../../app/auth/AuthenticationProgress";
import { usePlatformOwnerAccess } from "../../../shared/auth/platformOwnerAccess";
import { workflowPage } from "../legacy/src/lib/workflow-navigation";
import WorkflowAppView from "../legacy/src/components/views/WorkflowAppView";
import { ExecutionTransportContext } from "../legacy/src/components/learning/ExecutionTransport";
import { createAgentTransport, agentChatConfigured, localAgentPreview } from "../../agent/conversations/agentTransport";

export default function WorkflowPage() {
  const location = useLocation();
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "ProForma | Alamo Platform";
    return () => { document.title = previousTitle; };
  }, []);
  const isOwner = usePlatformOwnerAccess();
  const isAuthenticated = useIsAuthenticated();
  const { accounts, inProgress, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;
  const execution = useMemo(() => {
    if (!agentChatConfigured && !localAgentPreview) return async <T,>(): Promise<T> => { throw new Error("No Ally execution connection is configured in this environment."); };
    const transport = createAgentTransport(instance);
    return Object.assign(transport.process, { connect: transport.connect });
  }, [instance, account?.homeAccountId]);

  if (
    !isE2EAuthBypassEnabled &&
    (!isAuthenticated || inProgress !== InteractionStatus.None || !account?.idTokenClaims)
  ) {
    return <AuthenticationProgress label="Opening ProForma" detail="Verifying preview access..." />;
  }

  if (!isE2EAuthBypassEnabled && !isOwner) {
    return <Navigate to="/home" replace />;
  }

  const params = new URLSearchParams(location.search);
  const view = params.get("view");
  const initialPage = params.has("document") ? "documents" : workflowPage(view);
  return <ExecutionTransportContext.Provider value={execution}><WorkflowAppView key={`${account?.homeAccountId ?? 'local'}:${location.search}`} initialPage={initialPage} /></ExecutionTransportContext.Provider>;
}

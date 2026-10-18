import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { Navigate, useLocation } from "react-router-dom";
import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { AuthenticationProgress } from "../../../app/auth/AuthenticationProgress";
import { usePlatformOwnerAccess } from "../../../shared/auth/platformOwnerAccess";
import WorkflowAppView from "../legacy/src/components/views/WorkflowAppView";

export default function WorkflowPage() {
  const location = useLocation();
  const isOwner = usePlatformOwnerAccess();
  const isAuthenticated = useIsAuthenticated();
  const { accounts, inProgress, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;

  if (
    !isE2EAuthBypassEnabled &&
    (!isAuthenticated || inProgress !== InteractionStatus.None || !account?.idTokenClaims)
  ) {
    return <AuthenticationProgress label="Opening Workflow" detail="Verifying preview access..." />;
  }

  if (!isE2EAuthBypassEnabled && !isOwner) {
    return <Navigate to="/home" replace />;
  }

  const params = new URLSearchParams(location.search);
  const initialPage = params.has("document") ? "documents" : params.get("view") === "organization" ? "organization" : "dashboard";
  return <WorkflowAppView key={location.search} initialPage={initialPage} />;
}

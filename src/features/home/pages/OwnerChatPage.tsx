import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { Navigate } from "react-router-dom";

import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { AuthenticationProgress } from "../../../app/auth/AuthenticationProgress";
import { usePlatformOwnerAccess } from "../../../shared/auth/platformOwnerAccess";
import WorkspaceHomePage from "./WorkspaceHomePage";

/**
 * Quiet owner-only entry to the governed analyst workspace.
 *
 * The page is intentionally absent from Platform navigation. The verified
 * Platform owner claim remains the access boundary; knowing `/chat` is not.
 */
export default function OwnerChatPage() {
  const isOwner = usePlatformOwnerAccess();
  const isAuthenticated = useIsAuthenticated();
  const { accounts, inProgress, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0] ?? null;
  const ownerClaimReady = Boolean(account?.idTokenClaims);

  // On a cold deep link MSAL can report an authenticated session one render
  // before the account claims are hydrated. Do not treat that transient state
  // as an access denial; it previously bounced the owner back to /home before
  // the exact same claim used by the owner-only navigation became available.
  if (
    !isE2EAuthBypassEnabled &&
    (!isAuthenticated || inProgress !== InteractionStatus.None || !ownerClaimReady)
  ) {
    return (
      <AuthenticationProgress
        label="Opening Alamo Analyst"
        detail="Verifying owner access..."
      />
    );
  }

  if (!isE2EAuthBypassEnabled && !isOwner) {
    return <Navigate to="/home" replace />;
  }

  return (
    <div
      data-owner-chat-route="true"
      className="min-h-[calc(100dvh-var(--platform-header-height))] bg-white"
    >
      <h1 className="sr-only">Alamo Analyst</h1>
      <WorkspaceHomePage sectionId="chat" initialQuestionsOpen conversational />
    </div>
  );
}

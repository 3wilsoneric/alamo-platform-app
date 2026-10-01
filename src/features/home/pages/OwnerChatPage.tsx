import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { AuthenticationProgress } from "../../../app/auth/AuthenticationProgress";
import { usePlatformOwnerAccessState } from "../../../shared/auth/platformOwnerAccess";
import WorkspaceHomePage from "./WorkspaceHomePage";

/**
 * Quiet owner-only entry to the governed analyst workspace.
 *
 * The page is intentionally absent from Platform navigation. The verified
 * Platform owner claim remains the access boundary; knowing `/chat` is not.
 */
export default function OwnerChatPage() {
  const ownerAccess = usePlatformOwnerAccessState();
  const [denialConfirmed, setDenialConfirmed] = useState(false);

  useEffect(() => {
    if (isE2EAuthBypassEnabled || ownerAccess !== "denied") {
      setDenialConfirmed(false);
      return;
    }

    // A full deep link can briefly expose the previously cached account while
    // MSAL promotes the redirect account to active. Give that handoff one short
    // claim-settling window, without rendering any owner content in the meantime.
    const timeoutId = window.setTimeout(() => setDenialConfirmed(true), 750);
    return () => window.clearTimeout(timeoutId);
  }, [ownerAccess]);

  if (
    !isE2EAuthBypassEnabled &&
    (ownerAccess === "pending" || (ownerAccess === "denied" && !denialConfirmed))
  ) {
    return (
      <AuthenticationProgress
        label="Opening Alamo Analyst"
        detail="Verifying owner access..."
      />
    );
  }

  if (!isE2EAuthBypassEnabled && ownerAccess === "denied") {
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

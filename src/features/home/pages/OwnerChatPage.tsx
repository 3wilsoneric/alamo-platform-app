import { Navigate } from "react-router-dom";

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

  if (!isE2EAuthBypassEnabled && ownerAccess === "pending") {
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

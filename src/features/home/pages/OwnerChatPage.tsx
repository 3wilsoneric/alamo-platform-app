import { Navigate } from "react-router-dom";
import { useEffect, useState } from "react";

import { isE2EAuthBypassEnabled } from "../../../app/auth/authConfig";
import { AuthenticationProgress } from "../../../app/auth/AuthenticationProgress";
import { fetchWithApiAuth } from "../../../shared/api/authenticatedFetch";
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
  const [access, setAccess] = useState<"checking" | "allowed" | "denied">(
    isE2EAuthBypassEnabled || isOwner ? "allowed" : "checking"
  );

  useEffect(() => {
    if (isE2EAuthBypassEnabled || isOwner) {
      setAccess("allowed");
      return;
    }

    const controller = new AbortController();
    void fetchWithApiAuth(
      "/api/platform/knowledge",
      { method: "GET", signal: controller.signal },
      {
        timeoutMs: 10_000,
        consume: async (response) => response.ok
      }
    )
      .then((allowed) => setAccess(allowed ? "allowed" : "denied"))
      .catch((error) => {
        if (!controller.signal.aborted) {
          console.warn("Owner access verification was unavailable.", error);
          setAccess("denied");
        }
      });
    return () => controller.abort();
  }, [isOwner]);

  if (!isE2EAuthBypassEnabled && access === "checking") {
    return (
      <AuthenticationProgress
        label="Opening Alamo Analyst"
        detail="Verifying owner access..."
      />
    );
  }

  if (!isE2EAuthBypassEnabled && access === "denied") {
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

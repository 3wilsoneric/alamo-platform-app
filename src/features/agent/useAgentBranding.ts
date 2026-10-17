import { useMsal } from "@azure/msal-react";
import { agentBrandingFor } from "../../../shared/agent-branding.mjs";

export function useAgentBranding() {
  const { accounts, instance } = useMsal();
  return agentBrandingFor((instance.getActiveAccount() ?? accounts[0])?.idTokenClaims);
}

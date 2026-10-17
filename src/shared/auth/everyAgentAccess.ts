import { useMsal } from "@azure/msal-react";
import { everyAgentSkillsFor } from "../../../shared/everyagent-catalog.mjs";
import { isE2EAuthBypassEnabled } from "../../app/auth/authConfig";

export function useEveryAgentAccess() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  return isE2EAuthBypassEnabled || everyAgentSkillsFor(account?.idTokenClaims).length > 0;
}

import { InteractionStatus } from "@azure/msal-browser";
import { useMsal } from "@azure/msal-react";
import { hasPlatformOwnerAccess } from "../../../shared/platform-owner-access.mjs";

export function usePlatformOwnerAccess() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  return hasPlatformOwnerAccess(account?.idTokenClaims);
}

export function usePlatformOwnerAccessState(): "pending" | "allowed" | "denied" {
  const { accounts, inProgress, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];

  if (inProgress !== InteractionStatus.None || !account?.idTokenClaims) {
    return "pending";
  }

  return hasPlatformOwnerAccess(account.idTokenClaims) ? "allowed" : "denied";
}

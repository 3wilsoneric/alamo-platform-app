import { useMsal } from "@azure/msal-react";
import { hasPlatformOwnerAccess } from "../../../shared/platform-owner-access.mjs";

export function usePlatformOwnerAccess() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  return hasPlatformOwnerAccess(account?.idTokenClaims);
}

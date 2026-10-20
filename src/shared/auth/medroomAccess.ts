import { useMsal } from "@azure/msal-react";
import { hasMedroomAccess } from "../../../shared/medroom-access.mjs";
import { isE2EAuthBypassEnabled } from "../../app/auth/authConfig";

export function useMedroomAccess() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  return hasMedroomAccess(account?.idTokenClaims) || (import.meta.env.DEV && isE2EAuthBypassEnabled);
}

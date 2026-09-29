import { useMsal } from "@azure/msal-react";
import { hasLicensingAccess } from "../../../shared/licensing-access.mjs";

export function useLicensingAccess() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  return hasLicensingAccess(account?.idTokenClaims);
}

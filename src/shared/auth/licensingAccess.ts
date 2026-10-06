import { useMsal } from "@azure/msal-react";
import { hasLicensingAccess } from "../../../shared/licensing-access.mjs";
import { isE2EAuthBypassEnabled } from "../../app/auth/authConfig";

export function useLicensingAccess() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  return isE2EAuthBypassEnabled || hasLicensingAccess(account?.idTokenClaims);
}

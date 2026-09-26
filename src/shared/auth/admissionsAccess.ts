import type { AccountInfo } from "@azure/msal-browser";
import {
  ALAMO_ADMISSIONS_ROLES,
  getAdmissionsAccess,
  normalizeIdentityRoles,
  type AdmissionsAccess
} from "../../../shared/admissions-access.mjs";

export function getAccountIdentityRoles(account?: AccountInfo | null) {
  return normalizeIdentityRoles(account?.idTokenClaims?.roles);
}

export function getAccountAdmissionsAccess(
  account?: AccountInfo | null,
  e2eBypass = false
): AdmissionsAccess {
  return getAdmissionsAccess(
    e2eBypass
      ? [ALAMO_ADMISSIONS_ROLES.supervisor]
      : getAccountIdentityRoles(account)
  );
}

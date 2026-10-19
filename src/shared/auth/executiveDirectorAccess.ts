import type { AccountInfo } from "@azure/msal-browser";
import {
  getExecutiveDirectorAccess,
  type ExecutiveDirectorAccess
} from "../../../shared/executive-director-access.mjs";
import { getAccountIdentityRoles } from "./admissionsAccess";

const E2E_PREVIEW_FACILITY_ID = "337";

export function getAccountExecutiveDirectorAccess(
  account?: AccountInfo | null,
  e2eBypass = false
): ExecutiveDirectorAccess {
  if (e2eBypass) {
    return {
      allowed: true,
      restrictedToExecutive: false,
      facilityIds: [E2E_PREVIEW_FACILITY_ID],
      primaryFacilityId: E2E_PREVIEW_FACILITY_ID
    };
  }

  return getExecutiveDirectorAccess(getAccountIdentityRoles(account));
}

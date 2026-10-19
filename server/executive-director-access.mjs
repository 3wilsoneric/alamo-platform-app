import { createHttpError } from "./http-errors.mjs";
import { hasPlatformOwnerAccess } from "../shared/platform-owner-access.mjs";
import { getExecutiveDirectorAccess } from "../shared/executive-director-access.mjs";
import { ALAMO_FACILITIES } from "../shared/community-names.mjs";

const DEVELOPMENT_FACILITY_ID = "337";
const KNOWN_FACILITY_IDS = new Set(ALAMO_FACILITIES.map((facility) => facility.facilityId));

export function assertExecutiveDirectorAccess(authContext) {
  if (!authContext?.authenticated) {
    return {
      owner: true,
      facilityIds: [DEVELOPMENT_FACILITY_ID],
      primaryFacilityId: DEVELOPMENT_FACILITY_ID
    };
  }

  const claims = authContext.claims ?? {};
  const owner = hasPlatformOwnerAccess(claims);
  const roleAccess = getExecutiveDirectorAccess(claims.roles);
  if (!owner && !roleAccess.allowed) {
    throw createHttpError(
      403,
      "executive_director_access_denied",
      "Your account is not assigned to an Executive Director workspace."
    );
  }

  return {
    owner,
    facilityIds: roleAccess.facilityIds,
    primaryFacilityId: roleAccess.primaryFacilityId
  };
}

export function resolveExecutiveDirectorFacility(access, requestedFacilityId) {
  const requested = String(requestedFacilityId ?? "").trim();
  if (requested && !KNOWN_FACILITY_IDS.has(requested)) {
    throw createHttpError(400, "executive_director_facility_invalid", "Choose a listed Alamo community.");
  }
  if (access.owner) {
    return requested || access.primaryFacilityId || DEVELOPMENT_FACILITY_ID;
  }
  if (!requested) return access.primaryFacilityId;
  if (!access.facilityIds.includes(requested)) {
    throw createHttpError(
      403,
      "executive_director_facility_denied",
      "This community is outside your Executive Director assignment."
    );
  }
  return requested;
}

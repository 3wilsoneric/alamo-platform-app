import { ALAMO_FACILITIES } from "./community-names.mjs";
import { normalizeIdentityRoles } from "./admissions-access.mjs";

export const ALAMO_EXECUTIVE_DIRECTOR_ROLES = Object.freeze({
  "337": "Alamo.ExecutiveDirector.SanPablo",
  "342": "Alamo.ExecutiveDirector.VictoriasHouse",
  "343": "Alamo.ExecutiveDirector.JCWallace",
  "344": "Alamo.ExecutiveDirector.Turlock",
  "345": "Alamo.ExecutiveDirector.SantaClarita"
});

const KNOWN_FACILITY_IDS = new Set(ALAMO_FACILITIES.map((facility) => facility.facilityId));

export function getExecutiveDirectorAccess(roles) {
  const roleSet = new Set(normalizeIdentityRoles(roles));
  const facilityIds = Object.entries(ALAMO_EXECUTIVE_DIRECTOR_ROLES)
    .filter(([facilityId, role]) => KNOWN_FACILITY_IDS.has(facilityId) && roleSet.has(role))
    .map(([facilityId]) => facilityId);

  return {
    allowed: facilityIds.length > 0,
    restrictedToExecutive: facilityIds.length > 0,
    facilityIds,
    primaryFacilityId: facilityIds[0] ?? null
  };
}

export function isExecutiveDirectorPath(pathname) {
  const normalized = String(pathname ?? "").trim();
  return normalized === "/executive" || normalized.startsWith("/executive/");
}

export interface ExecutiveDirectorAccess {
  allowed: boolean;
  restrictedToExecutive: boolean;
  facilityIds: string[];
  primaryFacilityId: string | null;
}

export const ALAMO_EXECUTIVE_DIRECTOR_ROLES: Readonly<Record<string, string>>;
export function getExecutiveDirectorAccess(roles: unknown): ExecutiveDirectorAccess;
export function isExecutiveDirectorPath(pathname: unknown): boolean;

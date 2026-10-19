export type AdmissionsAccessLevel = "assessor" | "supervisor" | "admin";

export interface AdmissionsAccess {
  allowed: boolean;
  level: AdmissionsAccessLevel | null;
  restrictedToAdmissions: boolean;
}

export const ALAMO_ADMISSIONS_ROLES: Readonly<{
  assessor: "Alamo.Admissions.Assessor";
  supervisor: "Alamo.Admissions.Supervisor";
  admin: "Alamo.Admissions.Admin";
}>;

export function normalizeIdentityRoles(roles: unknown): string[];
export function getAdmissionsAccess(roles: unknown): AdmissionsAccess;
export function isAdmissionsPath(pathname: unknown): boolean;

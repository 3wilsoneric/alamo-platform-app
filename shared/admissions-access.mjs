export const ALAMO_ADMISSIONS_ROLES = Object.freeze({
  assessor: "Alamo.Admissions.Assessor",
  supervisor: "Alamo.Admissions.Supervisor",
  admin: "Alamo.Admissions.Admin"
});

export function normalizeIdentityRoles(roles) {
  const values = Array.isArray(roles)
    ? roles
    : String(roles ?? "").split(/[\s,]+/);

  return [...new Set(values.map((role) => String(role).trim()).filter(Boolean))];
}

export function getAdmissionsAccess(roles) {
  const roleSet = new Set(normalizeIdentityRoles(roles));
  const isAdmin = roleSet.has(ALAMO_ADMISSIONS_ROLES.admin);
  const isSupervisor = roleSet.has(ALAMO_ADMISSIONS_ROLES.supervisor);
  const isAssessor = roleSet.has(ALAMO_ADMISSIONS_ROLES.assessor);

  const level = isAdmin
    ? "admin"
    : isSupervisor
      ? "supervisor"
      : isAssessor
        ? "assessor"
        : null;

  return {
    allowed: level !== null,
    level,
    restrictedToAdmissions: level === "assessor"
  };
}

export function isAdmissionsPath(pathname) {
  const normalized = String(pathname ?? "").trim();
  return normalized === "/admissions" || normalized.startsWith("/admissions/");
}

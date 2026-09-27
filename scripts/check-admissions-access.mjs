#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  ALAMO_ADMISSIONS_ROLES,
  getAdmissionsAccess,
  isAdmissionsPath,
  normalizeIdentityRoles
} from "../shared/admissions-access.mjs";
import { assertApiClaimsWorkspaceAccess } from "../server/api-auth.mjs";

assert.deepEqual(normalizeIdentityRoles("role.a, role.b role.a"), ["role.a", "role.b"]);
assert.deepEqual(getAdmissionsAccess([]), {
  allowed: false,
  level: null,
  restrictedToAdmissions: false
});
assert.deepEqual(getAdmissionsAccess([ALAMO_ADMISSIONS_ROLES.assessor]), {
  allowed: true,
  level: "assessor",
  restrictedToAdmissions: true
});
assert.deepEqual(
  getAdmissionsAccess([
    ALAMO_ADMISSIONS_ROLES.assessor,
    ALAMO_ADMISSIONS_ROLES.supervisor
  ]),
  {
    allowed: true,
    level: "supervisor",
    restrictedToAdmissions: false
  }
);
assert.equal(getAdmissionsAccess([ALAMO_ADMISSIONS_ROLES.admin]).level, "admin");
assert.equal(getAdmissionsAccess(["Pipeline.Clinical.Read.All"]).allowed, false);
assert.equal(getAdmissionsAccess(["Pipeline.Clinical.Read.All"]).restrictedToAdmissions, false);
assert.equal(isAdmissionsPath("/admissions"), true);
assert.equal(isAdmissionsPath("/admissions/referrals"), true);
assert.equal(isAdmissionsPath("/analytics"), false);

assert.throws(
  () => assertApiClaimsWorkspaceAccess({ roles: [ALAMO_ADMISSIONS_ROLES.assessor] }),
  (error) => error?.statusCode === 403 && error?.code === "api_admissions_only"
);
assert.doesNotThrow(() =>
  assertApiClaimsWorkspaceAccess({ roles: [ALAMO_ADMISSIONS_ROLES.supervisor] })
);
assert.doesNotThrow(() =>
  assertApiClaimsWorkspaceAccess({ roles: ["Pipeline.Clinical.Read.All"] })
);

const root = path.resolve(import.meta.dirname, "..");
const [app, shell, admissionsPage, admissionsBoard, californiaHome, platformNavigation, apiAuth, vercelSource] = await Promise.all([
  readFile(path.join(root, "src/app/App.tsx"), "utf8"),
  readFile(path.join(root, "src/shared/layout/ProtectedAppShell.tsx"), "utf8"),
  readFile(path.join(root, "src/features/admissions/pages/AdmissionsPage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/admissions/components/PipelineBoard.tsx"), "utf8"),
  readFile(path.join(root, "src/features/california/pages/CaliforniaHomePage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/california/components/PlatformPageNavigation.tsx"), "utf8"),
  readFile(path.join(root, "server/api-auth.mjs"), "utf8"),
  readFile(path.join(root, "vercel.json"), "utf8")
]);

if (
  !app.includes('path="/admissions" element={withRouteBoundary(<AdmissionsPage />)}') ||
  !app.includes('path="/pipeline" element={<Navigate to="/admissions" replace />}')
) {
  throw new Error("The Alamo application must register the native Admissions overview and retain a local Pipeline handoff fallback.");
}
if (
  !shell.includes("admissionsAccess.restrictedToAdmissions") ||
  !shell.includes("window.location.replace(\"/admissions\")") ||
  !shell.includes("isAdmissionsExperience") ||
  !shell.includes("skipWorkspacePreparation")
) {
  throw new Error("Admissions identities must enter the overview without unrelated workspace preloading.");
}
if (
  !admissionsPage.includes("fetchAdmissionsDashboard") ||
  !admissionsPage.includes("referral_pipeline") ||
  !admissionsPage.includes('data-admissions-overview="true"') ||
  admissionsPage.includes('data-open-full-pipeline="true"') ||
  admissionsPage.includes("https://alamo-pipeline.com") ||
  admissionsPage.includes("iframe") ||
  !admissionsBoard.includes('data-admissions-progress-modal="true"') ||
  admissionsBoard.includes("href={card.pipelineUrl}") ||
  admissionsBoard.includes("https://alamo-pipeline.com")
) {
  throw new Error("Admissions overview must use governed Alamo data and keep client progress review inside its analyst modal without Pipeline links or embeds.");
}
if (
  !platformNavigation.includes('data-california-hero-action="admissions"') ||
  !platformNavigation.includes('href: "/admissions"') ||
  !platformNavigation.includes('page.id !== "admissions" || admissionsAllowed') ||
  !platformNavigation.match(/id: "home"[\s\S]*id: "analytics"[\s\S]*id: "admissions"/) ||
  !californiaHome.includes("admissionsAllowed={admissionsAccess.allowed}")
) {
  throw new Error("Admissions navigation must appear below Analytics only for identities with Admissions access.");
}
if (!apiAuth.includes("assertApiClaimsWorkspaceAccess(payload)")) {
  throw new Error("The Alamo API must enforce the assessor-only workspace boundary.");
}

const vercel = JSON.parse(vercelSource);
assert.deepEqual(vercel.redirects, [
  {
    source: "/pipeline",
    destination: "https://alamo-pipeline.com",
    permanent: false
  },
  {
    source: "/pipeline/:path*",
    destination: "https://alamo-pipeline.com/:path*",
    permanent: false
  }
]);

console.log("admissions access contract checks passed");

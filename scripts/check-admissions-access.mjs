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
import { getPipelineAppUrl } from "../shared/pipeline-app-url.mjs";
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

assert.equal(getPipelineAppUrl(undefined), "https://alamo-pipeline.com");
assert.equal(
  getPipelineAppUrl("https://alamo-pipeline.com/"),
  "https://alamo-pipeline.com"
);
assert.equal(
  getPipelineAppUrl("http://localhost:3000", "http://127.0.0.1:5173"),
  "http://localhost:3000"
);
assert.throws(() => getPipelineAppUrl("http://alamo-pipeline.com"));
assert.throws(() => getPipelineAppUrl("https://alamo-pipeline.com/?resident=123"));

const root = path.resolve(import.meta.dirname, "..");
const [app, shell, admissionsPage, californiaHome, apiAuth] = await Promise.all([
  readFile(path.join(root, "src/app/App.tsx"), "utf8"),
  readFile(path.join(root, "src/shared/layout/ProtectedAppShell.tsx"), "utf8"),
  readFile(path.join(root, "src/features/admissions/pages/AdmissionsPage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/california/pages/CaliforniaHomePage.tsx"), "utf8"),
  readFile(path.join(root, "server/api-auth.mjs"), "utf8")
]);

if (!app.includes('path="/admissions"')) {
  throw new Error("The Alamo application must register the Admissions route.");
}
if (
  !shell.includes("admissionsAccess.restrictedToAdmissions") ||
  !shell.includes('return <Navigate to="/admissions" replace />') ||
  !shell.includes("skipWorkspacePreparation")
) {
  throw new Error("Assessor-only identities must be confined to Admissions without dashboard preloading.");
}
if (!admissionsPage.includes("VITE_PIPELINE_APP_URL") || admissionsPage.includes("iframe")) {
  throw new Error("Admissions must use the bounded Pipeline handoff and must not embed Pipeline.");
}
if (!californiaHome.includes('data-california-hero-action="admissions"')) {
  throw new Error("Authorized Alamo users need an Admissions launcher.");
}
if (!apiAuth.includes("assertApiClaimsWorkspaceAccess(payload)")) {
  throw new Error("The Alamo API must enforce the assessor-only workspace boundary.");
}

console.log("admissions access contract checks passed");

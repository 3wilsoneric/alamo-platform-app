#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import {
  ALAMO_EXECUTIVE_DIRECTOR_ROLES,
  getExecutiveDirectorAccess,
  isExecutiveDirectorPath
} from "../shared/executive-director-access.mjs";
import { assertApiClaimsWorkspaceAccess } from "../server/api-auth.mjs";
import {
  createExecutiveDirectorIntakeSubmission,
  listExecutiveDirectorIntakeSubmissions
} from "../server/executive-director-intake-storage.mjs";

const access = getExecutiveDirectorAccess([ALAMO_EXECUTIVE_DIRECTOR_ROLES["344"]]);
assert.deepEqual(access, {
  allowed: true,
  restrictedToExecutive: true,
  facilityIds: ["344"],
  primaryFacilityId: "344"
});
assert.equal(getExecutiveDirectorAccess([]).allowed, false);
assert.equal(isExecutiveDirectorPath("/executive"), true);
assert.equal(isExecutiveDirectorPath("/executive/reports"), true);
assert.equal(isExecutiveDirectorPath("/analytics"), false);
assert.throws(
  () => assertApiClaimsWorkspaceAccess({ roles: [ALAMO_EXECUTIVE_DIRECTOR_ROLES["344"]] }),
  (error) => error?.statusCode === 403 && error?.code === "api_executive_director_only"
);
assert.doesNotThrow(() => assertApiClaimsWorkspaceAccess(
  { roles: [ALAMO_EXECUTIVE_DIRECTOR_ROLES["344"]] },
  { workspace: "executive-director" }
));

const temporaryRoot = await mkdtemp(path.join(tmpdir(), "alamo-executive-intake-"));
process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE = "local";
process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT = temporaryRoot;
try {
  const pdfDocument = await PDFDocument.create();
  pdfDocument.addPage([612, 792]);
  const form = pdfDocument.getForm();
  const textValues = {
    Facility: "Test Community",
    "Facility File Number": "123456789",
    "Name of client's residents involved1": "Test Resident",
    "Date Occurred": "10/08/2026",
    "Describe event or incident. include time, date, perpetrator, nature of incident, any antecedents leading up to incident and how clients were affected including any injuries": "Test event narrative.",
    "Explain what immediate action was taken, (include persons contacted)": "Test immediate action.",
    "Name and title section1": "Test Submitter",
    "Name and Date1": "10/08/2026",
    "Name and Title section2": "Test Reviewer",
    "Name and Date2": "10/08/2026"
  };
  Object.entries(textValues).forEach(([name, value]) => form.createTextField(name).setText(value));
  form.createCheckBox("Type of Incident").check();
  const pdf = Buffer.from(await pdfDocument.save());
  const request = Readable.from([pdf]);
  request.headers = {
    "content-type": "application/pdf",
    "x-file-name": "inspection-report.pdf"
  };
  const submission = await createExecutiveDirectorIntakeSubmission({
    req: request,
    facilityId: "344",
    authContext: { authenticated: false }
  });
  assert.equal(submission.facilityId, "344");
  assert.equal(submission.status, "needs_review");
  assert.equal(submission.extraction.method, "pdf_acroform");
  assert.ok(["high", "medium"].includes(submission.extraction.confidence));
  assert.equal(submission.byteLength, pdf.byteLength);
  assert.match(submission.sha256, /^[a-f0-9]{64}$/);
  assert.equal((await listExecutiveDirectorIntakeSubmissions("344")).length, 1);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
  delete process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE;
  delete process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [app, shell, page, platformApi, devApi, plan] = await Promise.all([
  readFile(path.join(root, "src/app/App.tsx"), "utf8"),
  readFile(path.join(root, "src/shared/layout/ProtectedAppShell.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/pages/ExecutiveDirectorPage.tsx"), "utf8"),
  readFile(path.join(root, "api/platform.js"), "utf8"),
  readFile(path.join(root, "server/dev-api.mjs"), "utf8"),
  readFile(path.join(root, "docs/platform/executive-director-workspace.md"), "utf8")
]);

assert.match(app, /path="\/executive\/licensing"/);
assert.match(shell, /executiveDirectorAccess\.restrictedToExecutive/);
assert.match(shell, /window\.location\.replace\("\/executive\/licensing"\)/);
assert.match(page, /data-executive-director-upload="true"/);
assert.match(page, /LIC 624 intake/);
assert.match(platformApi, /handleExecutiveDirectorApiRequest/);
assert.match(devApi, /handleExecutiveDirectorApiRequest/);
assert.match(plan, /Nothing is sorted or filed|no automatic addition/i);

console.log("executive director workspace checks passed");

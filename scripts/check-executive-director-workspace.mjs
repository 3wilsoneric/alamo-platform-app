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
  getExecutiveDirectorIntakeOverview,
  getExecutiveDirectorIntakeSource,
  getExecutiveDirectorIntakeSubmission,
  listExecutiveDirectorIntakeSubmissions,
  queryExecutiveDirectorIntakeSubmissions,
  saveExecutiveDirectorIntakeReview,
  toExecutiveDirectorSubmissionDetail
} from "../server/executive-director-intake-storage.mjs";
import { buildExecutiveDirectorCommunityDashboard } from "../server/executive-director-dashboard.mjs";

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

const scopedDashboard = buildExecutiveDirectorCommunityDashboard({
  facilityId: "344",
  communitySnapshot: {
    generated_at: "2026-10-08T12:00:00.000Z",
    reporting_month: "2026-09",
    summary: { residents: 80, currentIncidents: 3, priorIncidents: 4, averageAge: 42, averageLengthOfStay: 210 },
    census: [
      { facility_id: "344", month_bucket: "2026-09", census: 80 },
      { facility_id: "337", month_bucket: "2026-09", census: 154 }
    ],
    incidentTrend: [{ month_bucket: "2026-09", incidentCount: 3 }],
    topIncidentCategories: [{ label: "Medication", count: 2 }]
  },
  reportsSummary: {
    medicationCompliance: [
      { facility_id: "344", month_bucket: "2026-09", compliance_pct: 98.5, total_scheduled: 100, given: 98, not_given: 2 },
      { facility_id: "337", month_bucket: "2026-09", compliance_pct: 93, total_scheduled: 100, given: 93, not_given: 7 }
    ]
  },
  admissionsDashboard: {
    generated_at: "2026-10-08T12:00:00.000Z",
    as_of_date: "2026-10-08",
    communities: [{
      facilityId: "344",
      census: 80,
      censusChange: 1,
      operatingLimit: 84,
      occupancyPct: 95.2,
      monthToDate: { admissions: 2, discharges: 1, net: 1 },
      lastMonth: { admissions: 5, discharges: 4, net: 1 },
      recentWeeks: { admissions: 4, discharges: 3, net: 1 },
      referrals: { onBoard: 2, inDecision: 1, needsAttention: 0 }
    }],
    briefing: { communities: [{ facilityId: "344", newReferrals7d: 1, newReferrals14d: 2, assessmentsThisWeek: 1, plannedMoveInsThisWeek: 1, completedMoveInsThisWeek: 0 }] },
    referral_pipeline: {
      status: "connected",
      generatedAt: "2026-10-08T12:00:00.000Z",
      board: { cards: [
        { referralId: 1, facilityId: "344", clientName: "Turlock Client" },
        { referralId: 2, facilityId: "337", clientName: "San Pablo Client" }
      ] },
      briefing: {
        status: "ready",
        recentReferrals: [{ referralId: 1, facilityId: "344" }, { referralId: 2, facilityId: "337" }],
        upcomingAssessments: [{ referralId: 1, facilityId: "344" }],
        plannedMoveIns: [{ referralId: 2, facilityId: "337" }]
      }
    }
  }
});
assert.equal(scopedDashboard.summary.residents, 80);
assert.equal(scopedDashboard.medication.compliancePct, 98.5);
assert.deepEqual(scopedDashboard.census, [{ month: "2026-09", census: 80 }]);
assert.deepEqual(scopedDashboard.admissions.cards.map((card) => card.referralId), [1]);
assert.deepEqual(scopedDashboard.admissions.recentReferrals.map((row) => row.referralId), [1]);
assert.equal(JSON.stringify(scopedDashboard).includes("San Pablo Client"), false);

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
  const detail = toExecutiveDirectorSubmissionDetail(
    await getExecutiveDirectorIntakeSubmission("344", submission.submissionId)
  );
  assert.equal(detail.reviewRevision, 0);
  assert.equal(detail.draftData.facility.name, "Test Community");

  const edited = structuredClone(detail.draftData);
  edited.facility.telephone = "209-555-0100";
  edited.incidentTypes = [{ key: "unauthorized_absence", label: "Unauthorized absence" }];
  const saved = await saveExecutiveDirectorIntakeReview({
    facilityId: "344",
    submissionId: submission.submissionId,
    expectedRevision: 0,
    data: edited,
    confirm: false,
    authContext: { authenticated: false }
  });
  assert.equal(saved.status, "needs_review");
  assert.equal(saved.reviewRevision, 1);
  assert.equal(saved.review.data.facility.telephone, "209-555-0100");

  await assert.rejects(
    saveExecutiveDirectorIntakeReview({
      facilityId: "344",
      submissionId: submission.submissionId,
      expectedRevision: 0,
      data: edited,
      confirm: false,
      authContext: { authenticated: false }
    }),
    (error) => error?.statusCode === 409 && error?.code === "lic624_review_conflict"
  );

  const confirmed = await saveExecutiveDirectorIntakeReview({
    facilityId: "344",
    submissionId: submission.submissionId,
    expectedRevision: 1,
    data: edited,
    confirm: true,
    authContext: { authenticated: false }
  });
  assert.equal(confirmed.status, "ready_to_file");
  assert.equal(confirmed.reviewRevision, 2);
  const source = await getExecutiveDirectorIntakeSource("344", submission.submissionId);
  assert.equal(source.sha256, submission.sha256);
  assert.deepEqual(source.bytes, pdf);

  const concurrentSubmissions = await Promise.all(
    Array.from({ length: 12 }, async (_, index) => {
      const concurrentRequest = Readable.from([pdf]);
      concurrentRequest.headers = {
        "content-type": "application/pdf",
        "x-file-name": `incident-${String(index + 1).padStart(2, "0")}.pdf`
      };
      return createExecutiveDirectorIntakeSubmission({
        req: concurrentRequest,
        facilityId: "344",
        authContext: { authenticated: false }
      });
    })
  );
  assert.equal(new Set(concurrentSubmissions.map((item) => item.submissionId)).size, 12);

  const overview = await getExecutiveDirectorIntakeOverview("344");
  assert.equal(overview.summary.total, 13);
  assert.equal(overview.summary.readyToFile, 1);
  assert.equal(overview.submissions.length, 13);
  const firstPage = await queryExecutiveDirectorIntakeSubmissions({ facilityId: "344", limit: 5 });
  assert.equal(firstPage.submissions.length, 5);
  assert.ok(firstPage.nextCursor);
  const secondPage = await queryExecutiveDirectorIntakeSubmissions({ facilityId: "344", limit: 5, cursor: firstPage.nextCursor });
  assert.equal(secondPage.submissions.length, 5);
  assert.equal(new Set([...firstPage.submissions, ...secondPage.submissions].map((item) => item.submissionId)).size, 10);
  const reviewPage = await queryExecutiveDirectorIntakeSubmissions({ facilityId: "344", status: "ready_to_file" });
  assert.deepEqual(reviewPage.submissions.map((item) => item.submissionId), [submission.submissionId]);
  const listed = await listExecutiveDirectorIntakeSubmissions("344");
  assert.equal(listed.length, 13);
  assert.equal(listed.some((item) => item.status === "ready_to_file"), true);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
  delete process.env.EXECUTIVE_DIRECTOR_INTAKE_STORAGE;
  delete process.env.EXECUTIVE_DIRECTOR_INTAKE_LOCAL_ROOT;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [app, shell, page, dashboardPage, dashboardModal, header, reviewWorkspace, platformApi, devApi, plan] = await Promise.all([
  readFile(path.join(root, "src/app/App.tsx"), "utf8"),
  readFile(path.join(root, "src/shared/layout/ProtectedAppShell.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/pages/ExecutiveDirectorPage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/pages/ExecutiveDirectorDashboardPage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/components/ExecutiveCommunityDetailModal.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/components/ExecutiveDirectorHeader.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/components/Lic624ReviewWorkspace.tsx"), "utf8"),
  readFile(path.join(root, "api/platform.js"), "utf8"),
  readFile(path.join(root, "server/dev-api.mjs"), "utf8"),
  readFile(path.join(root, "docs/platform/executive-director-workspace.md"), "utf8")
]);

assert.match(app, /path="\/executive\/licensing"/);
assert.match(app, /path="\/executive\/dashboard"/);
assert.match(shell, /executiveDirectorAccess\.restrictedToExecutive/);
assert.match(shell, /window\.location\.replace\("\/executive\/dashboard"\)/);
assert.match(page, /data-executive-director-upload="true"/);
assert.match(page, /LIC 624 intake/);
assert.match(page, /Review form/);
assert.match(dashboardPage, /data-executive-community-dashboard="true"/);
assert.match(dashboardPage, /data-daily-operating-summary="true"/);
assert.doesNotMatch(dashboardPage, /A current view of resident census|Community briefing|Select any area to open/);
assert.match(dashboardPage, /onOpenDetail\("census"\)/);
assert.match(dashboardPage, /onOpenDetail\("admissions"\)/);
assert.match(dashboardModal, /data-executive-community-detail-modal/);
assert.match(dashboardModal, /data-executive-detail-view="census"/);
assert.match(dashboardModal, /data-executive-detail-view="incidents"/);
assert.match(dashboardModal, /data-executive-detail-view="medications"/);
assert.match(dashboardModal, /data-executive-detail-view="admissions"/);
assert.match(header, /\/executive\/dashboard/);
assert.match(header, /Community/);
assert.match(reviewWorkspace, /data-lic624-review-workspace="true"/);
assert.match(reviewWorkspace, /Mark reviewed/);
assert.match(reviewWorkspace, /Original extraction preserved|uploaded original stays unchanged/i);
assert.match(platformApi, /handleExecutiveDirectorApiRequest/);
assert.match(devApi, /handleExecutiveDirectorApiRequest/);
assert.match(dashboardPage, /ExecutiveCommunityDetailModal/);
assert.match(platformApi, /isExecutiveDirectorApiPath/);
assert.match(devApi, /send\(body\)/);
assert.match(plan, /cursor pagination/);
assert.match(plan, /SHA-256 checksum/);
assert.match(plan, /Nothing is sorted or filed|no automatic addition/i);

console.log("executive director workspace checks passed");

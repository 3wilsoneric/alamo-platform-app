#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { PDFDocument } from "pdf-lib";
import ts from "typescript";
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
    topIncidentCategories: [{ label: "Medication", count: 2 }],
    incidentDetails: [
      { id: "incident-344", facility_id: "344", resident_id: "resident-344", client_name: "Turlock Resident", incident_date: "2026-09-12", category: "Medication", location: "Unit A" },
      { id: "incident-337", facility_id: "337", resident_id: "resident-337", client_name: "San Pablo Resident", incident_date: "2026-09-13", category: "Medication", location: "Unit B" }
    ]
  },
  reportsSummary: {
    medicationCompliance: [
      { facility_id: "344", month_bucket: "2026-09", compliance_pct: 98.5, total_scheduled: 100, given: 98, not_given: 2 },
      { facility_id: "337", month_bucket: "2026-09", compliance_pct: 93, total_scheduled: 100, given: 93, not_given: 7 }
    ],
    toolContext: {
      marExceptionDetails: [
        { administration_id: "mar-344", facility_id: "344", resident_id: "resident-344", resident_name: "Turlock Resident", medication_name: "Medication A", administration_date: "2026-09-14", administration_outcome: "Not given" },
        { administration_id: "mar-337", facility_id: "337", resident_id: "resident-337", resident_name: "San Pablo Resident", medication_name: "Medication B", administration_date: "2026-09-15", administration_outcome: "Not given" }
      ],
      residentEpisodeHistory: [
        { episode_id: "episode-344", facility_id: "344", resident_id: "resident-344", resident_name: "Turlock Resident", admit_date: "2026-09-01" },
        { episode_id: "episode-337", facility_id: "337", resident_id: "resident-337", resident_name: "San Pablo Resident", admit_date: "2026-09-02" }
      ]
    }
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
assert.deepEqual(scopedDashboard.incidentDetails.map((row) => row.id), ["incident-344"]);
assert.deepEqual(scopedDashboard.medicationExceptions.map((row) => row.id), ["mar-344"]);
assert.deepEqual(scopedDashboard.residentMovements.map((row) => row.id), ["episode-344-admit"]);
assert.deepEqual(scopedDashboard.medicationWatch.map((row) => row.residentName), ["Turlock Resident"]);
assert.equal(JSON.stringify(scopedDashboard).includes("San Pablo Client"), false);
assert.equal(JSON.stringify(scopedDashboard).includes("San Pablo Resident"), false);
assert.equal(scopedDashboard.incidentDetails[0].injuryOccurred, null);
assert.equal(scopedDashboard.incidentDetails[0].policeCalled, null);
assert.deepEqual(scopedDashboard.incidentCategoryPeriods, [{
  month: "2026-09", categories: [{ label: "Medication", count: 1 }], recordCount: 1, totalCount: 3, complete: false
}]);
assert.deepEqual(scopedDashboard.topIncidentCategories, [{ label: "Medication", count: 1 }]);

const categoryDashboard = buildExecutiveDirectorCommunityDashboard({
  facilityId: "344",
  communitySnapshot: {
    reporting_month: "2026-10",
    incidentTrend: [{ month_bucket: "2026-10", incidentCount: 60 }, { month_bucket: "2026-09", incidentCount: 2 }],
    topIncidentCategories: [{ label: "Medication Refusal", count: 1168 }],
    incidentDetails: [
      ...Array.from({ length: 56 }, (_, index) => ({ id: `oct-${index}`, facility_id: "344", incident_date: "2026-10-08", category: "Medication Refusal" })),
      { id: "sep-1", facility_id: "344", incident_date: "2026-09-12", category: "Other" },
      { id: "sep-2", facility_id: "344", received_at: "2026-09-13T12:00:00Z", category: "Other" },
      { id: "aug-1", facility_id: "344", incident_date: "2026-08-01", category: "Other" },
      { id: "other-facility", facility_id: "337", incident_date: "2026-10-08", category: "Other facility category" },
      { id: "undated", facility_id: "344", category: "Undated category" },
      { id: "invalid-month", facility_id: "344", incident_date: "2026-13-08", category: "Invalid date category" },
      { id: "invalid-day", facility_id: "344", incident_date: "2026-10-99", category: "Invalid date category" }
    ]
  }
});
assert.deepEqual(categoryDashboard.topIncidentCategories, [{ label: "Medication Refusal", count: 56 }]);
assert.equal(categoryDashboard.incidentDetails.length, 50);
assert.deepEqual(categoryDashboard.incidentCategoryPeriods, [
  { month: "2026-08", categories: [{ label: "Other", count: 1 }], recordCount: 1, totalCount: null, complete: false },
  { month: "2026-09", categories: [{ label: "Other", count: 2 }], recordCount: 2, totalCount: 2, complete: true },
  { month: "2026-10", categories: [{ label: "Medication Refusal", count: 56 }], recordCount: 56, totalCount: 60, complete: false }
]);
const missingCategoryDashboard = buildExecutiveDirectorCommunityDashboard({
  facilityId: "344",
  communitySnapshot: {
    incidentTrend: [{ month_bucket: "2026-10", incidentCount: 108 }],
    topIncidentCategories: [{ label: "Medication Refusal", count: 1168 }],
    incidentDetails: [{ id: "old-incident", facility_id: "344", incident_date: "2026-09-12", category: "Other" }]
  }
});
assert.deepEqual(missingCategoryDashboard.topIncidentCategories, []);
assert.deepEqual(missingCategoryDashboard.incidentCategoryPeriods.at(-1), {
  month: "2026-10", categories: [], recordCount: 0, totalCount: 108, complete: false
});

const incidentBooleanCases = [
  [true, true], [false, false], [1, true], [0, false],
  ["yes", true], [" TRUE ", true], ["Y", true], ["1", true],
  ["no", false], [" FALSE ", false], ["N", false], ["0", false],
  [null, null], [undefined, null], ["", null], ["unknown", null], [2, null]
];
const booleanDashboard = buildExecutiveDirectorCommunityDashboard({
  facilityId: "344",
  communitySnapshot: {
    incidentDetails: incidentBooleanCases.map(([value], index) => ({
      id: `boolean-${index}`, facility_id: "344", injury_occurred: value, police_called: value
    }))
  }
});
incidentBooleanCases.forEach(([, expected], index) => {
  const row = booleanDashboard.incidentDetails.find((item) => item.id === `boolean-${index}`);
  assert.equal(row.injuryOccurred, expected);
  assert.equal(row.policeCalled, expected);
});

function typescriptModuleUrl(source) {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const formattersUrl = typescriptModuleUrl(await readFile(new URL("../src/features/executive/components/executiveDashboardFormatters.ts", import.meta.url), "utf8"));
const admissionsSource = await readFile(new URL("../src/features/executive/components/executiveAdmissions.ts", import.meta.url), "utf8");
const { isImpendingAdmissionCard, impendingAdmissionCards } = await import(typescriptModuleUrl(admissionsSource.replace('"./executiveDashboardFormatters"', JSON.stringify(formattersUrl))));
const terminalStatuses = ["Declined", "Declined by family", "Denied", "Rejected", "Canceled", "CANCELLED", "Withdrawn", "Closed", "Admitted", "Discharged", "Deceased", "Archived", "Moved_in", "Admission complete"];
for (const status of terminalStatuses) {
  assert.equal(isImpendingAdmissionCard({ status, plannedAdmissionDate: "2026-10-09" }), false, `${status} must not be an impending admit when a planned date is retained`);
}
for (const status of ["Accepted", "Accepted, requirements open", "Awaiting_admit", "Meet the client not sent"]) {
  assert.equal(isImpendingAdmissionCard({ status, plannedAdmissionDate: null }), true, `${status} remains an impending admit without a date`);
}
assert.equal(isImpendingAdmissionCard({ status: "Assessment scheduled", plannedAdmissionDate: null }), false);
assert.deepEqual(impendingAdmissionCards([
  { clientName: "Undated Client", status: "Accepted", plannedAdmissionDate: null },
  { clientName: "Closed Client", status: "Admitted", plannedAdmissionDate: "2026-10-01" },
  { clientName: "Scheduled Client", status: "Awaiting admit", plannedAdmissionDate: "2026-10-09" }
]).map((card) => card.clientName), ["Scheduled Client", "Undated Client"]);

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
      // Pagination needs distinct reports. Renaming identical bytes now reuses
      // the existing submission instead of manufacturing another report.
      const distinctDocument = await PDFDocument.load(pdf);
      distinctDocument.setSubject(`Synthetic incident report ${index + 1}`);
      const concurrentRequest = Readable.from([Buffer.from(await distinctDocument.save())]);
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
const [app, shell, page, batchUpload, dashboardPage, dashboardModal, header, reviewWorkspace, platformApi, devApi, plan] = await Promise.all([
  readFile(path.join(root, "src/app/App.tsx"), "utf8"),
  readFile(path.join(root, "src/shared/layout/ProtectedAppShell.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/pages/ExecutiveDirectorPage.tsx"), "utf8"),
  readFile(path.join(root, "src/features/executive/components/LicensingBulkUpload.tsx"), "utf8"),
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
assert.match(page, /<LicensingBulkUpload/);
assert.match(batchUpload, /data-executive-director-upload="true"/);
assert.match(batchUpload, /LIC 624 intake/);
assert.match(page, /Review form/);
assert.match(dashboardPage, /data-executive-community-dashboard="true"/);
assert.match(dashboardPage, /data-daily-operating-summary="true"/);
assert.doesNotMatch(dashboardPage, /A current view of resident census|Community briefing|Select any area to open/);
assert.match(dashboardPage, /onOpenDetail\("census"\)/);
assert.match(dashboardPage, /aria-label="Community views"/);
assert.match(dashboardPage, /label: "Overview"/);
assert.match(dashboardPage, /label: "MARs"/);
assert.match(dashboardPage, /label: "Incidents"/);
assert.doesNotMatch(dashboardPage, /<DomainPanel kind="admissions"/);
assert.match(dashboardPage, /data-executive-meet-client-trigger="true"/);
assert.match(dashboardPage, /data-executive-client-notifications="true"/);
assert.match(dashboardPage, /aria-label="New client notifications"/);
assert.match(dashboardPage, /<h2>New client<\/h2>/);
assert.doesNotMatch(dashboardPage, /Meet the client/);
assert.match(dashboardPage, /onClick=\{\(\) => meetClient\(card\)\}/);
assert.match(dashboardPage, /ExecutiveCommunityWorkspace/);
assert.match(dashboardModal, /data-executive-community-detail-modal/);
assert.match(dashboardModal, /data-executive-detail-view="census"/);
assert.match(dashboardModal, /data-executive-detail-view="incidents"/);
assert.match(dashboardModal, /data-executive-detail-view="medications"/);
assert.match(dashboardModal, /data-executive-detail-view="admissions"/);
assert.match(dashboardModal, /data-census-ledger="true"/);
assert.match(dashboardModal, /data-incident-register="true"/);
assert.match(dashboardModal, /data-mar-binder="true"/);
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

await import("./check-executive-director-incidents.mjs");
await import("./check-executive-director-batch-intake.mjs");
console.log("executive director workspace checks passed");

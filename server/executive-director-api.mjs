import { ALAMO_FACILITIES } from "../shared/community-names.mjs";
import { requireApiUser } from "./api-auth.mjs";
import {
  assertExecutiveDirectorAccess,
  resolveExecutiveDirectorFacility
} from "./executive-director-access.mjs";
import {
  createExecutiveDirectorIntakeSubmission,
  getExecutiveDirectorIntakeSubmission,
  listExecutiveDirectorIntakeSubmissions,
  saveExecutiveDirectorIntakeReview,
  toExecutiveDirectorSubmissionDetail,
  toExecutiveDirectorSubmissionSummary
} from "./executive-director-intake-storage.mjs";
import {
  assertLic624SubmissionId,
  validateLic624ReviewRequest
} from "./lic624-review.mjs";
import { readValidatedJsonRequest } from "./http-body.mjs";
import { createHttpError, getApiError, getRequestUrl } from "./http-errors.mjs";
import { applyProtectedApiHeaders } from "./http-response.mjs";
import {
  getAdmissionsDashboardData,
  getCommunitySnapshotData,
  getReportsSummaryData
} from "./platform-data.mjs";
import { buildExecutiveDirectorCommunityDashboard } from "./executive-director-dashboard.mjs";
import {
  LIC624_FORM_DEFINITION,
  LIC624_INCIDENT_TYPE_FIELDS,
  LIC624_NOTIFICATION_FIELDS
} from "../shared/lic624-contracts.mjs";

export const EXECUTIVE_DIRECTOR_API_PREFIX = "/api/platform/executive-director";

function getHeader(req, name) {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

function summarizeSubmissions(submissions) {
  return {
    total: submissions.length,
    ocrRequired: submissions.filter((item) => item.status === "ocr_required").length,
    needsReview: submissions.filter((item) => item.status === "needs_review").length,
    readyToFile: submissions.filter((item) => item.status === "ready_to_file").length
  };
}

function getLic624FormContract() {
  return {
    ...LIC624_FORM_DEFINITION,
    incidentTypes: LIC624_INCIDENT_TYPE_FIELDS.map(({ key, label }) => ({ key, label })),
    notifications: LIC624_NOTIFICATION_FIELDS
  };
}

async function getDashboardSnapshot(facilityId) {
  try {
    const snapshot = await getCommunitySnapshotData(facilityId);
    return {
      status: "ready",
      generatedAt: snapshot.generated_at,
      residents: snapshot.summary?.residents ?? snapshot.facility?.total_residents ?? null,
      reportingMonth: snapshot.reporting_month ?? null
    };
  } catch {
    return {
      status: "unavailable",
      generatedAt: null,
      residents: null,
      reportingMonth: null
    };
  }
}

async function getCommunityDashboard(facilityId) {
  const [communityResult, reportsResult, admissionsResult] = await Promise.allSettled([
    getCommunitySnapshotData(facilityId),
    getReportsSummaryData({ includeAnalystHistory: false }),
    getAdmissionsDashboardData()
  ]);

  return buildExecutiveDirectorCommunityDashboard({
    facilityId,
    communitySnapshot: communityResult.status === "fulfilled" ? communityResult.value : null,
    reportsSummary: reportsResult.status === "fulfilled" ? reportsResult.value : null,
    admissionsDashboard: admissionsResult.status === "fulfilled" ? admissionsResult.value : null
  });
}

export function isExecutiveDirectorApiPath(pathname) {
  return String(pathname ?? "").startsWith(`${EXECUTIVE_DIRECTOR_API_PREFIX}/`);
}

export async function handleExecutiveDirectorApiRequest(req, res) {
  applyProtectedApiHeaders(res);
  try {
    const requestUrl = getRequestUrl(req);
    const authContext = await requireApiUser(req, { workspace: "executive-director" });
    const access = assertExecutiveDirectorAccess(authContext);

    if (req.method === "GET" && requestUrl.pathname === `${EXECUTIVE_DIRECTOR_API_PREFIX}/bootstrap`) {
      const facilityId = resolveExecutiveDirectorFacility(
        access,
        requestUrl.searchParams.get("facilityId")
      );
      const facility = ALAMO_FACILITIES.find((item) => item.facilityId === facilityId);
      if (!facility) {
        throw createHttpError(400, "executive_director_facility_invalid", "Choose a listed Alamo community.");
      }
      const [submissions, dashboard] = await Promise.all([
        listExecutiveDirectorIntakeSubmissions(facilityId),
        getDashboardSnapshot(facilityId)
      ]);
      res.status(200).json({
        version: "executive-director-workspace-v1",
        facility: {
          facilityId: facility.facilityId,
          communityName: facility.communityName,
          shortName: facility.shortName,
          city: facility.city,
          state: facility.state
        },
        dashboard,
        intake: {
          summary: summarizeSubmissions(submissions),
          submissions: submissions.map(toExecutiveDirectorSubmissionSummary)
        },
        form: getLic624FormContract()
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === `${EXECUTIVE_DIRECTOR_API_PREFIX}/dashboard`) {
      const facilityId = resolveExecutiveDirectorFacility(
        access,
        requestUrl.searchParams.get("facilityId")
      );
      const facility = ALAMO_FACILITIES.find((item) => item.facilityId === facilityId);
      if (!facility) {
        throw createHttpError(400, "executive_director_facility_invalid", "Choose a listed Alamo community.");
      }
      res.status(200).json({
        facility: {
          facilityId: facility.facilityId,
          communityName: facility.communityName,
          shortName: facility.shortName,
          city: facility.city,
          state: facility.state
        },
        dashboard: await getCommunityDashboard(facilityId)
      });
      return;
    }

    if (req.method === "GET" && requestUrl.pathname === `${EXECUTIVE_DIRECTOR_API_PREFIX}/licensing-intake`) {
      const facilityId = resolveExecutiveDirectorFacility(
        access,
        requestUrl.searchParams.get("facilityId")
      );
      const submissionId = assertLic624SubmissionId(requestUrl.searchParams.get("submissionId"));
      const submission = await getExecutiveDirectorIntakeSubmission(facilityId, submissionId);
      res.status(200).json({
        version: "executive-director-licensing-review-v1",
        submission: toExecutiveDirectorSubmissionDetail(submission),
        form: getLic624FormContract()
      });
      return;
    }

    if (req.method === "POST" && requestUrl.pathname === `${EXECUTIVE_DIRECTOR_API_PREFIX}/licensing-intake`) {
      const facilityId = resolveExecutiveDirectorFacility(access, getHeader(req, "x-facility-id"));
      const submission = await createExecutiveDirectorIntakeSubmission({ req, facilityId, authContext });
      res.status(201).json({
        version: "executive-director-licensing-intake-v1",
        submission: toExecutiveDirectorSubmissionDetail(submission),
        form: getLic624FormContract()
      });
      return;
    }

    if (req.method === "PUT" && requestUrl.pathname === `${EXECUTIVE_DIRECTOR_API_PREFIX}/licensing-intake/review`) {
      const facilityId = resolveExecutiveDirectorFacility(access, getHeader(req, "x-facility-id"));
      const request = await readValidatedJsonRequest(req, validateLic624ReviewRequest, 128 * 1024);
      const submission = await saveExecutiveDirectorIntakeReview({
        facilityId,
        ...request,
        authContext
      });
      res.status(200).json({
        version: "executive-director-licensing-review-v1",
        submission: toExecutiveDirectorSubmissionDetail(submission),
        form: getLic624FormContract()
      });
      return;
    }

    res.status(["GET", "POST", "PUT"].includes(req.method) ? 404 : 405).json({
      error: ["GET", "POST", "PUT"].includes(req.method) ? "Not found." : "Method not allowed."
    });
  } catch (error) {
    const response = getApiError(error, "Executive Director workspace request failed.");
    res.status(response.statusCode).json(response.body);
  }
}

import {
  fetchWithApiAuth,
  readBoundedJsonResponse
} from "../../../shared/api/authenticatedFetch";
import type {
  AdmissionsBoardCard,
  AdmissionsFlowTotals,
  AdmissionsPipelineBriefingAssessment,
  AdmissionsPipelineBriefingMoveIn,
  AdmissionsPipelineBriefingReferral
} from "../../../shared/types/platformSnapshot";

export type ExecutiveDirectorIntakeStatus =
  | "awaiting_form_definition"
  | "ocr_required"
  | "needs_review"
  | "ready_to_file"
  | "filed"
  | "failed";

export interface ExecutiveDirectorSubmission {
  submissionId: string;
  facilityId: string;
  originalFileName: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  createdAt: string;
  status: ExecutiveDirectorIntakeStatus;
  extractionSummary: {
    form: "LIC624";
    method: "pdf_acroform" | "ocr_required";
    status: "needs_review" | "ocr_required";
    confidence: "high" | "medium" | null;
    extractedFieldCount: number;
    reviewIssueCount: number;
  } | null;
  reviewedAt: string | null;
  filedAt: string | null;
}

export interface Lic624Resident {
  name: string;
  dateOccurred: string;
  age: string;
  sex: string;
  admissionDate: string;
}

export interface Lic624IncidentType {
  key: string;
  label: string;
}

export interface Lic624Notification extends Lic624IncidentType {
  selected: boolean;
  detail: string;
}

export interface Lic624ReviewData {
  facility: {
    name: string;
    fileNumber: string;
    telephone: string;
    address: string;
    cityStateZip: string;
  };
  residents: Lic624Resident[];
  incidentTypes: Lic624IncidentType[];
  eventNarrative: string;
  observers: string;
  immediateAction: string;
  treatment: {
    necessary: boolean | null;
    nature: string;
    whereAdministered: string;
    administeredBy: string;
    followUp: string;
  };
  plannedAction: string;
  supervisorComments: string;
  attendingPhysician: string;
  submission: {
    submittedBy: string;
    submittedDate: string;
    reviewedBy: string;
    reviewedDate: string;
  };
  notifications: Lic624Notification[];
}

export interface ExecutiveDirectorSubmissionDetail extends ExecutiveDirectorSubmission {
  sourceData: Lic624ReviewData | null;
  draftData: Lic624ReviewData | null;
  reviewIssues: string[];
  reviewRevision: number;
  reviewUpdatedAt: string | null;
  confirmedAt: string | null;
}

export interface Lic624FormContract {
  id: "LIC624";
  revision: string;
  title: string;
  agency: string;
  sections: Array<{ id: string; label: string; fields: string[] }>;
  incidentTypes: Lic624IncidentType[];
  notifications: Lic624IncidentType[];
}

export interface ExecutiveDirectorBootstrap {
  version: "executive-director-workspace-v1";
  facility: {
    facilityId: string;
    communityName: string;
    shortName: string;
    city: string;
    state: string;
  };
  dashboard: {
    status: "ready" | "unavailable";
    generatedAt: string | null;
    residents: number | null;
    reportingMonth: string | null;
  };
  intake: {
    summary: {
      total: number;
      ocrRequired: number;
      needsReview: number;
      readyToFile: number;
      filed: number;
      failed: number;
    };
    submissions: ExecutiveDirectorSubmission[];
  };
  form: Lic624FormContract;
}

export interface ExecutiveDirectorCommunityDashboard {
  version: "executive-director-community-dashboard-v1";
  status: "ready" | "unavailable";
  generatedAt: string | null;
  reportingMonth: string | null;
  summary: {
    residents: number | null;
    currentIncidents: number | null;
    priorIncidents: number | null;
    averageAge: number | null;
    averageLengthOfStay: number | null;
  } | null;
  census: Array<{ month: string; census: number }>;
  incidentTrend: Array<{ month: string; count: number }>;
  incidentCategoryPeriods?: Array<{
    month: string;
    categories: Array<{ label: string; count: number }>;
    recordCount: number;
    totalCount: number | null;
    complete: boolean;
  }>;
  topIncidentCategories: Array<{ label: string; count: number }>;
  incidentDetails: Array<{
    id: string;
    residentId: string | null;
    residentName: string;
    date: string | null;
    category: string;
    location: string | null;
    injuryOccurred: boolean | null;
    policeCalled: boolean | null;
    response: string | null;
  }>;
  residentMovements: Array<{
    id: string;
    residentId: string | null;
    residentName: string;
    date: string | null;
    action: "Move-in" | "Move-out";
    type: "Admission" | "Discharge";
    destination: string | null;
    note: string | null;
  }>;
  medicationHistory: Array<{
    month: string;
    compliancePct: number | null;
    scheduled: number | null;
    given: number | null;
    notGiven: number | null;
  }>;
  medication: {
    month: string;
    compliancePct: number | null;
    scheduled: number | null;
    given: number | null;
    notGiven: number | null;
  } | null;
  medicationExceptions: Array<{
    id: string;
    residentId: string | null;
    residentName: string;
    medication: string;
    dosage: string | null;
    date: string | null;
    outcome: string;
    reason: string | null;
    noteRecorded: boolean;
  }>;
  medicationWatch: Array<{
    residentId: string | null;
    residentName: string;
    exceptions: number;
  }>;
  admissions: {
    status: "connected" | "not_connected" | "unavailable";
    generatedAt: string | null;
    asOfDate: string | null;
    community: {
      census: number | null;
      censusChange: number | null;
      operatingLimit: number | null;
      occupancyPct: number | null;
      monthToDate: AdmissionsFlowTotals;
      lastMonth: AdmissionsFlowTotals;
      recentWeeks: AdmissionsFlowTotals;
      activeReferrals: number | null;
      inDecision: number | null;
      needsAttention: number | null;
      newReferrals7d: number | null;
      newReferrals14d: number | null;
      assessmentsThisWeek: number | null;
      plannedMoveInsThisWeek: number | null;
      completedMoveInsThisWeek: number | null;
    } | null;
    cards: AdmissionsBoardCard[];
    recentReferrals: AdmissionsPipelineBriefingReferral[];
    upcomingAssessments: AdmissionsPipelineBriefingAssessment[];
    plannedMoveIns: AdmissionsPipelineBriefingMoveIn[];
  };
}

export interface ExecutiveDirectorCommunityDashboardResponse {
  facility: ExecutiveDirectorBootstrap["facility"];
  dashboard: ExecutiveDirectorCommunityDashboard;
}

async function readApiJson<T>(response: Response): Promise<T> {
  const body = await readBoundedJsonResponse<T & { error?: string }>(response, 2 * 1024 * 1024);
  if (!response.ok) {
    throw new Error(body.error || `Executive Director request failed (${response.status}).`);
  }
  return body as T;
}

export function fetchExecutiveDirectorBootstrap(facilityId: string, signal?: AbortSignal) {
  return fetchWithApiAuth<ExecutiveDirectorBootstrap>(
    `/api/platform/executive-director/bootstrap?facilityId=${encodeURIComponent(facilityId)}`,
    signal ? { signal } : {},
    { consume: (response) => readApiJson<ExecutiveDirectorBootstrap>(response) }
  );
}

export function fetchExecutiveDirectorCommunityDashboard(
  facilityId: string,
  signal?: AbortSignal
) {
  return fetchWithApiAuth<ExecutiveDirectorCommunityDashboardResponse>(
    `/api/platform/executive-director/dashboard?facilityId=${encodeURIComponent(facilityId)}`,
    signal ? { signal } : {},
    { consume: (response) => readApiJson<ExecutiveDirectorCommunityDashboardResponse>(response) }
  );
}

export interface ExecutiveDirectorIncident {
  id: string;
  residentId: string | null;
  residentName: string;
  date: string | null;
  receivedAt: string | null;
  category: string;
  incidentType: string | null;
  location: string | null;
  description: string | null;
  response: string | null;
  staffName: string | null;
  injuryOccurred: boolean | null;
  emergencyServicesNotified: boolean | null;
  sentinelEvent: boolean | null;
}

export interface ExecutiveDirectorIncidentRegister {
  version: "executive-director-incidents-v1";
  status: "ready" | "unavailable";
  facilityId: string;
  generatedAt: string | null;
  asOfDate: string | null;
  totalIncidents: number | null;
  matchingIncidents: number | null;
  incidents: ExecutiveDirectorIncident[];
  categories: Array<{ label: string; count: number }>;
  nextCursor: string | null;
  coverage: {
    status: "complete" | "partial" | "unavailable";
    startDate: string | null;
    endDate: string | null;
    reportedTotal: number | null;
    note: string;
  };
  freshness: { stale: boolean; warning: string | null };
}

export function fetchExecutiveDirectorIncidents(
  facilityId: string,
  options: { query?: string; category?: string; from?: string; to?: string; cursor?: string } = {},
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ facilityId, limit: "25" });
  if (options.query) params.set("q", options.query);
  if (options.category) params.set("category", options.category);
  if (options.from) params.set("from", options.from);
  if (options.to) params.set("to", options.to);
  if (options.cursor) params.set("cursor", options.cursor);
  return fetchWithApiAuth<ExecutiveDirectorIncidentRegister>(
    `/api/platform/executive-director/incidents?${params.toString()}`,
    signal ? { signal } : {},
    { consume: (response) => readApiJson<ExecutiveDirectorIncidentRegister>(response) }
  );
}

export interface ExecutiveDirectorSubmissionCatalog {
  version: "executive-director-intake-catalog-v1";
  facilityId: string;
  catalogRevision: number;
  updatedAt: string | null;
  summary: ExecutiveDirectorBootstrap["intake"]["summary"];
  filteredTotal: number;
  submissions: ExecutiveDirectorSubmission[];
  nextCursor: string | null;
}

export function fetchExecutiveDirectorSubmissions(
  facilityId: string,
  options: { status?: string; query?: string; cursor?: string } = {},
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ facilityId, limit: "25" });
  if (options.status) params.set("status", options.status);
  if (options.query) params.set("q", options.query);
  if (options.cursor) params.set("cursor", options.cursor);
  return fetchWithApiAuth<ExecutiveDirectorSubmissionCatalog>(
    `/api/platform/executive-director/licensing-intake/submissions?${params.toString()}`,
    signal ? { signal } : {},
    { consume: (response) => readApiJson<ExecutiveDirectorSubmissionCatalog>(response) }
  );
}

export interface ExecutiveDirectorUploadResponse {
  version: "executive-director-licensing-intake-v1";
  submission: ExecutiveDirectorSubmissionDetail;
  form: Lic624FormContract;
  duplicate?: boolean;
}

export function uploadExecutiveDirectorLicensingReport(
  facilityId: string,
  file: File,
  signal?: AbortSignal
) {
  return fetchWithApiAuth<ExecutiveDirectorUploadResponse>(
    "/api/platform/executive-director/licensing-intake",
    {
      method: "POST",
      body: file,
      ...(signal ? { signal } : {}),
      headers: {
        "Content-Type": file.type,
        "X-File-Name": file.name,
        "X-Facility-Id": facilityId
      }
    },
    {
      timeoutMs: 60_000,
      consume: (response) => readApiJson<ExecutiveDirectorUploadResponse>(response)
    }
  );
}

export function fetchExecutiveDirectorSubmission(
  facilityId: string,
  submissionId: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ facilityId, submissionId });
  return fetchWithApiAuth<{
    version: "executive-director-licensing-review-v1";
    submission: ExecutiveDirectorSubmissionDetail;
    form: Lic624FormContract;
  }>(
    `/api/platform/executive-director/licensing-intake?${params.toString()}`,
    signal ? { signal } : {},
    {
      consume: (response) => readApiJson<{
        version: "executive-director-licensing-review-v1";
        submission: ExecutiveDirectorSubmissionDetail;
        form: Lic624FormContract;
      }>(response)
    }
  );
}

export function fetchExecutiveDirectorSubmissionSource(
  facilityId: string,
  submissionId: string,
  signal?: AbortSignal
) {
  const params = new URLSearchParams({ facilityId, submissionId });
  return fetchWithApiAuth<Blob>(
    `/api/platform/executive-director/licensing-intake/source?${params.toString()}`,
    signal ? { signal } : {},
    {
      consume: async (response) => {
        if (!response.ok) await readApiJson(response);
        return response.blob();
      }
    }
  );
}

export function saveExecutiveDirectorLicensingReview(
  facilityId: string,
  submission: ExecutiveDirectorSubmissionDetail,
  data: Lic624ReviewData,
  confirm: boolean,
  signal?: AbortSignal
) {
  return fetchWithApiAuth<{
    version: "executive-director-licensing-review-v1";
    submission: ExecutiveDirectorSubmissionDetail;
    form: Lic624FormContract;
  }>(
    "/api/platform/executive-director/licensing-intake/review",
    {
      method: "PUT",
      body: JSON.stringify({
        submissionId: submission.submissionId,
        expectedRevision: submission.reviewRevision,
        confirm,
        data
      }),
      ...(signal ? { signal } : {}),
      headers: {
        "Content-Type": "application/json",
        "X-Facility-Id": facilityId
      }
    },
    {
      consume: (response) => readApiJson<{
        version: "executive-director-licensing-review-v1";
        submission: ExecutiveDirectorSubmissionDetail;
        form: Lic624FormContract;
      }>(response)
    }
  );
}

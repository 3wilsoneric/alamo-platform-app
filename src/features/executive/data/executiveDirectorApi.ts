import {
  fetchWithApiAuth,
  readBoundedJsonResponse
} from "../../../shared/api/authenticatedFetch";

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
    };
    submissions: ExecutiveDirectorSubmission[];
  };
  form: {
    id: "LIC624";
    revision: string;
    title: string;
    agency: string;
    sections: Array<{ id: string; label: string; fields: string[] }>;
  };
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

export function uploadExecutiveDirectorLicensingReport(
  facilityId: string,
  file: File,
  signal?: AbortSignal
) {
  return fetchWithApiAuth<{
    version: "executive-director-licensing-intake-v1";
    submission: ExecutiveDirectorSubmission;
  }>(
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
      consume: (response) => readApiJson<{
        version: "executive-director-licensing-intake-v1";
        submission: ExecutiveDirectorSubmission;
      }>(response)
    }
  );
}

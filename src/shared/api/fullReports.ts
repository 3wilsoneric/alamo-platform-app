import type {
  FullReportDefinitionsResponse,
  FullReportPackage,
  FullReportRequest
} from "../types/fullReport";
import {
  fetchWithApiAuth,
  readBoundedJsonResponse
} from "./authenticatedFetch";

function validateReportPackage(value: unknown): FullReportPackage {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The report service returned an invalid package.");
  }
  const payload = value as Partial<FullReportPackage>;
  if (
    payload.report?.version !== "governed-full-report-v1" ||
    !payload.report.freshness ||
    !["current", "stale"].includes(payload.report.freshness.status) ||
    typeof payload.report.freshness.generatedAt !== "string" ||
    !payload.report.freshness.generatedAt.trim() ||
    typeof payload.html !== "string" ||
    typeof payload.filename !== "string" ||
    !Array.isArray(payload.availablePeriods) ||
    payload.availablePeriods.some((period) => !/^\d{4}-\d{2}$/.test(period))
  ) {
    throw new Error("The report service returned an unsupported report.");
  }
  return payload as FullReportPackage;
}

function validateReportDefinitions(value: unknown): FullReportDefinitionsResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The report service returned an invalid catalog.");
  }
  const payload = value as Partial<FullReportDefinitionsResponse>;
  if (
    payload.version !== "governed-full-report-v1" ||
    !Array.isArray(payload.reports) ||
    payload.reports.length !== 7 ||
    payload.reports.some(
      (report) =>
        !report ||
        typeof report.id !== "string" ||
        typeof report.title !== "string" ||
        typeof report.showInAnalyticsNav !== "boolean" ||
        typeof report.description !== "string"
    )
  ) {
    throw new Error("The report service returned an unsupported catalog.");
  }
  return payload as FullReportDefinitionsResponse;
}

export function fetchFullReportDefinitions(signal?: AbortSignal) {
  return fetchWithApiAuth<FullReportDefinitionsResponse>(
    "/api/reports/full/definitions",
    {
      method: "GET",
      cache: "no-store",
      ...(signal ? { signal } : {}),
      headers: { "cache-control": "no-cache" }
    },
    {
      consume: async (response) => {
        const payload = await readBoundedJsonResponse<unknown>(response);
        if (!response.ok) {
          throw new Error(`Report catalog failed to load (${response.status}).`);
        }
        return validateReportDefinitions(payload);
      }
    }
  );
}

export function createFullReport(
  request: FullReportRequest,
  signal?: AbortSignal
) {
  return fetchWithApiAuth<FullReportPackage>(
    "/api/reports/full/create",
    {
      method: "POST",
      cache: "no-store",
      ...(signal ? { signal } : {}),
      headers: {
        "content-type": "application/json",
        "cache-control": "no-cache"
      },
      body: JSON.stringify(request)
    },
    {
      timeoutMs: 45_000,
      consume: async (response) => {
        const payload = await readBoundedJsonResponse<unknown>(response);
        if (!response.ok) {
          const message =
            payload && typeof payload === "object" && "message" in payload
              ? String(payload.message)
              : `Report generation failed (${response.status}).`;
          throw new Error(message);
        }
        return validateReportPackage(payload);
      }
    }
  );
}

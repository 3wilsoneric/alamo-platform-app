import { createHttpError } from "./http-errors.mjs";
import { getExecutiveDirectorIncidents } from "./executive-director-incidents.mjs";

const PARAMETERS = new Set(["facilityId", "q", "category", "type", "priority", "year", "sort", "from", "to", "cursor", "limit"]);

/** Portfolio readers use the same governed record source as the facility-scoped register. */
export function getPlatformIncidentHistory(requestUrl, dependencies = {}) {
  for (const key of requestUrl.searchParams.keys()) {
    if (!PARAMETERS.has(key) || requestUrl.searchParams.getAll(key).length !== 1) {
      throw createHttpError(400, "platform_incidents_query_invalid", "Incident history parameters are invalid.");
    }
  }
  return getExecutiveDirectorIncidents({
    facilityId: requestUrl.searchParams.get("facilityId") || "all",
    query: requestUrl.searchParams.get("q"),
    category: requestUrl.searchParams.get("category"),
    incidentType: requestUrl.searchParams.get("type"),
    priority: requestUrl.searchParams.get("priority"),
    year: requestUrl.searchParams.get("year"),
    sort: requestUrl.searchParams.get("sort"),
    from: requestUrl.searchParams.get("from"),
    to: requestUrl.searchParams.get("to"),
    cursor: requestUrl.searchParams.get("cursor"),
    limit: requestUrl.searchParams.get("limit")
  }, { ...dependencies, allowPortfolio: true });
}

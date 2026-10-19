import { createHttpError } from "./http-errors.mjs";
import { getExecutiveDirectorIncidents } from "./executive-director-incidents.mjs";
import { readIncidentHistoryQuery } from "./incident-history-query.mjs";

const PARAMETERS = new Set(["facilityId", "q", "residentId", "clientQuery", "clientOffset", "category", "type", "priority", "year", "sort", "from", "to", "cursor", "limit"]);

/** Portfolio readers use the same governed record source as the facility-scoped register. */
export function getPlatformIncidentHistory(requestUrl, dependencies = {}) {
  for (const key of requestUrl.searchParams.keys()) {
    if (!PARAMETERS.has(key) || requestUrl.searchParams.getAll(key).length !== 1) {
      throw createHttpError(400, "platform_incidents_query_invalid", "Incident history parameters are invalid.");
    }
  }
  return getExecutiveDirectorIncidents({
    facilityId: requestUrl.searchParams.get("facilityId") || "all",
    ...readIncidentHistoryQuery(requestUrl.searchParams)
  }, { ...dependencies, allowPortfolio: true });
}

/** Read the shared incident filters after each route has applied its own access and parameter checks. */
export function readIncidentHistoryQuery(searchParams) {
  return {
    query: searchParams.get("q"),
    residentId: searchParams.get("residentId"),
    clientQuery: searchParams.get("clientQuery"),
    clientOffset: searchParams.get("clientOffset"),
    category: searchParams.get("category"),
    incidentType: searchParams.get("type"),
    priority: searchParams.get("priority"),
    year: searchParams.get("year"),
    sort: searchParams.get("sort"),
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    cursor: searchParams.get("cursor"),
    limit: searchParams.get("limit")
  };
}

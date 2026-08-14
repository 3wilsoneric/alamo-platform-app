export function projectCommunityCensusSnapshot(payload) {
  return {
    ...payload,
    incidentTrend: [],
    topIncidentCategories: [],
    incidentDetails: [],
    diagnosisMix: [],
    longestStayResidents: []
  };
}

function monthKey(row) {
  const explicit = String(row?.month_bucket ?? "").slice(0, 7);
  if (/^20\d{2}-\d{2}$/.test(explicit)) return explicit;
  const dated = String(row?.incident_date ?? row?.received_at ?? row?.event_date ?? "");
  return dated.match(/\b20\d{2}-\d{2}\b/)?.[0] ?? null;
}

export function getGovernedIncidentDetailRows(communities = {}, reportsSummary = {}) {
  const candidates = [
    reportsSummary?.toolContext?.incidentDetailHistory,
    reportsSummary?.toolContext?.tables?.incident_detail_history,
    reportsSummary?.toolContext?.currentIncidentDetails,
    reportsSummary?.toolContext?.tables?.incident_detail_current_month,
    communities?.incidentDetails
  ].filter((rows) => Array.isArray(rows) && rows.length > 0);

  if (!candidates.length) return [];

  return candidates.sort((left, right) => {
    const leftMonths = new Set(left.map(monthKey).filter(Boolean)).size;
    const rightMonths = new Set(right.map(monthKey).filter(Boolean)).size;
    return rightMonths - leftMonths || right.length - left.length;
  })[0];
}

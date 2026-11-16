// The same governed community/week table used by Platform Admissions. Never
// infer zero from an absent row, or copy resident names from the source table.
export function pipelineWeeklyMovement(snapshot, communities, dataAsOf) {
  const source = snapshot?.reportsSummary?.toolContext?.tables?.resident_flow_weekly_by_community;
  if (!Array.isArray(source)) return [];
  const rows = source.filter(row => row && typeof row === "object");
  const day = value => {
    const text = typeof value === "string" ? value.slice(0, 10) : "";
    const parsed = new Date(`${text}T00:00:00Z`);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text && parsed.getUTCDay() === 1 ? text : null;
  };
  const weeks = [...new Set(rows.map(row => day(row.week_start)).filter(value => value && value <= dataAsOf))].sort().slice(-12);
  const count = value => (typeof value === "number" || typeof value === "string") && String(value).trim() !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  return weeks.map(week_start => {
    const end = new Date(`${week_start}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() + 6);
    const week_end = end.toISOString().slice(0, 10);
    const values = communities.map(({ community_id, community_name }) => {
      const matching = rows.filter(row => day(row.week_start) === week_start && String(row.facility_id ?? row.Facility) === community_id);
      const row = matching.length === 1 ? matching[0] : null;
      return { community_id, community_name, admissions: count(row?.admissions), discharges: count(row?.discharges) };
    });
    return { week_start, week_end, complete: week_end < dataAsOf && values.every(row => row.admissions !== null && row.discharges !== null), communities: values };
  });
}

function getMedicationWatchSignal(row, { formatNumber, formatPercent }) {
  const signals = [
    Number(row.refusals30 || 0) > 0 ? `${formatNumber(row.refusals30)} refusal${Number(row.refusals30) === 1 ? "" : "s"} in 30 days` : null,
    Number(row.notGiven30 || 0) > 0 ? `${formatNumber(row.notGiven30)} not given in 30 days` : null,
    row.compliancePct != null && Number(row.compliancePct) < 90 ? `${formatPercent(row.compliancePct)} compliance` : null,
    Number(row.prnGiven30 || 0) > 0 ? `${formatNumber(row.prnGiven30)} PRN given in 30 days` : null
  ].filter(Boolean);
  return signals[0] ?? "MAR summary loaded";
}

export function createMedicationWatchTools({
  filterByFacility,
  findFacility,
  fingerprintRows,
  formatDateLabel,
  formatNumber,
  formatPercent,
  getFacilityLabel,
  getFacilityNameById,
  getMarResidentSummaryRows,
  getResidentRows,
  limitRowsForRequest,
  makeTrace,
  normalizeMonthBucket
}) {
  function buildMedicationWatchTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const hasGovernedMar = getMarResidentSummaryRows(reportsSummary).length > 0;
    const signalOptions = { formatNumber, formatPercent };
    const residents = filterByFacility(getResidentRows(communities, reportsSummary), facility)
      .map((resident) => {
        const compliancePct = resident.mar_compliance_pct_30d == null ? null : Number(resident.mar_compliance_pct_30d);
        const refusals30 = Number(resident.mar_refusals_30d || 0);
        const notGiven30 = Number(resident.mar_not_given_30d || 0);
        const prnGiven30 = Number(resident.mar_prn_given_30d || 0);
        const lowCompliancePenalty = compliancePct == null ? 0 : Math.max(0, 92 - compliancePct) * 2;
        const score = (refusals30 * 4) + (notGiven30 * 2) + (prnGiven30 * 0.5) + lowCompliancePenalty;
        return {
          ...resident,
          residentName: [resident.first_name, resident.last_name].filter(Boolean).join(" ").trim() || resident.res_number || "Resident",
          communityName: resident.facility_name || getFacilityNameById(communities, resident.facility_id),
          activeMedicationCount: Number(resident.active_medication_count || 0),
          compliancePct,
          refusals30,
          notGiven30,
          prnGiven30,
          lastMarRecord: resident.last_mar_recorded_date ?? null,
          score
        };
      })
      .filter((resident) =>
        resident.activeMedicationCount > 0 ||
        Number(resident.mar_scheduled_30d || 0) > 0 ||
        resident.compliancePct != null ||
        resident.refusals30 > 0 ||
        resident.notGiven30 > 0
      )
      .sort((left, right) => right.score - left.score ||
        right.refusals30 - left.refusals30 ||
        right.notGiven30 - left.notGiven30 ||
        String(left.residentName).localeCompare(String(right.residentName)));

    if (!hasGovernedMar) {
      return {
        handled: true,
        tool: "medication_watch",
        truthState: "not_loaded",
        text: `${label} medication watch\nResident-level MAR summaries are not published in the current data bundle.`,
        trace: makeTrace({
          tool: "medication_watch",
          dataSource: "governed MAR resident summary rows",
          rowCount: 0,
          facility,
          truthState: "not_loaded"
        }),
        visual: {
          type: "table",
          title: `${label} Medication Watch`,
          subtitle: "Resident-level MAR summary unavailable",
          valueLabel: "Residents",
          columns: ["Status", "Records", "Next step"],
          rows: [{
            label: "Unavailable",
            value: 0,
            cells: ["Unavailable", "0", "Publish resident-level MAR summary data to enable this view."]
          }]
        },
        actions: []
      };
    }

    const visibleRows = limitRowsForRequest(residents, content, 10, 100);
    const top = residents[0] ?? null;
    const latestMarDate = [...new Set(residents.map((resident) => resident.lastMarRecord).filter(Boolean))].sort().at(-1) ?? null;
    const rowSetId = fingerprintRows(
      residents,
      `medication-watch:${facility?.facility_id ?? "portfolio"}:${latestMarDate ?? "current"}`
    );

    return {
      handled: true,
      tool: "medication_watch",
      text: [
        `${label} medication watch`,
        residents.length
          ? `${formatNumber(residents.length)} current resident MAR summary row${residents.length === 1 ? "" : "s"} checked${latestMarDate ? `; latest MAR record ${formatDateLabel(latestMarDate)}` : ""}.`
          : "No current resident MAR summary rows matched this scope.",
        top
          ? `Top watch row: ${top.residentName} — ${getMedicationWatchSignal(top, signalOptions)}.`
          : null
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool: "medication_watch",
        dataSource: "governed MAR resident summary rows",
        rowCount: residents.length,
        facility,
        period: latestMarDate ? normalizeMonthBucket(latestMarDate) : null,
        note: `rowSetId=${rowSetId}`,
        truthState: residents.length ? "valid_rows" : "verified_zero"
      }),
      provenance: {
        rowSetId,
        rowCount: residents.length,
        dataset: "mar_resident_summary"
      },
      visual: {
        type: "table",
        title: `${label} Medication Watch`,
        subtitle: latestMarDate ? `Latest MAR record ${formatDateLabel(latestMarDate)}` : "Current resident MAR summary",
        valueLabel: "Watch score",
        originalRowCount: residents.length,
        columns: ["Resident", "Community", "Unit", "Signal", "Compliance", "Not given 30d", "Refusals 30d", "PRN 30d", "Active meds", "Last MAR"],
        rows: visibleRows.map((resident) => ({
          label: resident.residentName,
          value: Number(resident.score || 0),
          cells: [
            resident.residentName,
            resident.communityName,
            resident.unit_number || "—",
            getMedicationWatchSignal(resident, signalOptions),
            resident.compliancePct == null ? "—" : formatPercent(resident.compliancePct),
            formatNumber(resident.notGiven30),
            formatNumber(resident.refusals30),
            formatNumber(resident.prnGiven30),
            formatNumber(resident.activeMedicationCount),
            resident.lastMarRecord ? formatDateLabel(resident.lastMarRecord) : "—"
          ]
        }))
      },
      actions: [
        { label: `Show ${label} refusal detail`, kind: "tool", tool: "medication_exception_detail", prompt: `show ${label} medication refusal detail` },
        { label: `Show ${label} compliance`, kind: "tool", tool: "medication_compliance", prompt: `show ${label} medication compliance latest month` }
      ]
    };
  }

  return {
    buildMedicationWatchTool
  };
}

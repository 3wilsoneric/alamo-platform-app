function getMedicationWatchSignal(row, { formatNumber }) {
  return `${formatNumber(row.given30 || 0)} administrations given in 30 days`;
}

export function createMedicationWatchTools({
  filterByFacility,
  findFacility,
  fingerprintRows,
  formatDateLabel,
  formatNumber,
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
    const signalOptions = { formatNumber };
    const residents = filterByFacility(getResidentRows(communities, reportsSummary), facility)
      .map((resident) => {
        const given30 = Number(resident.mar_given_30d || 0);
        return {
          ...resident,
          residentName: [resident.first_name, resident.last_name].filter(Boolean).join(" ").trim() || resident.res_number || "Resident",
          communityName: resident.facility_name || getFacilityNameById(communities, resident.facility_id),
          activeMedicationCount: Number(resident.active_medication_count || 0),
          given30,
          lastMarRecord: resident.last_mar_recorded_date ?? null,
          score: given30
        };
      })
      .filter((resident) =>
        resident.activeMedicationCount > 0 ||
        Number(resident.mar_scheduled_30d || 0) > 0 ||
        resident.given30 > 0
      )
      .sort((left, right) => right.given30 - left.given30 ||
        String(left.residentName).localeCompare(String(right.residentName)));

    if (!hasGovernedMar) {
      return {
        handled: true,
        tool: "medication_watch",
        truthState: "not_loaded",
        text: `${label} administrations given by resident are not available because resident-level MAR summaries are not published in the current data bundle.`,
        trace: makeTrace({
          tool: "medication_watch",
          dataSource: "governed MAR resident summary rows",
          rowCount: 0,
          facility,
          truthState: "not_loaded"
        }),
        visual: {
          type: "table",
          title: `${label} Administrations by Resident`,
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
        `${label} administrations by resident`,
        residents.length
          ? `${formatNumber(residents.length)} current resident MAR summary row${residents.length === 1 ? "" : "s"} checked${latestMarDate ? `; latest MAR record ${formatDateLabel(latestMarDate)}` : ""}.`
          : "No current resident MAR summary rows matched this scope.",
        top
          ? `${top.residentName}: ${getMedicationWatchSignal(top, signalOptions)}.`
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
        title: `${label} Administrations by Resident`,
        subtitle: latestMarDate ? `Latest MAR record ${formatDateLabel(latestMarDate)}` : "Current resident MAR summary",
        valueLabel: "Given 30d",
        originalRowCount: residents.length,
        columns: ["Resident", "Community", "Unit", "Signal", "Given 30d", "Last MAR"],
        rows: visibleRows.map((resident) => ({
          label: resident.residentName,
          value: Number(resident.score || 0),
          cells: [
            resident.residentName,
            resident.communityName,
            resident.unit_number || "—",
            getMedicationWatchSignal(resident, signalOptions),
            formatNumber(resident.given30),
            resident.lastMarRecord ? formatDateLabel(resident.lastMarRecord) : "—"
          ]
        }))
      },
      actions: [{ label: `Show ${label} administrations given`, kind: "tool", tool: "medication_compliance", prompt: `show ${label} medication administrations given latest month` }]
    };
  }

  return {
    buildMedicationWatchTool
  };
}

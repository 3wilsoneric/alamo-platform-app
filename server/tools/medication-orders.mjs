export function createMedicationOrderTools({
  countBy,
  displayValue,
  filterByFacility,
  findFacility,
  fingerprintRows,
  formatDateLabel,
  formatNumber,
  getMarMedicationOrderRows,
  makePreviewTableVisual,
  makeTrace,
  rowsToCsv
}) {
  function buildMedicationOrdersTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const rows = filterByFacility(getMarMedicationOrderRows(reportsSummary), facility)
      .sort((left, right) =>
        String(left.resident_name ?? "").localeCompare(String(right.resident_name ?? "")) ||
        String(left.medication ?? "").localeCompare(String(right.medication ?? ""))
      );
    const residents = new Set(rows.map((row) => row.resident_id).filter(Boolean));
    const topMedications = countBy(rows, (row) => row.medication || "Unspecified medication").slice(0, 5);
    const prnCount = rows.filter((row) => row.is_prn).length;
    const psychotropicCount = rows.filter((row) => row.is_psychotropic).length;
    const narcoticCount = rows.filter((row) => row.is_narcotic).length;
    const heldCount = rows.filter((row) => row.is_on_hold).length;
    const rowSetId = fingerprintRows(rows, `mar-current-orders:${facility?.facility_id ?? "portfolio"}`);
    const truthState = rows.length ? "valid_rows" : "not_loaded";
    const visualRows = rows.map((row) => ({
      label: row.resident_name || row.resident_id || "Resident",
      value: 1,
      cells: [
        row.resident_name || row.resident_id || "—",
        row.facility_name || label,
        row.medication || "—",
        row.dosage,
        row.route,
        row.schedule || row.passing_times,
        row.indication,
        [
          row.is_prn ? "PRN" : null,
          row.is_psychotropic ? "Psychotropic" : null,
          row.is_narcotic ? "Narcotic" : null,
          row.is_on_hold ? "On hold" : null
        ].filter(Boolean).join(", ") || "Active",
        row.effective_date ? formatDateLabel(row.effective_date) : "—",
        row.prescription_end_date ? formatDateLabel(row.prescription_end_date) : "—"
      ].map(displayValue)
    }));

    return {
      handled: true,
      tool: "medication_orders_current",
      truthState,
      text: rows.length
        ? [
            `${label} has ${formatNumber(rows.length)} current medication orders for ${formatNumber(residents.size)} residents.`,
            `- ${formatNumber(prnCount)} are PRN orders.`,
            `- ${formatNumber(psychotropicCount)} are psychotropic orders.`,
            `- ${formatNumber(narcoticCount)} are narcotic orders.`,
            heldCount ? `- ${formatNumber(heldCount)} are on hold.` : null,
            topMedications.length
              ? `The most common current medications are ${topMedications.map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.`
              : null
          ].filter(Boolean).join("\n")
        : `Resident-level current medication orders are not published for ${label}.`,
      trace: makeTrace({
        tool: "medication_orders_current",
        dataSource: "governed current medication orders",
        rowCount: rows.length,
        facility,
        note: `residents=${residents.size}; prn=${prnCount}; psychotropic=${psychotropicCount}; narcotic=${narcoticCount}`,
        truthState
      }),
      visual: rows.length ? makePreviewTableVisual({
        title: `${label} Current Medication Orders`,
        subtitle: `${formatNumber(rows.length)} orders · ${formatNumber(residents.size)} residents`,
        valueLabel: "Orders",
        columns: ["Resident", "Community", "Medication", "Dose", "Route", "Schedule", "Indication", "Flags", "Effective", "Ends"],
        rows: visualRows,
        totalRows: rows.length
      }) : {
        type: "table",
        title: `${label} Current Medication Orders`,
        subtitle: "Current order detail unavailable",
        valueLabel: "Orders",
        columns: ["Status", "Orders"],
        rows: [{ label: "Unavailable", value: 0, cells: ["Unavailable", "0"], meta: "not_loaded" }]
      },
      artifact: rows.length ? {
        type: "csv",
        filename: `${label}-current-medication-orders.csv`.toLowerCase().replace(/[^a-z0-9.]+/g, "-").replace(/^-|-$/g, ""),
        mimeType: "text/csv",
        content: rowsToCsv(rows),
        rowSetId,
        rowCount: rows.length
      } : undefined,
      provenance: rows.length ? {
        rowSetId,
        rowCount: rows.length,
        dataset: "mar_medication_orders_current"
      } : undefined,
      actions: []
    };
  }

  return Object.freeze({ buildMedicationOrdersTool });
}

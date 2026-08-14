const MEDICATION_TOOL_NAMES = Object.freeze([
  "ad_hoc_medication_chart",
  "medication_profile",
  "medication_watch",
  "medication_compliance",
  "medication_refusals_by_community",
  "medication_orders_current",
  "medication_exception_detail"
]);

export function createMedicationExceptionTools({
  buildUnavailablePeriodResult,
  countBy,
  displayValue,
  filterByFacility,
  findFacility,
  findResident,
  fingerprintRows,
  formatDateLabel,
  formatMonthLabel,
  formatNumber,
  getFacilityNameById,
  getMarExceptionDetailRows,
  getMarPrnEffectivenessRows,
  getPortfolioFallbackScopes,
  getRequestedMedicationName,
  getRequestedMonthBuckets,
  getResidentRows,
  makePreviewTableVisual,
  makeTrace,
  medicationMatches,
  normalizeText,
  rowsToCsv
}) {
  function formatMedicationTime(value) {
    if (value == null || value === "") return "—";
    const text = String(value).trim();
    if (!text || text === "0") return "—";
    if (/[ap]\.?m\.?|:/.test(text.toLowerCase())) return text;

    const numeric = Number(text);
    if (!Number.isFinite(numeric) || numeric <= 0 || numeric >= 24 * 60 * 60 * 1000) return text;

    const totalMinutes = Math.round(numeric / 60000);
    const hours24 = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    const suffix = hours24 >= 12 ? "PM" : "AM";
    const hours12 = hours24 % 12 || 12;
    return `${hours12}:${String(minutes).padStart(2, "0")} ${suffix}`;
  }

  function getMedicationExceptionKind(content) {
    const text = normalizeText(content);
    if (/\b(refusal|refusals|refused)\b/.test(text)) return "refusal";
    if (/\b(late|over 60|over sixty|delayed)\b/.test(text)) return "late";
    if (/\b(hold|held|on hold)\b/.test(text)) return "held";
    if (/\b(prn)\b/.test(text)) return "prn";
    if (/\b(not given|missed)\b/.test(text)) return "not_given";
    return "exception";
  }

  function filterMedicationExceptionRowsByKind(rows, kind) {
    const searchableText = (row) => normalizeText([
      row.not_given_reason,
      row.missed_or_held_reason,
      row.administration_outcome,
      row.outcome_category,
      row.administration_note
    ].filter(Boolean).join(" "));

    if (kind === "refusal") {
      return rows.filter((row) =>
        row.is_refusal ||
        /\brefus/.test(searchableText(row))
      );
    }
    if (kind === "late") {
      return rows.filter((row) => row.is_over_60_minutes_late || Number(row.minutes_late || 0) > 60);
    }
    if (kind === "held") {
      return rows.filter((row) =>
        row.is_on_hold ||
        /\bhold|held\b/.test(searchableText(row))
      );
    }
    if (kind === "prn") {
      return rows.filter((row) => row.is_prn);
    }
    if (kind === "not_given") {
      return rows.filter((row) => /\bnot given|missed\b/.test(searchableText(row)));
    }
    return rows;
  }

  function formatRankedSentences(items, noun = "entries") {
    return items.map(([name, count]) =>
      `- ${name} had ${formatNumber(count)} ${noun}.`
    );
  }

  function buildMedicationExceptionDetailTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const kind = getMedicationExceptionKind(content);
    const portfolioExceptionRows = kind === "prn"
      ? getMarPrnEffectivenessRows(reportsSummary)
      : getMarExceptionDetailRows(reportsSummary);
    const detailSource = kind === "prn"
      ? "governed MAR 90-day PRN effectiveness rows"
      : "governed MAR 90-day exception rows";
    const dataset = kind === "prn" ? "mar_prn_effectiveness_90d" : "mar_exception_detail_90d";
    const allRows = filterByFacility(portfolioExceptionRows, facility)
      .sort((left, right) => String(right.administration_date ?? right.recorded_date ?? "").localeCompare(String(left.administration_date ?? left.recorded_date ?? "")));
    const availableMonths = [...new Set(allRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    const activeMonths = requestedMonths.length ? requestedMonths : availableMonths;

    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "medication_exception_detail",
        label,
        subject: "MAR exception detail",
        dataSource: detailSource,
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, portfolioExceptionRows),
        facility,
        note: "requested period unavailable"
      });
    }

    const residentRows = getResidentRows(communities, reportsSummary);
    const resident = findResident(content, { ...communities, residents: residentRows });
    const requestedMedication = getRequestedMedicationName(content, allRows);
    const periodRows = activeMonths.length
      ? allRows.filter((row) => activeMonths.includes(row.month_bucket))
      : allRows;
    const residentRowsFiltered = resident
      ? periodRows.filter((row) =>
          row.facility_id === resident.facility_id &&
          (row.resident_id === resident.res_number || normalizeText(row.resident_name) === normalizeText(`${resident.first_name} ${resident.last_name}`))
        )
      : periodRows;
    const medicationRows = requestedMedication
      ? residentRowsFiltered.filter((row) => medicationMatches(row, requestedMedication))
      : residentRowsFiltered;
    const rows = filterMedicationExceptionRowsByKind(medicationRows, kind);
    const rowSetId = fingerprintRows(rows, `mar-exceptions:${facility?.facility_id ?? "portfolio"}:${activeMonths.join("-") || "90d"}:${resident?.res_number ?? "all"}:${requestedMedication ?? "all"}:${kind}`);
    const periodLabel = (requestedMonths.length ? requestedMonths : activeMonths).length
      ? (requestedMonths.length ? requestedMonths : activeMonths).map(formatMonthLabel).join(" and ")
      : "past 90 days";
    const kindLabel = kind === "refusal"
      ? "refusal"
      : kind === "late"
      ? "late administration"
      : kind === "held"
      ? "held/on-hold"
      : kind === "prn"
      ? "PRN"
      : kind === "not_given"
      ? "not-given"
      : "exception";
    const residentLabel = resident ? `${resident.first_name} ${resident.last_name}`.trim() : null;
    const titleScope = [label, residentLabel, requestedMedication, `${kindLabel} detail`].filter(Boolean).join(" · ");
    const visualRows = rows.map((row) => {
      const reason = row.not_given_reason || row.missed_or_held_reason || row.prn_reason || row.administration_note || "—";
      const medicationLabel = [row.medication, row.dosage].filter(Boolean).join(" ");
      const prnResult = row.prn_result
        ? [row.prn_result, row.prn_result_date ? formatDateLabel(row.prn_result_date) : null].filter(Boolean).join(" · ")
        : "—";
      return {
        label: row.resident_name || row.resident_id || "Resident",
        value: row.is_refusal ? 1 : Number(row.minutes_late || 0),
        cells: [
          formatDateLabel(row.administration_date ?? row.scheduled_date),
          row.facility_name || getFacilityNameById(communities, row.facility_id),
          row.resident_name || row.resident_id || "—",
          medicationLabel || "—",
          row.route || "—",
          row.administration_outcome || row.outcome_category || "—",
          reason,
          formatMedicationTime(row.scheduled_time),
          prnResult
        ].map(displayValue)
      };
    });
    const topResidents = countBy(rows, (row) => row.resident_name || row.resident_id || "Unknown resident").slice(0, 5);
    const topMedications = countBy(rows, (row) => row.medication || "Unspecified medication").slice(0, 5);
    const resultTruthState = rows.length
      ? "valid_rows"
      : portfolioExceptionRows.length
        ? "verified_zero"
        : "not_loaded";

    return {
      handled: true,
      tool: "medication_exception_detail",
      truthState: resultTruthState,
      text: [
        resultTruthState === "not_loaded"
          ? `MAR exception detail is not published for ${label}.`
          : `There ${rows.length === 1 ? "is" : "are"} ${rows.length ? formatNumber(rows.length) : "0 verified"} governed MAR ${kindLabel} record${rows.length === 1 ? "" : "s"} for ${periodLabel}.`,
        residentLabel ? `Resident filter: ${residentLabel}.` : null,
        requestedMedication ? `Medication filter: ${requestedMedication}.` : null,
        ...formatRankedSentences(topResidents),
        ...formatRankedSentences(topMedications)
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool: "medication_exception_detail",
        dataSource: detailSource,
        rowCount: rows.length,
        facility,
        period: activeMonths.join(", "),
        note: [
          `kind=${kind}`,
          kind === "refusal" ? "category=Medication Refusal" : null,
          resident?.res_number ? `resident=${resident.res_number}` : null,
          requestedMedication ? `medication=${requestedMedication}` : null,
          `rowSetId=${rowSetId}`
        ].filter(Boolean).join("; "),
        truthState: resultTruthState
      }),
      visual: rows.length ? makePreviewTableVisual({
        title: `${titleScope || "MAR Exception Detail"}`,
        subtitle: `${periodLabel} · ${formatNumber(rows.length)} records`,
        valueLabel: "Records",
        columns: ["Date", "Community", "Resident", "Medication", "Route", "Outcome", "Reason / note", "Scheduled", "PRN result"],
        rows: visualRows,
        totalRows: rows.length
      }) : {
        type: "table",
        title: `${titleScope || "MAR Exception Detail"}`,
        subtitle: resultTruthState === "not_loaded" ? `${periodLabel} · detail unavailable` : `${periodLabel} · no matching records`,
        valueLabel: "Records",
        columns: ["Status", "Records"],
        rows: [{
          label: resultTruthState === "not_loaded" ? "Unavailable" : "No matching records",
          value: 0,
          cells: [resultTruthState === "not_loaded" ? "Unavailable" : "No matching records", "0"],
          meta: resultTruthState
        }]
      },
      artifact: rows.length ? {
        type: "csv",
        filename: `${titleScope || "mar-exception-detail"}-${activeMonths.join("-") || "90d"}`
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "") + ".csv",
        mimeType: "text/csv",
        content: rowsToCsv(rows),
        rowSetId,
        rowCount: rows.length
      } : undefined,
      provenance: rows.length ? {
        rowSetId,
        rowCount: rows.length,
        dataset
      } : undefined
    };
  }

  return {
    buildMedicationExceptionDetailTool
  };
}

export function createMedicationToolDefinitions(handlers) {
  return MEDICATION_TOOL_NAMES.map((name) => {
    const handler = handlers[name];
    if (typeof handler !== "function") {
      throw new TypeError(`Medication tool ${name} requires a handler.`);
    }
    return Object.freeze({ name, domain: "medications", handler });
  });
}

export { MEDICATION_TOOL_NAMES };

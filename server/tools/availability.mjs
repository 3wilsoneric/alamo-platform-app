import { parseRequestedMonthBuckets } from "../../shared/period-utils.mjs";
import { getReportingDateKey } from "../../shared/reporting-date.mjs";

const AVAILABILITY_TOOL_NAMES = Object.freeze([
  "data_availability"
]);

function getDateOnlyKey(value) {
  if (!value) return null;
  const text = String(value);
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function daysBetweenDateKeys(left, right) {
  if (!left || !right) return null;
  const leftDate = new Date(`${left}T00:00:00Z`);
  const rightDate = new Date(`${right}T00:00:00Z`);
  if (Number.isNaN(leftDate.getTime()) || Number.isNaN(rightDate.getTime())) return null;
  return Math.max(0, Math.round((rightDate.getTime() - leftDate.getTime()) / 86400000));
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort();
}

export function createAvailabilityTools(dependencies) {
  const {
    fingerprintRows,
    firstPresent,
    formatDateLabel,
    formatMonthLabel,
    formatNumber,
    getDocumentationRows,
    getIncidentDetailRows,
    getIncidentRows,
    getMarExceptionRows,
    getMarMonthlyRows,
    getMarResidentSummaryRows,
    getMedicationComplianceRows,
    getMedicationRefusalRows,
    getResidentRows,
    isIncidentFreshnessIntent,
    makeTrace,
    normalizeMonthBucket,
    normalizeText,
    rowsToCsv,
    sum
  } = dependencies;

  function buildIncidentFreshnessTool(communities, reportsSummary, prepared = {}) {
    const incidentDetailRows = prepared.incidentDetailRows ?? getIncidentDetailRows(communities, reportsSummary);
    const incidentRows = prepared.incidentRows ?? getIncidentRows(communities, reportsSummary);
    const incidentDates = prepared.incidentDates ?? incidentDetailRows
      .map((row) => firstPresent(row, ["incident_date", "received_at", "event_date"]))
      .filter(Boolean)
      .sort((left, right) => String(left).localeCompare(String(right)));
    const latestIncidentDate = prepared.latestIncidentDate ?? incidentDates.at(-1) ?? null;
    const latestDateKey = getDateOnlyKey(latestIncidentDate);
    const todayKey = getReportingDateKey();
    const latestLoadedMonth = normalizeMonthBucket(latestIncidentDate) ??
      [...new Set(incidentRows.map((row) => row.month_bucket).filter(Boolean))].sort().at(-1) ??
      null;
    const rowDate = (row) => getDateOnlyKey(firstPresent(row, ["incident_date", "received_at", "event_date", "date"]));
    const rowMonth = (row) => normalizeMonthBucket(firstPresent(row, ["month_bucket", "incident_date", "received_at", "event_date", "date"]));
    const todayRows = incidentDetailRows.filter((row) => rowDate(row) === todayKey);
    const latestDayRows = latestDateKey ? incidentDetailRows.filter((row) => rowDate(row) === latestDateKey) : [];
    const latestMonthDetailRows = latestLoadedMonth ? incidentDetailRows.filter((row) => rowMonth(row) === latestLoadedMonth) : [];
    const latestMonthMonthlyRows = latestLoadedMonth ? incidentRows.filter((row) => row.month_bucket === latestLoadedMonth) : [];
    const monthlyTotal = sum(latestMonthMonthlyRows, (row) => row.incident_count);
    const loadedPeriods = prepared.incidentDetailPeriods ?? [...new Set(
      incidentDetailRows
        .map((row) => normalizeMonthBucket(firstPresent(row, ["month_bucket", "incident_date", "received_at", "event_date"])))
        .filter(Boolean)
    )].sort();
    const lagDays = latestDateKey ? daysBetweenDateKeys(latestDateKey, todayKey) : null;
    const truthState = !latestIncidentDate
      ? "not_loaded"
      : latestDateKey === todayKey
        ? "valid_rows"
        : "stale";
    const status = !latestIncidentDate
      ? "No dated incident detail is currently available."
      : latestDateKey === todayKey
        ? `Incident detail is current through today (${formatDateLabel(latestDateKey)}).`
        : `Incident detail is available through ${formatDateLabel(latestIncidentDate)}, which is ${formatNumber(lagDays ?? 0)} day${lagDays === 1 ? "" : "s"} behind today (${formatDateLabel(todayKey)}).`;
    const rows = [
      { label: "Latest incident detail date", value: latestIncidentDate ? 1 : 0, cells: ["Latest incident detail date", latestIncidentDate ? formatDateLabel(latestIncidentDate) : "-", latestIncidentDate ? formatDateLabel(latestIncidentDate) : "No dated incident detail"] },
      { label: "Incident records dated today", value: todayRows.length, cells: ["Incident records dated today", formatNumber(todayRows.length), formatDateLabel(todayKey)] },
      { label: "Lag to today", value: lagDays ?? 0, cells: ["Lag to today", latestIncidentDate ? `${formatNumber(lagDays ?? 0)} day${lagDays === 1 ? "" : "s"}` : "No dated incident detail", todayKey] },
      { label: "Incidents on most recent date", value: latestDayRows.length, cells: ["Incidents on most recent date", formatNumber(latestDayRows.length), latestDateKey ? formatDateLabel(latestDateKey) : "-"] },
      { label: "Most recent month detail", value: latestMonthDetailRows.length, cells: ["Most recent month detail", formatNumber(latestMonthDetailRows.length), latestLoadedMonth ? formatMonthLabel(latestLoadedMonth) : "-"] },
      { label: "Most recent month total", value: monthlyTotal, cells: ["Most recent month total", formatNumber(monthlyTotal), latestLoadedMonth ? formatMonthLabel(latestLoadedMonth) : "-"] },
      { label: "Detail coverage", value: incidentDetailRows.length, cells: ["Detail coverage", `${formatNumber(incidentDetailRows.length)} incidents`, `${formatNumber(loadedPeriods.length)} monthly periods`] },
      { label: "Snapshot generated", value: 0, cells: ["Snapshot generated", formatDateLabel(communities.generated_at ?? reportsSummary.generated_at), formatDateLabel(communities.generated_at ?? reportsSummary.generated_at)] }
    ];
    const rowSetId = fingerprintRows(rows);

    return {
      handled: true,
      tool: "data_availability",
      text: [
        "Incident freshness",
        latestIncidentDate ? `Most recent incident detail: ${formatDateLabel(latestIncidentDate)}.` : "Most recent incident detail: none.",
        status,
        todayRows.length
          ? `${formatNumber(todayRows.length)} incidents are dated today.`
          : latestIncidentDate
            ? `No incidents are dated today in the active snapshot; the most recent date is ${formatDateLabel(latestIncidentDate)}.`
            : "The active snapshot has no dated incident detail.",
        latestLoadedMonth ? `${formatMonthLabel(latestLoadedMonth)} has ${formatNumber(latestMonthDetailRows.length)} incident details and ${formatNumber(monthlyTotal)} aggregate incidents.` : null
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool: "data_availability",
        dataSource: "incident detail freshness",
        rowCount: incidentDetailRows.length,
        period: latestLoadedMonth,
        note: latestIncidentDate ? `latestIncidentDate=${latestIncidentDate}; today=${todayKey}; lagDays=${lagDays ?? 0}` : `today=${todayKey}; no incident detail date`,
        truthState
      }),
      visual: {
        type: "table",
        title: "Incident Freshness",
        subtitle: "Active snapshot incident-detail status",
        valueLabel: "Incidents",
        columns: ["Check", "Value", "Scope"],
        rows
      },
      artifact: {
        type: "csv",
        filename: "incident-freshness.csv",
        mimeType: "text/csv",
        content: rowsToCsv(rows.map((row) => ({
          check: row.cells[0],
          value: row.cells[1],
          scope: row.cells[2]
        }))),
        rowSetId,
        rowCount: rows.length
      },
      provenance: {
        rowSetId,
        rowCount: rows.length,
        dataset: "incident_freshness"
      },
      actions: [
        { label: "Open Incident Center", kind: "route", route: "/incidents" },
        ...(latestLoadedMonth ? [{
          label: `Show ${formatMonthLabel(latestLoadedMonth)} incidents`,
          kind: "tool",
          tool: "run_analysis",
          prompt: `show ${formatMonthLabel(latestLoadedMonth)} incidents`
        }] : []),
        { label: "Show data availability", kind: "tool", tool: "data_availability", prompt: "show loaded data availability" }
      ]
    };
  }

  function buildDataAvailabilityTool(content, communities, reportsSummary) {
    const censusRows = communities.census ?? [];
    const incidentRows = getIncidentRows(communities, reportsSummary);
    const incidentDetailRows = getIncidentDetailRows(communities, reportsSummary);
    const residentRows = getResidentRows(communities, reportsSummary);
    const complianceRows = getMedicationComplianceRows(reportsSummary);
    const refusalRows = getMedicationRefusalRows(reportsSummary);
    const documentationRows = getDocumentationRows(reportsSummary);
    const marMonthlyRows = getMarMonthlyRows(reportsSummary);
    const marResidentRows = getMarResidentSummaryRows(reportsSummary);
    const marExceptionRows = getMarExceptionRows(reportsSummary);
    const periodRange = (rows) => {
      const periods = uniqueSorted(rows.map((row) => normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month", "month"]))));
      return {
        earliest: periods.at(0) ?? null,
        latest: periods.at(-1) ?? null
      };
    };
    const periodsForRows = (rows) => uniqueSorted(rows.map((row) => normalizeMonthBucket(firstPresent(row, ["month_bucket", "reporting_month", "month", "incident_date", "received_at", "event_date"]))));
    const incidentDates = incidentDetailRows
      .map((row) => firstPresent(row, ["incident_date", "received_at", "event_date"]))
      .filter(Boolean)
      .sort((left, right) => String(left).localeCompare(String(right)));
    const coverageRows = [
      ["Incident detail", "incident events", incidentDetailRows.length, incidentDates.at(0), incidentDates.at(-1)],
      ["Incident monthly", "community × category × month", incidentRows.length, periodRange(incidentRows).earliest, periodRange(incidentRows).latest],
      ["Census monthly", "community × month", censusRows.length, periodRange(censusRows).earliest, periodRange(censusRows).latest],
      ["Resident roster", "current resident", residentRows.length, null, communities.generated_at ?? null],
      ["Medication compliance", "community × month", complianceRows.length, periodRange(complianceRows).earliest, periodRange(complianceRows).latest],
      ["Medication refusals", "medication summary", refusalRows.length, periodRange(refusalRows).earliest, periodRange(refusalRows).latest],
      ["MAR monthly", "community × medication × month", marMonthlyRows.length, periodRange(marMonthlyRows).earliest, periodRange(marMonthlyRows).latest],
      ["MAR resident summary", "current resident medication", marResidentRows.length, null, reportsSummary.generated_at ?? communities.generated_at ?? null],
      ["MAR exceptions", "90-day medication exception detail", marExceptionRows.length, periodRange(marExceptionRows).earliest, periodRange(marExceptionRows).latest],
      ["Documentation gaps", "current resident status", documentationRows.length, null, reportsSummary.generated_at ?? communities.generated_at ?? null]
    ].map(([dataset, grain, rowCount, earliest, latest]) => ({
      dataset,
      grain,
      rowCount: Number(rowCount || 0),
      earliest,
      latest
    }));
    const latestIncidentDate = incidentDates.at(-1) ?? null;
    const incidentDetailPeriods = uniqueSorted(
      incidentDetailRows
        .map((row) => normalizeMonthBucket(firstPresent(row, ["month_bucket", "incident_date", "received_at"])))
        .filter(Boolean)
    );
    const coverageFocusText = normalizeText(content);
    const incidentDetailFocus = /\b(incident|incidents)\b/.test(coverageFocusText) &&
      /\b(detail|details|rows?|loaded|available|history|period|periods|coverage|range)\b/.test(coverageFocusText);
    const focusedDatasetNames = (() => {
      if (incidentDetailFocus) return ["Incident detail"];
      if (/\b(census|occupancy|headcount|population)\b/.test(coverageFocusText)) return ["Census monthly"];
      if (/\b(resident|residents|client|clients|roster)\b/.test(coverageFocusText)) return ["Resident roster"];
      if (/\b(documentation|doc gap|doc gaps|notes?)\b/.test(coverageFocusText)) return ["Documentation gaps"];
      if (/\b(medication|meds|compliance|refusal|refusals|not given)\b/.test(coverageFocusText)) return ["Medication compliance", "Medication refusals"];
      return [];
    })();
    const displayedCoverageRows = focusedDatasetNames.length
      ? coverageRows.filter((row) => focusedDatasetNames.includes(row.dataset))
      : coverageRows;
    const coverageFocusLabel = focusedDatasetNames.length
      ? focusedDatasetNames.join(" and ")
      : null;
    const formatCoverageValue = (value) => /^20\d{2}-\d{2}$/.test(String(value ?? ""))
      ? formatMonthLabel(value)
      : formatDateLabel(value);
    const incidentCoverageText = incidentDetailRows.length
      ? `Most recent incident detail: ${formatDateLabel(latestIncidentDate)}. Coverage runs from ${formatDateLabel(incidentDates.at(0))} through ${formatDateLabel(latestIncidentDate)}: ${formatNumber(incidentDetailRows.length)} incident events across ${formatNumber(incidentDetailPeriods.length)} monthly periods.`
      : "No dated incident detail is currently available.";
    const periodsByDataset = new Map([
      ["Incident detail", incidentDetailPeriods],
      ["Incident monthly", periodsForRows(incidentRows)],
      ["Census monthly", periodsForRows(censusRows)],
      ["Medication compliance", periodsForRows(complianceRows)],
      ["Medication refusals", periodsForRows(refusalRows)],
      ["MAR monthly", periodsForRows(marMonthlyRows)],
      ["MAR exceptions", periodsForRows(marExceptionRows)]
    ]);
    const allKnownPeriods = uniqueSorted([...periodsByDataset.values()].flat());
    const requestedMonths = parseRequestedMonthBuckets(content, allKnownPeriods);
    const requestedPeriodRows = requestedMonths.length && displayedCoverageRows.length
      ? displayedCoverageRows.map((row) => {
          const periods = periodsByDataset.get(row.dataset) ?? [];
          if (!periods.length) {
            return {
              dataset: row.dataset,
              status: "Current snapshot",
              loaded: false,
              detail: "Monthly history unavailable"
            };
          }
          const missingRequested = requestedMonths.filter((month) => !periods.includes(month));
          return {
            dataset: row.dataset,
            status: missingRequested.length ? "Partially available" : "Available",
            loaded: missingRequested.length === 0,
            detail: missingRequested.length
              ? `Missing ${missingRequested.map(formatMonthLabel).join(", ")}; available ${formatMonthLabel(periods.at(0))} through ${formatMonthLabel(periods.at(-1))}`
              : `${requestedMonths.map(formatMonthLabel).join(", ")} is available`
          };
        })
      : [];
    const requestedPeriodSummary = requestedPeriodRows.length
      ? requestedPeriodRows.map((row) => {
          if (row.loaded) return `${row.dataset} includes ${requestedMonths.map(formatMonthLabel).join(", ")}.`;
          if (row.status === "Current snapshot") return `${row.dataset} is current only and has no monthly history.`;
          return `${row.dataset} does not include ${requestedMonths.map(formatMonthLabel).join(", ")}. ${row.detail}.`;
        }).join(" ")
      : null;
    const artifactCoverageRows = [
      ...requestedPeriodRows.map((row) => ({
        dataset: `Requested period · ${row.dataset}`,
        grain: row.status,
        rowCount: row.loaded ? 1 : 0,
        earliest: requestedMonths.map(formatMonthLabel).join(", "),
        latest: row.detail
      })),
      ...displayedCoverageRows
    ];
    const coverageRowSetId = fingerprintRows(artifactCoverageRows);
    const coverageTruthState = requestedPeriodRows.some((row) => !row.loaded) ? "not_loaded" : "valid_rows";
    const focusedCoverageAvailable = displayedCoverageRows.some((row) => Number(row.rowCount ?? 0) > 0);

    if (isIncidentFreshnessIntent(coverageFocusText)) {
      return buildIncidentFreshnessTool(communities, reportsSummary, {
        incidentDetailRows,
        incidentRows,
        incidentDates,
        latestIncidentDate,
        incidentDetailPeriods
      });
    }

    return {
      handled: true,
      tool: "data_availability",
      truthState: coverageTruthState,
      text: incidentDetailFocus
        ? [requestedPeriodSummary, incidentCoverageText].filter(Boolean).join("\n")
        : coverageFocusLabel
          ? [
              requestedPeriodSummary,
              `${coverageFocusLabel} coverage is ${focusedCoverageAvailable ? "available in" : "unavailable in"} the published snapshot.`
            ].filter(Boolean).join("\n")
          : latestIncidentDate
            ? `Most recent incident detail: ${formatDateLabel(latestIncidentDate)}. Coverage is summarized by dataset.`
            : "No dated incident detail is available. Coverage is summarized by dataset.",
      trace: makeTrace({
        tool: "data_availability",
        dataSource: "published platform context coverage",
        rowCount: displayedCoverageRows.length,
        period: periodRange(incidentRows).latest,
        note: latestIncidentDate ? `latestIncidentDate=${latestIncidentDate}` : "no incident detail date",
        truthState: coverageTruthState
      }),
      visual: {
        type: "table",
        title: incidentDetailFocus ? "Incident Detail Availability" : coverageFocusLabel ? `${coverageFocusLabel} Availability` : "Data Availability",
        subtitle: incidentDetailFocus
          ? `${formatNumber(incidentDetailPeriods.length)} monthly periods available`
          : coverageFocusLabel
            ? "Focused coverage diagnostic"
            : "Actual data currently available to deterministic analyst tools",
        valueLabel: "Datasets",
        columns: ["Dataset", "Level", "Records", "Earliest", "Latest"],
        rows: [
          ...requestedPeriodRows.map((row) => ({
            label: `Requested period · ${row.dataset}`,
            value: row.loaded ? 1 : 0,
            cells: [`Requested period · ${row.dataset}`, row.status, requestedMonths.map(formatMonthLabel).join(", "), row.detail, row.loaded ? "Available" : "Unavailable"]
          })),
          ...displayedCoverageRows.map((row) => ({
          label: row.dataset,
          value: row.rowCount,
          cells: [row.dataset, row.grain, formatNumber(row.rowCount), row.earliest ? formatCoverageValue(row.earliest) : "Current only", row.latest ? formatCoverageValue(row.latest) : "—"]
          }))
        ]
      },
      artifact: {
        type: "csv",
        filename: "platform-data-availability.csv",
        mimeType: "text/csv",
        content: rowsToCsv(artifactCoverageRows),
        rowSetId: coverageRowSetId,
        rowCount: artifactCoverageRows.length
      },
      provenance: {
        rowSetId: coverageRowSetId,
        rowCount: artifactCoverageRows.length,
        dataset: "data_availability"
      },
      actions: [
        { label: "Open Incident Center", kind: "route", route: "/incidents" },
        { label: "Show available analytical slices", kind: "tool", tool: "tool_context_catalog", prompt: "show available analytical slices" }
      ]
    };
  }

  return Object.freeze({
    buildDataAvailabilityTool,
    buildIncidentFreshnessTool
  });
}

export function createAvailabilityToolDefinitions(handlers) {
  return AVAILABILITY_TOOL_NAMES.map((name) => {
    const handler = handlers[name];
    if (typeof handler !== "function") {
      throw new TypeError(`Availability tool ${name} requires a handler.`);
    }
    return Object.freeze({ name, domain: "availability", handler });
  });
}

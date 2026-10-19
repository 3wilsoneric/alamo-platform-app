const PLATFORM_OVERVIEW_TOOL_NAMES = Object.freeze([
  "tool_context_catalog",
  "operating_snapshot",
  "community_profile",
  "community_compare"
]);

function parseIsoCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.toISOString().slice(0, 10) !== match[0]) return null;
  return { year, month, day };
}

export function formatIncidentPeriodLabel(monthBucket, asOfDate, formatMonthLabel) {
  const monthLabel = formatMonthLabel(monthBucket);
  const parsedAsOf = parseIsoCalendarDate(asOfDate);
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(String(monthBucket ?? "").trim());
  if (!parsedAsOf || !monthMatch) return monthLabel;

  const periodYear = Number(monthMatch[1]);
  const periodMonth = Number(monthMatch[2]);
  const lastDayOfMonth = new Date(Date.UTC(periodYear, periodMonth, 0)).getUTCDate();
  const isIncompleteAsOfMonth =
    parsedAsOf.year === periodYear &&
    parsedAsOf.month === periodMonth &&
    parsedAsOf.day < lastDayOfMonth;

  return isIncompleteAsOfMonth ? `${monthLabel} month to date` : monthLabel;
}

export function createPlatformOverviewTools({
  average,
  countBy,
  filterByFacility,
  findFacility,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getCommunityMetrics,
  getIncidentRows,
  getLatestAndPrior,
  getResidentRows,
  getScopedCensusSeries,
  latestMonth,
  makeTrace,
  sum,
  sumIncidentCountsByKey
}) {
  function buildToolContextCatalogTool(_content, _communities, reportsSummary) {
    const manifest = Array.isArray(reportsSummary.toolContext?.manifest)
      ? reportsSummary.toolContext.manifest
      : [];
    const fallbackRows = [
      ["Communities", "census, incidents, residents", "Current snapshot"],
      ["Incidents", "monthly categories and detail", "Available snapshot"],
      ["Resident search", "current resident profiles", "Current roster"]
    ];
    const text = manifest.length
      ? [
          "Available analytical slices",
          ...manifest.map((row) => `${row.slice_name}: ${formatNumber(row.row_count)} records; grain ${row.grain}; period ${row.min_period ?? "—"} to ${row.max_period ?? "—"}.`)
        ].join("\n")
      : "No tool context manifest is loaded in the current snapshot. The platform can still use the core snapshot surfaces shown below.";

    return {
      handled: true,
      tool: "tool_context_catalog",
      truthState: "valid_rows",
      text,
      trace: makeTrace({
        tool: "tool_context_catalog",
        dataSource: "tool context manifest",
        rowCount: manifest.length || fallbackRows.length,
        truthState: "valid_rows"
      }),
      visual: {
        type: "table",
        title: manifest.length ? "Available Analytical Slices" : "Core Platform Surfaces",
        subtitle: manifest.length ? "Published analytical coverage" : "Tool manifest unavailable · core surfaces remain available",
        columns: manifest.length ? ["Slice", "Level", "Records", "Period"] : ["Surface", "Coverage", "Status"],
        rows: manifest.length
          ? manifest.map((row) => ({
              label: row.slice_name,
              value: Number(row.row_count || 0),
              cells: [
                row.slice_name,
                row.grain,
                formatNumber(row.row_count),
                `${row.min_period ?? "—"} to ${row.max_period ?? "—"}`
              ]
            }))
          : fallbackRows.map(([surface, coverage, status]) => ({
              label: surface,
              value: 1,
              cells: [surface, coverage, status]
            }))
      }
    };
  }

  function buildCommunityProfileTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const residents = filterByFacility(getResidentRows(communities, reportsSummary), facility);
    const censusRows = getScopedCensusSeries(communities.census, facility);
    const incidentRows = filterByFacility(getIncidentRows(communities, reportsSummary), facility);
    const latestCensus = censusRows.at(-1) ?? null;
    const priorCensus = censusRows.at(-2) ?? null;
    const { latestMonth: latestIncidentMonth, priorMonth: priorIncidentMonth } = getLatestAndPrior(incidentRows);
    const latestIncidents = sum(incidentRows.filter((row) => row.month_bucket === latestIncidentMonth), (row) => row.incident_count);
    const priorIncidents = sum(incidentRows.filter((row) => row.month_bucket === priorIncidentMonth), (row) => row.incident_count);
    const topDiagnoses = countBy(residents, (resident) => resident.primary_diagnosis).slice(0, 3);
    const topCategories = sumIncidentCountsByKey(
      incidentRows.filter((row) => row.month_bucket === latestIncidentMonth),
      (row) => row.category
    ).slice(0, 3);
    const label = facility?.community_name ?? "Portfolio";
    const lines = [];
    const censusDelta = latestCensus && priorCensus
      ? Number(latestCensus.census || 0) - Number(priorCensus.census || 0)
      : null;
    const incidentDelta = priorIncidentMonth ? latestIncidents - priorIncidents : null;
    const incidentPeriodLabel = formatIncidentPeriodLabel(
      latestIncidentMonth,
      communities.as_of_date,
      formatMonthLabel
    );
    const averageAge = average(residents.map((resident) => resident.age));
    const averageLos = average(residents.map((resident) => resident.los_days));

    lines.push(`${label} profile`);
    lines.push(`Active roster: ${formatNumber(residents.length)} current residents.`);
    if (latestCensus) lines.push(`Reporting census: ${formatNumber(latestCensus.census)} for ${formatMonthLabel(latestCensus.month_bucket)}.`);
    lines.push(`Average age: ${averageAge.toFixed(1)}. Average length of stay: ${averageLos.toFixed(0)} days.`);
    if (latestCensus && priorCensus && censusDelta !== null) {
      lines.push(`Census ${censusDelta === 0 ? "was unchanged" : `${censusDelta > 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(censusDelta))}`} from ${formatMonthLabel(priorCensus.month_bucket)}.`);
    }
    lines.push(`Incidents: ${formatNumber(latestIncidents)} in ${incidentPeriodLabel}${priorIncidentMonth && incidentDelta !== null ? `, ${incidentDelta === 0 ? "unchanged" : `${incidentDelta > 0 ? "up" : "down"} ${formatNumber(Math.abs(incidentDelta))}`} from ${formatMonthLabel(priorIncidentMonth)}` : ""}.`);
    if (topCategories.length) lines.push(`Top incident categories: ${topCategories.map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.`);
    if (topDiagnoses.length) lines.push(`Top diagnoses: ${topDiagnoses.map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.`);

    return {
      handled: true,
      tool: "community_profile",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "community_profile",
        dataSource: "resident roster, census, and incident rows",
        rowCount: residents.length + censusRows.length + incidentRows.length,
        facility,
        period: latestCensus?.month_bucket ?? latestIncidentMonth
      }),
      visual: {
        type: "summary_card",
        title: `${label} Topline`,
        subtitle: [
          latestCensus ? `Census ${formatMonthLabel(latestCensus.month_bucket)}` : null,
          latestIncidentMonth ? `incidents ${formatMonthLabel(latestIncidentMonth)}` : null
        ].filter(Boolean).join(" · "),
        valueLabel: "Topline",
        rows: [
          {
            label: "Active roster",
            value: Number(residents.length || 0),
            cells: ["Active roster", formatNumber(residents.length || 0), "Current resident rows"]
          },
          {
            label: "Reporting census",
            value: Number(latestCensus?.census || 0),
            cells: [
              "Reporting census",
              latestCensus ? formatNumber(latestCensus.census) : "—",
              latestCensus ? formatMonthLabel(latestCensus.month_bucket) : "No census row loaded"
            ]
          },
          {
            label: "Census movement",
            value: Number(censusDelta ?? 0),
            cells: [
              "Census movement",
              censusDelta == null ? "—" : `${censusDelta > 0 ? "+" : ""}${formatNumber(censusDelta)}`,
              priorCensus ? `vs ${formatMonthLabel(priorCensus.month_bucket)}` : "No prior census row loaded"
            ]
          },
          {
            label: "Incidents",
            value: Number(latestIncidents || 0),
            cells: ["Incidents", formatNumber(latestIncidents), incidentPeriodLabel]
          },
          {
            label: "Average LOS",
            value: Number(averageLos.toFixed(0)),
            cells: ["Average LOS", `${formatNumber(averageLos.toFixed(0))} days`, "Current residents"]
          }
        ]
      },
      actions: [
        { label: `Open ${facility ? label : "Communities Overview"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}` : "/communities" },
        { label: `Show ${label} incident categories`, kind: "tool", tool: "incident_breakdown", prompt: `${label} current incident category breakdown` },
        { label: `Show ${label} census trend`, kind: "tool", tool: "census_trend", prompt: `${label} census trend` },
        { label: `Export ${facility ? `${label} residents` : "resident roster"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} residents to csv` },
        { label: `Export ${facility ? `${label} incidents` : "incidents"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} incidents to csv` }
      ]
    };
  }

  function buildOperatingSnapshotTool(_content, communities, reportsSummary) {
    const metrics = communities.facilities.map((facility) => getCommunityMetrics(communities, reportsSummary, facility));
    const rankedMetrics = metrics
      .slice()
      .sort((left, right) => Number(right.incidentsPer100 || 0) - Number(left.incidentsPer100 || 0));
    const residentTotal = sum(metrics, (row) => row.residents);
    const censusTotal = sum(metrics, (row) => row.census);
    const incidentTotal = sum(metrics, (row) => row.incidents);
    const latestIncidentMonth = latestMonth(communities.incidents ?? []);
    const latestCensusMonth = latestMonth(communities.census ?? []);
    const lines = [
      "Portfolio operating snapshot",
      `Current residents: ${formatNumber(residentTotal)}; latest census total: ${formatNumber(censusTotal)} for ${formatMonthLabel(latestCensusMonth)}.`,
      `Latest incident total: ${formatNumber(incidentTotal)} for ${formatMonthLabel(latestIncidentMonth)}.`,
      `Highest incident rates: ${rankedMetrics.slice(0, 3).map((row) => `${row.communityName} (${formatNumber(row.incidentsPer100?.toFixed(1))} per 100)`).join(", ")}.`
    ];

    return {
      handled: true,
      tool: "operating_snapshot",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "operating_snapshot",
        dataSource: "facilities, resident roster, census, incidents, medication rows",
        rowCount: communities.facilities.length,
        period: latestCensusMonth ?? latestIncidentMonth
      }),
      visual: {
        type: "table",
        title: "Operating Snapshot by Community",
        subtitle: `${formatMonthLabel(latestCensusMonth)} census and ${formatMonthLabel(latestIncidentMonth)} incidents`,
        columns: ["Community", "Census", "Incidents", "Rate / 100", "Census Δ"],
        rows: rankedMetrics.map((row) => ({
          label: row.communityName,
          value: Number(row.incidentsPer100 || 0),
          cells: [
            row.communityName,
            formatNumber(row.census),
            formatNumber(row.incidents),
            row.incidentsPer100 == null ? "—" : row.incidentsPer100.toFixed(1),
            row.censusDelta == null ? "—" : formatSigned(row.censusDelta)
          ]
        }))
      },
      actions: [
        { label: "Open Communities Overview", kind: "route", route: "/communities" },
        { label: "Open Incident Center", kind: "route", route: "/incidents" }
      ]
    };
  }

  function buildCommunityCompareTool(_content, communities, reportsSummary) {
    const metrics = communities.facilities
      .map((facility) => getCommunityMetrics(communities, reportsSummary, facility))
      .sort((left, right) => Number(right.incidentsPer100 || 0) - Number(left.incidentsPer100 || 0));
    const latestCensusMonth = latestMonth(communities.census ?? []);
    const latestIncidentMonth = latestMonth(communities.incidents ?? []);
    const largestCensusMovement = metrics
      .slice()
      .sort((left, right) => Math.abs(Number(right.censusDelta || 0)) - Math.abs(Number(left.censusDelta || 0)))[0];

    return {
      handled: true,
      tool: "community_compare",
      text: [
        "Community comparison",
        `Rows compared: ${formatNumber(metrics.length)} communities.`,
        `Highest incident rate: ${metrics[0]?.communityName ?? "—"} (${metrics[0]?.incidentsPer100 == null ? "—" : metrics[0].incidentsPer100.toFixed(1)} per 100 residents).`,
        `Largest census movement: ${largestCensusMovement?.communityName ?? "—"}.`
      ].join("\n"),
      trace: makeTrace({
        tool: "community_compare",
        dataSource: "community metric rollup",
        rowCount: metrics.length,
        period: latestCensusMonth ?? latestIncidentMonth
      }),
      visual: {
        type: "table",
        title: "Community Compare",
        subtitle: `${formatMonthLabel(latestCensusMonth)} census; ${formatMonthLabel(latestIncidentMonth)} incidents`,
        columns: ["Community", "Census", "Census Δ", "Incidents", "Rate / 100", "Avg LOS"],
        rows: metrics.map((row) => ({
          label: row.communityName,
          value: Number(row.incidentsPer100 || 0),
          cells: [
            row.communityName,
            formatNumber(row.census),
            row.censusDelta == null ? "—" : formatSigned(row.censusDelta),
            formatNumber(row.incidents),
            row.incidentsPer100 == null ? "—" : row.incidentsPer100.toFixed(1),
            `${Math.round(row.averageLos || 0)} days`
          ]
        }))
      },
      actions: [
        { label: "Export census series", kind: "tool", tool: "export_csv", prompt: "export census to csv" },
        { label: "Export incidents", kind: "tool", tool: "export_csv", prompt: "export incidents to csv" }
      ]
    };
  }

  return Object.freeze({
    buildCommunityCompareTool,
    buildCommunityProfileTool,
    buildOperatingSnapshotTool,
    buildToolContextCatalogTool
  });
}

export function createPlatformOverviewToolDefinitions(handlers) {
  return PLATFORM_OVERVIEW_TOOL_NAMES.map((name) => {
    const handler = handlers[name];
    if (typeof handler !== "function") {
      throw new TypeError(`Platform overview tool ${name} requires a handler.`);
    }
    return Object.freeze({ name, domain: "platform", handler });
  });
}

export { PLATFORM_OVERVIEW_TOOL_NAMES };

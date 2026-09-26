import { inferIncidentCountGrain } from "../../shared/metric-definitions.mjs";

const INCIDENT_TOOL_NAMES = Object.freeze([
  "ad_hoc_incident_chart",
  "incident_breakdown",
  "incident_detail_list",
  "incident_resident_drivers",
  "incident_category_comparison",
  "top_incident_category_by_community",
  "incident_rate",
  "incident_rate_change"
]);

export function createIncidentCategoryTools({ normalizeText }) {
  function getIncidentCategoryFilter(content, rows = []) {
    const text = normalizeText(content);
    if (/\b(awol|elopement|eloped)\b/.test(text)) return "awol";
    if (/\b(medication refusal|med refusal|refusal|refused meds?)\b/.test(text)) return "medication refusal";
    if (/\b(substance|drug|alcohol)\b/.test(text)) return "substance";
    if (/\b(aggressive|aggression|behavior)\b/.test(text)) return "aggressive";
    if (/\b(fall|falls)\b/.test(text)) return "fall";
    const discoveredCategory = [...new Set(rows.map((row) => row.category ?? row.incident_type).filter(Boolean))]
      .map((category) => ({ category, normalized: normalizeText(category) }))
      .filter(({ normalized }) => normalized && !["other", "unspecified", "unknown"].includes(normalized))
      .sort((left, right) => right.normalized.length - left.normalized.length)
      .find(({ normalized }) => {
        const tokens = normalized.split(" ").filter((token) => token.length >= 4);
        const distinctiveTokens = tokens.filter((token) =>
          token.length >= 6 && !["incident", "incidents", "behavior", "medical", "medication", "mental", "health", "services"].includes(token)
        );
        return text.includes(normalized) ||
          (tokens.length > 0 && tokens.every((token) => text.includes(token))) ||
          distinctiveTokens.some((token) => text.includes(token));
      });
    return discoveredCategory?.normalized ?? null;
  }

  function filterIncidentsByCategory(rows, categoryFilter) {
    if (!categoryFilter) return rows;
    return rows.filter((row) => {
      const classification = normalizeText(row.category || row.incident_category || row.incident_type || row.type || "");
      if (categoryFilter === "awol") return /\b(awol|elopement|eloped)\b/.test(classification);
      if (categoryFilter === "medication refusal") return classification.includes("medication refusal");
      if (categoryFilter === "substance") return classification.includes("substance");
      if (categoryFilter === "aggressive") return classification.includes("aggressive");
      if (categoryFilter === "fall") return /\bfalls?\b/.test(classification);
      return classification.includes(categoryFilter);
    });
  }

  function formatIncidentBreakdownSubject(categoryLabel) {
    if (!categoryLabel) return "incident breakdown";
    return `${categoryLabel}${/incident$/i.test(categoryLabel) ? "" : " incident"} breakdown`;
  }

  return Object.freeze({
    getIncidentCategoryFilter,
    filterIncidentsByCategory,
    formatIncidentBreakdownSubject
  });
}

export function createIncidentBreakdownTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    buildZeroIncidentCategoryBreakdown,
    countBy,
    countBySum,
    filterByFacility,
    filterIncidentsByCategory,
    findFacility,
    formatIncidentBreakdownSubject,
    formatIncidentCategoryFilterLabel,
    formatMonthLabel,
    formatNumber,
    formatPercent,
    getIncidentCategoryFilter,
    getIncidentDetailRows,
    getIncidentRows,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    latestMonth,
    makeTrace,
    sum
  } = dependencies;

  function buildIncidentBreakdownTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const portfolioIncidentRows = getIncidentRows(communities, reportsSummary);
    const portfolioDetailRows = getIncidentDetailRows(communities, reportsSummary);
    const sourceIncidentRows = filterByFacility(portfolioIncidentRows, facility);
    const sourceDetailRows = filterByFacility(portfolioDetailRows, facility);
    const categoryFilter = getIncidentCategoryFilter(content, [...portfolioIncidentRows, ...portfolioDetailRows]);
    const incidentRows = filterIncidentsByCategory(sourceIncidentRows, categoryFilter);
    const detailRows = filterIncidentsByCategory(sourceDetailRows, categoryFilter);
    const detailMonth = latestMonth(detailRows);
    const aggregateMonth = latestMonth(incidentRows);
    const allMonths = [...new Set([
      ...incidentRows.map((row) => row.month_bucket).filter(Boolean),
      ...detailRows.map((row) => row.month_bucket).filter(Boolean)
    ])].sort();
    const baseMonths = [...new Set([
      ...sourceIncidentRows.map((row) => row.month_bucket).filter(Boolean),
      ...sourceDetailRows.map((row) => row.month_bucket).filter(Boolean)
    ])].sort();
    const requestedMonths = getRequestedMonthBuckets(content, allMonths);
    const activeMonth = requestedMonths.find((month) => allMonths.includes(month)) ?? detailMonth ?? aggregateMonth;
    const missingRequestedMonths = requestedMonths.filter((month) => !allMonths.includes(month));
    const priorIncidentMonth = activeMonth ? allMonths.filter((month) => month < activeMonth).at(-1) ?? null : null;
    const latestRows = incidentRows.filter((row) => row.month_bucket === activeMonth);
    const priorRows = incidentRows.filter((row) => row.month_bucket === priorIncidentMonth);
    const details = detailRows.filter((incident) => !activeMonth || incident.month_bucket === activeMonth);
    const priorDetails = detailRows.filter((incident) => incident.month_bucket === priorIncidentMonth);
    const latestTotal = details.length || sum(latestRows, (row) => row.incident_count);
    const priorTotal = priorDetails.length || sum(priorRows, (row) => row.incident_count);
    const aggregateCategories = [...latestRows.reduce((acc, row) => {
      const key = row.category || "Uncategorized";
      acc.set(key, (acc.get(key) ?? 0) + Number(row.incident_count || 0));
      return acc;
    }, new Map()).entries()].sort((a, b) => b[1] - a[1]);
    const detailCategories = countBySum(details, (incident) => incident.category || incident.incident_type || "Uncategorized");
    const categories = detailCategories.length ? detailCategories : aggregateCategories;
    const dataSourceLabel = detailCategories.length ? "detail incident rows" : "aggregate category rows";
    const residentCounts = countBy(details, (incident) => incident.client_name).slice(0, 5);
    const uniqueResidentCount = new Set(
      details
        .map((incident) => incident.resident_id || incident.client_name)
        .filter(Boolean)
    ).size;
    const metricGrain = inferIncidentCountGrain(content);
    const peopleCountIntent = metricGrain === "distinct_residents";
    const categoryLabel = formatIncidentCategoryFilterLabel(categoryFilter);

    const zeroCategoryMonth = categoryLabel && requestedMonths.length === 1 && baseMonths.includes(requestedMonths[0]) && !allMonths.includes(requestedMonths[0])
      ? requestedMonths[0]
      : null;

    if (zeroCategoryMonth) {
      return buildZeroIncidentCategoryBreakdown({
        label,
        facility,
        categoryLabel,
        month: zeroCategoryMonth,
        peopleCountIntent,
        dataSource: detailRows.length ? "detail incident rows" : "incident rows"
      });
    }

    if (missingRequestedMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "incident_breakdown",
        label,
        subject: formatIncidentBreakdownSubject(categoryLabel),
        dataSource: "incident rows",
        availableMonths: allMonths,
        missingMonths: missingRequestedMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, [
          ...filterIncidentsByCategory(portfolioIncidentRows, categoryFilter),
          ...filterIncidentsByCategory(portfolioDetailRows, categoryFilter)
        ]),
        facility,
        note: categoryLabel ? `category=${categoryLabel}` : null
      });
    }

    const topCategory = categories[0];
    const movementText = priorIncidentMonth
      ? `${latestTotal - priorTotal > 0 ? "+" : ""}${formatNumber(latestTotal - priorTotal)} vs ${formatMonthLabel(priorIncidentMonth)}`
      : null;
    const lines = [
      categoryLabel && peopleCountIntent && details.length
        ? `${formatMonthLabel(activeMonth)} ${categoryLabel}: ${label} had ${formatNumber(uniqueResidentCount)} unique resident${uniqueResidentCount === 1 ? "" : "s"} involved across ${formatNumber(latestTotal)} incident${latestTotal === 1 ? "" : "s"}.`
        : categoryLabel
          ? `${formatMonthLabel(activeMonth)} ${categoryLabel} incidents: ${label} had ${formatNumber(latestTotal)} incident${latestTotal === 1 ? "" : "s"}.`
          : `${formatMonthLabel(activeMonth)} incidents: ${label} had ${formatNumber(latestTotal)} incident${latestTotal === 1 ? "" : "s"}${movementText ? ` (${movementText})` : ""}${topCategory ? `; ${topCategory[0]} was the largest category at ${formatNumber(topCategory[1])}.` : "."}`
    ];
    if (categoryLabel && peopleCountIntent && !details.length) {
      lines.push(`I only have aggregate incident counts for this slice, so I can count ${formatNumber(latestTotal)} incidents but not distinct people.`);
    }
    if (!categoryLabel && categories.length) {
      lines.push("Top categories");
      categories.slice(0, 5).forEach(([name, count]) => {
        const share = latestTotal ? ` (${formatPercent((Number(count) / latestTotal) * 100)} of incidents)` : "";
        lines.push(`- ${name} accounted for ${formatNumber(count)} incident${Number(count) === 1 ? "" : "s"}${share}.`);
      });
    }
    if (residentCounts.length) {
      lines.push(`Residents with the most matching incidents: ${residentCounts.map(([name, count]) => `${name} (${formatNumber(count)} incident${Number(count) === 1 ? "" : "s"})`).join(", ")}.`);
    }
    return {
      handled: true,
      tool: "incident_breakdown",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "incident_breakdown",
        dataSource: dataSourceLabel,
        rowCount: details.length || latestRows.length,
        facility,
        period: activeMonth,
        note: [categoryLabel ? `category=${categoryLabel}` : null, metricGrain ? `metricGrain=${metricGrain}` : null].filter(Boolean).join("; ") || null
      }),
      visual: categoryLabel
        ? {
            type: "summary_card",
            title: `${label} ${categoryLabel}`,
            subtitle: formatMonthLabel(activeMonth),
            valueLabel: peopleCountIntent && details.length ? "Residents" : "Incidents",
            rows: [
              {
                label: peopleCountIntent && details.length ? "Unique residents" : "Incidents",
                value: Number(peopleCountIntent && details.length ? uniqueResidentCount : latestTotal),
                cells: [
                  peopleCountIntent && details.length ? "Unique residents" : "Incidents",
                  formatNumber(peopleCountIntent && details.length ? uniqueResidentCount : latestTotal),
                  `${categoryLabel} · ${formatMonthLabel(activeMonth)}`
                ]
              },
              ...(peopleCountIntent && details.length
                ? [{
                    label: "Incidents",
                    value: Number(latestTotal),
                    cells: ["Incidents", formatNumber(latestTotal), `${categoryLabel} · ${formatMonthLabel(activeMonth)}`]
                  }]
                : uniqueResidentCount > 0
                  ? [{
                      label: "Residents involved",
                      value: Number(uniqueResidentCount),
                      cells: ["Residents involved", formatNumber(uniqueResidentCount), `${categoryLabel} · ${formatMonthLabel(activeMonth)}`]
                    }]
                  : [])
            ]
          }
        : {
            type: "bar_chart",
            title: `${label} Incident Category Breakdown`,
            subtitle: `${formatMonthLabel(activeMonth)} · ${detailCategories.length ? "incident detail" : "monthly totals"}`,
            valueLabel: "Incidents",
            rows: categories.slice(0, 8).map(([rowLabel, value]) => ({
              label: String(rowLabel),
              value: Number(value)
            }))
          },
      summary: categoryLabel
        ? {
            category: categoryLabel,
            incidentCount: Number(latestTotal),
            uniqueResidentCount: details.length ? Number(uniqueResidentCount) : null,
            countGrain: metricGrain
          }
        : undefined,
      actions: []
    };
  }

  return Object.freeze({
    buildIncidentBreakdownTool
  });
}

export function createIncidentComparisonTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    filterIncidentsByCategory,
    filterByFacility,
    findFacility,
    formatIncidentCategoryFilterLabel,
    formatMonthLabel,
    formatNumber,
    formatSigned,
    getIncidentRows,
    getIncidentCategoryFilter,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    makeTrace,
    sum,
    sumIncidentCountsByKey
  } = dependencies;

  function buildIncidentCategoryComparisonTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const portfolioIncidentRows = getIncidentRows(communities, reportsSummary);
    const categoryFilter = getIncidentCategoryFilter(content, portfolioIncidentRows);
    const categoryLabel = formatIncidentCategoryFilterLabel(categoryFilter);
    const incidentRows = filterIncidentsByCategory(filterByFacility(portfolioIncidentRows, facility), categoryFilter);
    const availableMonths = [...new Set(incidentRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const latestMonthValue = availableMonths.at(-1) ?? null;
    const priorMonthValue = latestMonthValue ? availableMonths.filter((month) => month < latestMonthValue).at(-1) ?? null : null;
    const comparisonMonths = requestedMonths.length >= 2
      ? requestedMonths.slice(0, 2).sort()
      : [priorMonthValue, latestMonthValue].filter(Boolean);
    const [leftMonth, rightMonth] = comparisonMonths;
    const missingRequestedMonths = requestedMonths.filter((month) => !availableMonths.includes(month));

    if (requestedMonths.length > 2) {
      return {
        handled: true,
        tool: "incident_category_comparison",
        text: `This comparison accepts exactly two periods, but ${formatNumber(requestedMonths.length)} were requested: ${requestedMonths.map(formatMonthLabel).join(", ")}. Choose two months, or ask for a monthly trend across all of them.`,
        trace: makeTrace({
          tool: "incident_category_comparison",
          dataSource: "monthly category rows",
          rowCount: 0,
          facility,
          period: requestedMonths.join(", "),
          note: "too many comparison periods"
        }),
        actions: [
          { label: "Show monthly incident trend", kind: "tool", tool: "slice_metric", prompt: `${label} incidents by month for ${requestedMonths.map(formatMonthLabel).join(" and ")}` }
        ]
      };
    }
    const leftRows = incidentRows.filter((row) => row.month_bucket === leftMonth);
    const rightRows = incidentRows.filter((row) => row.month_bucket === rightMonth);
    const leftCounts = new Map(sumIncidentCountsByKey(leftRows, (row) => row.category || "Uncategorized"));
    const rightCounts = new Map(sumIncidentCountsByKey(rightRows, (row) => row.category || "Uncategorized"));
    const categories = [...new Set([...leftCounts.keys(), ...rightCounts.keys()])].sort((left, right) => {
      const leftTotal = (leftCounts.get(left) ?? 0) + (rightCounts.get(left) ?? 0);
      const rightTotal = (leftCounts.get(right) ?? 0) + (rightCounts.get(right) ?? 0);
      return rightTotal - leftTotal || left.localeCompare(right);
    });
    const rows = categories.map((category) => {
      const leftValue = Number(leftCounts.get(category) ?? 0);
      const rightValue = Number(rightCounts.get(category) ?? 0);
      return {
        category,
        leftValue,
        rightValue,
        delta: rightValue - leftValue
      };
    });
    const leftTotal = sum(leftRows, (row) => row.incident_count);
    const rightTotal = sum(rightRows, (row) => row.incident_count);

    if (!leftMonth || !rightMonth || missingRequestedMonths.length || !rows.length) {
      return buildUnavailablePeriodResult({
        tool: "incident_category_comparison",
        label,
        subject: "incident category comparison",
        dataSource: "monthly category rows",
        availableMonths,
        missingMonths: missingRequestedMonths,
        requestedMonths: comparisonMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, portfolioIncidentRows),
        facility,
        rowCount: incidentRows.length,
        note: missingRequestedMonths.length ? `missing: ${missingRequestedMonths.join(", ")}` : "missing comparison months"
      });
    }

    return {
      handled: true,
      tool: "incident_category_comparison",
      text: [
        `${label}${categoryLabel ? ` ${categoryLabel}` : ""} incident category comparison`,
        `${formatMonthLabel(leftMonth)} incidents: ${formatNumber(leftTotal)}. ${formatMonthLabel(rightMonth)} incidents: ${formatNumber(rightTotal)} (${formatSigned(rightTotal - leftTotal)}).`,
        `Largest categories in ${formatMonthLabel(rightMonth)}: ${[...rows].sort((left, right) => right.rightValue - left.rightValue).slice(0, 5).map((row) => `${row.category} (${formatNumber(row.rightValue)})`).join(", ")}.`
      ].join("\n"),
      trace: makeTrace({
        tool: "incident_category_comparison",
        dataSource: "monthly category rows",
        rowCount: leftRows.length + rightRows.length,
        facility,
        period: `${leftMonth} vs ${rightMonth}`,
        note: categoryLabel ? `category=${categoryLabel}` : null
      }),
      visual: {
        type: "table",
        title: `${label}${categoryLabel ? ` ${categoryLabel}` : ""} Incident Category Comparison`,
        subtitle: `${formatMonthLabel(leftMonth)} vs ${formatMonthLabel(rightMonth)}`,
        valueLabel: "Incidents",
        columns: ["Category", formatMonthLabel(leftMonth), formatMonthLabel(rightMonth), "Delta"],
        rows: rows.slice(0, 12).map((row) => ({
          label: row.category,
          value: row.rightValue,
          cells: [
            row.category,
            row.leftValue,
            row.rightValue,
            formatSigned(row.delta)
          ]
        }))
      },
      actions: []
    };
  }

  return Object.freeze({
    buildIncidentCategoryComparisonTool
  });
}

export function createIncidentVisualTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    countBySum,
    filterByFacility,
    filterIncidentsByCategory,
    findFacility,
    formatIncidentCategoryFilterLabel,
    formatMonthLabel,
    getFacilityMaps,
    getIncidentCategoryFilter,
    getIncidentRows,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    makeTrace
  } = dependencies;

  function buildAdHocIncidentVisual(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const facilityNames = getFacilityMaps(communities).byId;
    const portfolioRows = getIncidentRows(communities, reportsSummary);
    const sourceRows = filterByFacility(portfolioRows, facility);
    const availableMonths = [...new Set(sourceRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    const categoryFilter = getIncidentCategoryFilter(content, sourceRows);
    const categoryLabel = formatIncidentCategoryFilterLabel(categoryFilter);
    const byCategory = /\b(category|categories|type|types)\b/i.test(content) && !categoryFilter;

    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "ad_hoc_incident_chart",
        label,
        subject: "incident chart",
        dataSource: "monthly incident rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, filterIncidentsByCategory(portfolioRows, categoryFilter)),
        facility,
        note: categoryLabel ? `category=${categoryLabel}` : null
      });
    }

    const periodRows = requestedMonths.length
      ? sourceRows.filter((row) => requestedMonths.includes(row.month_bucket))
      : sourceRows;
    const rows = filterIncidentsByCategory(periodRows, categoryFilter);
    const byCommunity = requestedMonths.length === 1 && !facility && !byCategory;
    const grouped = byCategory
      ? countBySum(rows, (row) => row.category || "Uncategorized", (row) => row.incident_count).slice(0, 8)
      : byCommunity
        ? countBySum(
            rows,
            (row) => facilityNames.get(row.facility_id)?.community_name ?? row.facility_name ?? row.facility_id ?? "Unknown community",
            (row) => row.incident_count
          ).slice(0, 8)
        : [...rows
            .reduce((acc, row) => {
              acc.set(row.month_bucket, (acc.get(row.month_bucket) ?? 0) + Number(row.incident_count || 0));
              return acc;
            }, new Map())
            .entries()]
            .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
            .slice(-8)
            .map(([month, value]) => [formatMonthLabel(month), value]);

    const titleSubject = categoryLabel ? `${categoryLabel} incidents` : "Incidents";
    const periodLabel = requestedMonths.length
      ? requestedMonths.map(formatMonthLabel).join(", ")
      : availableMonths.length
        ? `${formatMonthLabel(availableMonths[0])} to ${formatMonthLabel(availableMonths.at(-1))}`
        : null;

    return {
      handled: true,
      tool: "ad_hoc_incident_chart",
      text: `${label} ${titleSubject.toLowerCase()} ${byCategory ? "by category" : byCommunity ? "by community" : "by month"}${periodLabel ? ` for ${periodLabel}` : ""}.`,
      trace: makeTrace({
        tool: "ad_hoc_incident_chart",
        dataSource: "monthly incident rows",
        rowCount: rows.length,
        facility,
        period: requestedMonths.length ? requestedMonths.join(", ") : null,
        note: categoryLabel ? `category=${categoryLabel}` : null
      }),
      visual: {
        type: "bar_chart",
        title: `${label} ${titleSubject}`,
        subtitle: byCategory
          ? `${periodLabel ?? "Current"} category breakdown`
          : byCommunity
            ? `${periodLabel} by community`
            : "Monthly trend from available incident rows",
        valueLabel: "Incidents",
        rows: grouped.map(([rowLabel, value]) => ({
          label: rowLabel,
          value: Number(value)
        }))
      },
      actions: []
    };
  }

  return Object.freeze({
    buildAdHocIncidentVisual
  });
}

export function createIncidentDetailTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    defaultDetailPreviewRows = 5,
    filterByFacility,
    filterIncidentsByCategory,
    findFacility,
    fingerprintRows,
    formatDateLabel,
    formatIncidentCategoryFilterLabel,
    formatMonthLabel,
    formatNumber,
    getFacilityNameById,
    getIncidentCategoryFilter,
    getIncidentDetailRows,
    getIncidentRows,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    latestMonth,
    makePreviewTableVisual,
    makeTrace,
    normalizeDatasetRows,
    rowsToCsv,
    sum
  } = dependencies;

  function buildIncidentDetailListTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const portfolioDetailRows = getIncidentDetailRows(communities, reportsSummary);
    const portfolioAggregateRows = getIncidentRows(communities, reportsSummary);
    const sourceDetailRows = filterByFacility(portfolioDetailRows, facility);
    const sourceAggregateRows = filterByFacility(portfolioAggregateRows, facility);
    const categoryFilter = getIncidentCategoryFilter(content, [...portfolioDetailRows, ...portfolioAggregateRows]);
    const detailRows = filterIncidentsByCategory(sourceDetailRows, categoryFilter);
    const aggregateRows = filterIncidentsByCategory(sourceAggregateRows, categoryFilter);
    const allMonths = [...new Set([
      ...aggregateRows.map((row) => row.month_bucket).filter(Boolean),
      ...detailRows.map((row) => row.month_bucket).filter(Boolean)
    ])].sort();
    const requestedMonths = getRequestedMonthBuckets(content, allMonths);
    const detailMonths = [...new Set(detailRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const allLoadedDetailIntent = /\b(ever|all[-\s]?time|all loaded|loaded history|full history|entire history|all incident history|all incidents|every incident)\b/i.test(String(content ?? ""));
    const activeMonths = requestedMonths.length
      ? requestedMonths
      : allLoadedDetailIntent
        ? detailMonths
        : [detailMonths.at(-1) ?? latestMonth(aggregateRows)].filter(Boolean);
    const missingRequestedMonths = requestedMonths.filter((month) => !detailMonths.includes(month));
    const details = detailRows
      .filter((incident) => !activeMonths.length || activeMonths.includes(incident.month_bucket))
      .sort((left, right) => String(right.incident_date ?? right.received_at ?? "").localeCompare(String(left.incident_date ?? left.received_at ?? "")));
    const aggregateCategoryTotal = categoryFilter
      ? sum(
          aggregateRows.filter((row) => !activeMonths.length || activeMonths.includes(row.month_bucket)),
          (row) => row.incident_count
        )
      : 0;
    const categoryLabel = formatIncidentCategoryFilterLabel(categoryFilter);
    const titleSubject = categoryLabel ? `${categoryLabel} incidents` : "incidents";
    const baseDetailMonths = [...new Set(sourceDetailRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const zeroDetailMonth = categoryLabel && activeMonths.length === 1 && baseDetailMonths.includes(activeMonths[0]) && !detailMonths.includes(activeMonths[0])
      ? activeMonths[0]
      : null;

    if (zeroDetailMonth) {
      const csv = "date,community,resident,unit,category,incident_type,description\n";
      return {
        handled: true,
        tool: "incident_detail_list",
        truthState: "verified_zero",
        text: [
          `${label} ${categoryLabel} incident detail: 0 matching records in ${formatMonthLabel(zeroDetailMonth)}.`,
          "The requested month has incident detail for this scope. The requested category has no matching records."
        ].join("\n"),
        trace: makeTrace({
          tool: "incident_detail_list",
          dataSource: "detail incident rows",
          rowCount: 0,
          facility,
          period: zeroDetailMonth,
          note: `category=${categoryLabel}; verified zero`,
          truthState: "verified_zero"
        }),
        visual: makePreviewTableVisual({
          title: `${label} ${categoryLabel}${/incident$/i.test(categoryLabel) ? "" : " Incident"} Detail`,
          subtitle: `${formatMonthLabel(zeroDetailMonth)} · no matching incidents`,
          valueLabel: "Incident detail",
          columns: ["Date", "Community", "Resident", "Unit", "Category", "Incident type", "Description"],
          rows: [],
          totalRows: 0
        }),
        artifact: {
          type: "csv",
          filename: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${categoryLabel.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${zeroDetailMonth}.csv`,
          mimeType: "text/csv",
          content: csv,
          rowSetId: fingerprintRows([]),
          rowCount: 0
        },
        provenance: {
          rowSetId: fingerprintRows([]),
          rowCount: 0,
          dataset: "incidents"
        },
        actions: []
      };
    }
    if (missingRequestedMonths.length) {
      const recovery = buildUnavailablePeriodResult({
        tool: "incident_detail_list",
        label,
        subject: `${titleSubject} detail list`,
        dataSource: "detail incident rows",
        availableMonths: detailMonths,
        missingMonths: missingRequestedMonths,
        requestedMonths: activeMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, filterIncidentsByCategory(portfolioDetailRows, categoryFilter)),
        requiredFields: ["resident", "date", "incident type", "description"],
        facility,
        note: categoryLabel ? `category=${categoryLabel}` : null
      });
      return {
        ...recovery,
        actions: [
          recovery.actions[0],
          { label: `Open ${facility ? `${label} incidents` : "Incident Center"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=incidents` : "/incidents" }
        ].filter(Boolean)
      };
    }
    if (aggregateCategoryTotal > 0 && details.length !== aggregateCategoryTotal) {
      return {
        handled: true,
        tool: "incident_detail_list",
        safeRefusal: true,
        truthState: "plan_rejected",
        text: `I stopped this detail list because the loaded incident detail (${formatNumber(details.length)}) does not match the structured ${categoryLabel} category total (${formatNumber(aggregateCategoryTotal)}) for the same scope and period.`,
        contractViolation: `detail rows ${details.length} do not match aggregate category total ${aggregateCategoryTotal}`,
        trace: makeTrace({
          tool: "incident_detail_list",
          dataSource: "incident detail grain validation",
          rowCount: details.length,
          facility,
          period: activeMonths.join(", "),
          note: categoryLabel ? `category=${categoryLabel}; grain mismatch` : "grain mismatch",
          truthState: "plan_rejected"
        })
      };
    }

    const countsByMonth = activeMonths.map((month) => ({
      month,
      count: details.filter((incident) => incident.month_bucket === month).length
    }));
    const residentCounts = new Map();
    for (const incident of details) {
      const residentName = String(incident.client_name || incident.resident_id || "").trim();
      if (!residentName) continue;
      residentCounts.set(residentName, (residentCounts.get(residentName) ?? 0) + 1);
    }
    const topResidents = [...residentCounts.entries()]
      .filter(([name]) => !/^Resident\s+\d+$/i.test(name) && !/^Unknown resident$/i.test(name))
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .slice(0, 3)
      .map(([name, count]) => ({ name, count }));
    const periodLabel = activeMonths.map(formatMonthLabel).join(" and ") || "latest available period";
    const tableRows = details.map((incident) => {
      const description = incident.email_body || incident.description || incident.summary || incident.notes || incident.assistance_given || "—";
      return {
        label: incident.client_name || incident.resident_id || "Unknown resident",
        value: 0,
        cells: [
          formatDateLabel(incident.incident_date ?? incident.received_at),
          incident.facility_name || getFacilityNameById(communities, incident.facility_id),
          incident.client_name || incident.resident_id || "Unknown resident",
          incident.unit_number ?? "—",
          incident.category || "Uncategorized",
          incident.incident_type || "—",
          description
        ]
      };
    });
    const exportRows = normalizeDatasetRows("incidents", details, communities);
    const rowSetId = fingerprintRows(exportRows);
    const lines = [
      `${label} ${titleSubject} detail`,
      `${formatNumber(details.length)} matching records across ${periodLabel}.`,
      `Counts by month: ${countsByMonth.map(({ month, count }) => `${formatMonthLabel(month)} ${formatNumber(count)}`).join("; ")}.`,
      details.length
        ? `The CSV includes all ${formatNumber(details.length)} matching incidents.`
        : "No matching records were found."
    ];

    return {
      handled: true,
      tool: "incident_detail_list",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "incident_detail_list",
        dataSource: "detail incident rows",
        rowCount: details.length,
        facility,
        period: activeMonths.join(", "),
        note: categoryLabel ? `category=${categoryLabel}` : null
      }),
      visual: details.length
        ? makePreviewTableVisual({
            title: `${label} ${titleSubject}`,
            subtitle: `${periodLabel} · ${formatNumber(details.length)} incidents`,
            valueLabel: "Incident detail",
            columns: ["Date", "Community", "Resident", "Unit", "Category", "Incident type", "Description"],
            rows: tableRows,
            totalRows: details.length
          })
        : undefined,
      artifact: details.length
        ? {
            type: "csv",
            filename: `${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${categoryFilter === "awol" ? "awol-elopement" : "incident-detail"}-${activeMonths.join("-")}.csv`,
            mimeType: "text/csv",
            content: rowsToCsv(exportRows),
            rowSetId,
            rowCount: exportRows.length
          }
        : undefined,
      provenance: {
        rowSetId,
        rowCount: exportRows.length,
        dataset: "incidents"
      },
      summary: {
        recordCount: details.length,
        uniqueResidentCount: residentCounts.size,
        topResidents,
        countsByMonth,
        initialPreviewCount: Math.min(details.length, defaultDetailPreviewRows)
      },
      actions: []
    };
  }

  return Object.freeze({
    buildIncidentDetailListTool
  });
}

export function createIncidentResidentDriverTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    filterByFacility,
    filterIncidentsByCategory,
    findFacility,
    formatDateLabel,
    formatIncidentCategoryFilterLabel,
    formatMonthLabel,
    formatNumber,
    getFacilityNameById,
    getIncidentCategoryFilter,
    getIncidentDetailRows,
    getIncidentRows,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    latestMonth,
    makeTrace
  } = dependencies;

  function buildIncidentResidentDriversTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const portfolioDetailRows = getIncidentDetailRows(communities, reportsSummary);
    const portfolioAggregateRows = getIncidentRows(communities, reportsSummary);
    const sourceDetailRows = filterByFacility(portfolioDetailRows, facility);
    const sourceAggregateRows = filterByFacility(portfolioAggregateRows, facility);
    const categoryFilter = getIncidentCategoryFilter(content, [...portfolioDetailRows, ...portfolioAggregateRows]);
    const detailRows = filterIncidentsByCategory(sourceDetailRows, categoryFilter);
    const aggregateRows = filterIncidentsByCategory(sourceAggregateRows, categoryFilter);
    const availableMonths = [...new Set(detailRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const aggregateMonths = [...new Set(aggregateRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, [...new Set([...availableMonths, ...aggregateMonths])].sort());
    const allLoadedIntent = /\b(ever|all[-\s]?time|all loaded|loaded history|full history|entire history)\b/i.test(String(content ?? ""));
    const activeMonths = requestedMonths.length
      ? requestedMonths
      : allLoadedIntent
        ? availableMonths
        : [latestMonth(detailRows) ?? availableMonths.at(-1)].filter(Boolean);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    const categoryLabel = formatIncidentCategoryFilterLabel(categoryFilter);

    if (missingMonths.length || !activeMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "incident_resident_drivers",
        label,
        subject: `${categoryLabel ? `${categoryLabel} ` : ""}resident incident drivers`,
        dataSource: "detail incident rows",
        availableMonths,
        missingMonths,
        requestedMonths: activeMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, filterIncidentsByCategory(portfolioDetailRows, categoryFilter)),
        requiredFields: ["resident", "date", "incident type", "description"],
        facility,
        note: categoryLabel ? `category=${categoryLabel}` : null
      });
    }

    const scopedRows = detailRows
      .filter((row) => !activeMonths.length || activeMonths.includes(row.month_bucket))
      .sort((left, right) => String(right.incident_date ?? right.received_at ?? "").localeCompare(String(left.incident_date ?? left.received_at ?? "")));
    const residents = new Map();

    scopedRows.forEach((row) => {
      const residentKey = row.resident_id || row.client_id || row.client_name || "unknown";
      const existing = residents.get(residentKey) ?? {
        residentKey,
        residentName: row.client_name || row.resident_name || row.resident_id || "Unknown resident",
        residentId: row.resident_id || row.client_id || "—",
        facilityId: row.facility_id,
        communityName: row.facility_name || getFacilityNameById(communities, row.facility_id),
        unit: row.unit_number || "—",
        count: 0,
        categories: new Map(),
        latestDate: null,
        latestDescription: null
      };
      const category = row.category || row.incident_type || "Uncategorized";
      existing.count += 1;
      existing.categories.set(category, (existing.categories.get(category) ?? 0) + 1);
      const rowDate = row.incident_date ?? row.received_at ?? null;
      if (!existing.latestDate || String(rowDate ?? "").localeCompare(String(existing.latestDate ?? "")) > 0) {
        existing.latestDate = rowDate;
        existing.latestDescription = row.email_body || row.description || row.summary || row.notes || row.assistance_given || null;
      }
      residents.set(residentKey, existing);
    });

    const ranked = [...residents.values()]
      .sort((left, right) => right.count - left.count || String(left.residentName).localeCompare(String(right.residentName)));
    const periodLabel = activeMonths.length > 2
      ? `${formatMonthLabel(activeMonths[0])} to ${formatMonthLabel(activeMonths.at(-1))}`
      : activeMonths.map(formatMonthLabel).join(" and ");
    const subject = categoryLabel ? `${categoryLabel} incidents` : "incidents";
    const leader = ranked[0] ?? null;
    const topCount = leader?.count ?? 0;
    const tiedLeaders = topCount
      ? ranked.filter((entry) => entry.count === topCount)
      : [];
    const topResidentLine = tiedLeaders.length > 1
      ? `Top residents: ${tiedLeaders.map((entry) => entry.residentName).join(" and ")} tied at ${formatNumber(topCount)} rows.`
      : leader
        ? `Top resident: ${leader.residentName} with ${formatNumber(leader.count)} row${leader.count === 1 ? "" : "s"}.`
        : "No resident rows matched this slice.";
    const topCategoryFor = (entry) => [...entry.categories.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] ?? "—";

    return {
      handled: true,
      tool: "incident_resident_drivers",
      text: [
        `${label} resident incident drivers`,
        scopedRows.length
          ? `${periodLabel}: ${formatNumber(scopedRows.length)} ${subject} across ${formatNumber(ranked.length)} resident${ranked.length === 1 ? "" : "s"}.`
          : `${periodLabel}: 0 matching ${subject}.`,
        topResidentLine,
        ranked.length > tiedLeaders.length ? `Next: ${ranked.slice(tiedLeaders.length, tiedLeaders.length + 4).map((entry) => `${entry.residentName} (${formatNumber(entry.count)})`).join(", ")}.` : null
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool: "incident_resident_drivers",
        dataSource: "detail incident rows grouped by resident",
        rowCount: scopedRows.length,
        facility,
        period: activeMonths.join(", "),
        note: categoryLabel ? `category=${categoryLabel}` : null
      }),
      visual: {
        type: "table",
        title: `${label} Resident Incident Drivers`,
        subtitle: `${periodLabel} · ${categoryLabel ?? "All categories"}`,
        valueLabel: "Incidents",
        columns: ["Resident", "Community", "Unit", "Incidents", "Top category", "Latest incident"],
        rows: ranked.slice(0, 12).map((entry) => ({
          label: entry.residentName,
          value: entry.count,
          cells: [
            entry.residentName,
            entry.communityName,
            entry.unit,
            formatNumber(entry.count),
            topCategoryFor(entry),
            formatDateLabel(entry.latestDate)
          ]
        }))
      },
      actions: []
    };
  }

  return Object.freeze({
    buildIncidentResidentDriversTool
  });
}

export function createIncidentRateTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    filterByFacility,
    findFacility,
    formatMonthLabel,
    formatNumber,
    formatSigned,
    getIncidentRows,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    latestMonth,
    makeTrace,
    sum,
    sumIncidentCountsByKey
  } = dependencies;

  function buildIncidentRateTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const portfolioIncidentRows = getIncidentRows(communities, reportsSummary);
    const portfolioCensusRows = communities.census ?? [];
    const scopedIncidentRows = filterByFacility(portfolioIncidentRows, facility);
    const scopedCensusRows = filterByFacility(portfolioCensusRows, facility);
    const availableMonths = [...new Set([
      ...scopedCensusRows.map((row) => row.month_bucket).filter(Boolean),
      ...scopedIncidentRows.map((row) => row.month_bucket).filter(Boolean)
    ])].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const activeMonth = requestedMonths.find((month) => availableMonths.includes(month)) ?? availableMonths.at(-1) ?? latestMonth(communities.incidents ?? []);
    const missingRequestedMonths = requestedMonths.filter((month) => !availableMonths.includes(month));

    if (missingRequestedMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "incident_rate",
        label,
        subject: "incident rate",
        dataSource: "monthly incidents and census",
        availableMonths,
        missingMonths: missingRequestedMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, [
          ...portfolioIncidentRows,
          ...portfolioCensusRows
        ]),
        facility
      });
    }

    const incidentsFor = (targetFacility) => sum(
      filterByFacility(portfolioIncidentRows, targetFacility).filter((row) => row.month_bucket === activeMonth),
      (row) => row.incident_count
    );
    const censusFor = (targetFacility) => sum(
      filterByFacility(portfolioCensusRows, targetFacility).filter((row) => row.month_bucket === activeMonth),
      (row) => row.census
    );
    const metricFor = (targetFacility) => {
      const incidents = incidentsFor(targetFacility);
      const census = censusFor(targetFacility);
      return {
        facility: targetFacility,
        communityName: targetFacility?.community_name ?? "Portfolio",
        incidents,
        census,
        incidentsPer100: census ? (incidents / census) * 100 : null
      };
    };
    const metrics = facility
      ? [metricFor(facility)]
      : communities.facilities
        .map(metricFor)
        .sort((left, right) => Number(right.incidentsPer100 || 0) - Number(left.incidentsPer100 || 0));
    const totalIncidents = sum(metrics, (row) => row.incidents);
    const totalCensus = sum(metrics, (row) => row.census);
    const portfolioRate = totalCensus ? (totalIncidents / totalCensus) * 100 : null;
    const top = metrics[0];
    const monthLabel = formatMonthLabel(activeMonth);
    const rateText = (value) => value == null ? "—" : Number(value).toFixed(1);
    const text = facility
      ? `${label}'s incident rate was ${rateText(top?.incidentsPer100)} incidents per 100 residents in ${monthLabel}. It had ${formatNumber(top?.incidents)} incidents and a census of ${formatNumber(top?.census)}.`
      : `In ${monthLabel}, ${top?.communityName ?? "the leading community"} had the highest incident rate at ${rateText(top?.incidentsPer100)} incidents per 100 residents. Across the portfolio, the rate was ${rateText(portfolioRate)} from ${formatNumber(totalIncidents)} incidents and a census of ${formatNumber(totalCensus)}.`;

    return {
      handled: true,
      tool: "incident_rate",
      text,
      trace: makeTrace({
        tool: "incident_rate",
        dataSource: "monthly incidents divided by monthly census",
        rowCount: metrics.length,
        facility,
        period: activeMonth
      }),
      visual: {
        type: "bar_chart",
        title: facility ? `${label} Incident Rate` : "Incident Rate by Community",
        subtitle: `${monthLabel} incidents per 100 residents`,
        valueLabel: "Rate / 100",
        rows: metrics.map((row) => ({
          label: row.communityName,
          value: Number(row.incidentsPer100 || 0),
          meta: `${formatNumber(row.incidents)} incidents / census ${formatNumber(row.census)}`,
          cells: [
            row.communityName,
            formatNumber(row.incidents),
            formatNumber(row.census),
            rateText(row.incidentsPer100)
          ]
        }))
      },
      actions: [
        { label: "Open Incident Center", kind: "route", route: "/incidents" }
      ]
    };
  }

  function buildIncidentRateChangeTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const portfolioIncidentRows = getIncidentRows(communities, reportsSummary);
    const portfolioCensusRows = communities.census ?? [];
    const incidentRows = filterByFacility(portfolioIncidentRows, facility);
    const censusRows = filterByFacility(portfolioCensusRows, facility);
    const availableMonths = [...new Set([
      ...incidentRows.map((row) => row.month_bucket).filter(Boolean),
      ...censusRows.map((row) => row.month_bucket).filter(Boolean)
    ])].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const comparisonMonths = requestedMonths.length >= 2
      ? requestedMonths.slice(0, 2).sort()
      : availableMonths.slice(-2);
    const [leftMonth, rightMonth] = comparisonMonths;
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    const facilities = facility ? [facility] : communities.facilities;

    if (!leftMonth || !rightMonth || missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "incident_rate_change",
        label: facility?.community_name ?? "Portfolio",
        subject: "incident-rate change",
        dataSource: "monthly census and incident category rows",
        availableMonths,
        missingMonths,
        requestedMonths: comparisonMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, [...portfolioIncidentRows, ...portfolioCensusRows]),
        facility,
        note: "requires incidents and census for both periods"
      });
    }

    const valueFor = (rows, facilityId, month, field) => sum(
      rows.filter((row) => row.facility_id === facilityId && row.month_bucket === month),
      (row) => row[field]
    );
    const comparisonRows = facilities.map((facilityRow) => {
      const leftIncidents = valueFor(incidentRows, facilityRow.facility_id, leftMonth, "incident_count");
      const rightIncidents = valueFor(incidentRows, facilityRow.facility_id, rightMonth, "incident_count");
      const leftCensus = valueFor(censusRows, facilityRow.facility_id, leftMonth, "census");
      const rightCensus = valueFor(censusRows, facilityRow.facility_id, rightMonth, "census");
      const leftRate = leftCensus > 0 ? (leftIncidents / leftCensus) * 100 : null;
      const rightRate = rightCensus > 0 ? (rightIncidents / rightCensus) * 100 : null;
      return {
        facilityId: facilityRow.facility_id,
        communityName: facilityRow.community_name,
        leftIncidents,
        rightIncidents,
        leftCensus,
        rightCensus,
        leftRate,
        rightRate,
        rateDelta: leftRate == null || rightRate == null ? null : rightRate - leftRate
      };
    });
    const comparableRows = comparisonRows
      .filter((row) => row.rateDelta != null)
      .sort((left, right) => Number(right.rateDelta) - Number(left.rateDelta));
    const leader = comparableRows[0] ?? null;

    if (!leader) {
      return {
        handled: true,
        tool: "incident_rate_change",
        text: `Incident-rate change cannot be calculated for ${formatMonthLabel(leftMonth)} and ${formatMonthLabel(rightMonth)} because matching census denominators are missing.`,
        trace: makeTrace({
          tool: "incident_rate_change",
          dataSource: "monthly census and incident category rows",
          rowCount: incidentRows.length + censusRows.length,
          facility,
          period: `${leftMonth} vs ${rightMonth}`,
          note: "missing census denominator"
        })
      };
    }

    const categoryRows = incidentRows.filter((row) => row.facility_id === leader.facilityId && [leftMonth, rightMonth].includes(row.month_bucket));
    const leftCategories = new Map(sumIncidentCountsByKey(categoryRows.filter((row) => row.month_bucket === leftMonth), (row) => row.category || "Uncategorized"));
    const rightCategories = new Map(sumIncidentCountsByKey(categoryRows.filter((row) => row.month_bucket === rightMonth), (row) => row.category || "Uncategorized"));
    const categoryChanges = [...new Set([...leftCategories.keys(), ...rightCategories.keys()])]
      .map((category) => ({
        category,
        left: Number(leftCategories.get(category) || 0),
        right: Number(rightCategories.get(category) || 0),
        delta: Number(rightCategories.get(category) || 0) - Number(leftCategories.get(category) || 0)
      }))
      .filter((row) => row.delta !== 0)
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
    const direction = Number(leader.rateDelta) > 0 ? "increased" : Number(leader.rateDelta) < 0 ? "decreased" : "was unchanged";
    const calculationLines = [
      `- In ${formatMonthLabel(leftMonth)}, ${formatNumber(leader.leftIncidents)} incidents and a census of ${formatNumber(leader.leftCensus)} produced a rate of ${leader.leftRate.toFixed(1)} per 100 residents.`,
      `- In ${formatMonthLabel(rightMonth)}, ${formatNumber(leader.rightIncidents)} incidents and a census of ${formatNumber(leader.rightCensus)} produced a rate of ${leader.rightRate.toFixed(1)} per 100 residents.`
    ];
    const categoryLines = categoryChanges.length
      ? categoryChanges.slice(0, 5).map((row) => `- ${row.category} ${row.delta > 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(row.delta))}, from ${formatNumber(row.left)} to ${formatNumber(row.right)}.`)
      : ["Category-level detail is unavailable for the identified community and periods."];

    return {
      handled: true,
      tool: "incident_rate_change",
      text: [
        `${leader.communityName} had the largest incident-rate change, ${direction === "increased" ? "rising" : direction === "decreased" ? "falling" : "holding steady"} by ${Math.abs(leader.rateDelta).toFixed(1)} from ${leader.leftRate.toFixed(1)} to ${leader.rightRate.toFixed(1)} incidents per 100 residents.`,
        "Calculation",
        ...calculationLines,
        `Category changes at ${leader.communityName}`,
        ...categoryLines
      ].join("\n"),
      trace: makeTrace({
        tool: "incident_rate_change",
        dataSource: "monthly census joined to monthly incident category rows",
        rowCount: categoryRows.length + censusRows.filter((row) => [leftMonth, rightMonth].includes(row.month_bucket)).length,
        facility,
        period: `${leftMonth} vs ${rightMonth}`,
        note: "rate = incidents / census * 100"
      }),
      visual: {
        type: "table",
        title: facility ? `${facility.community_name} Incident-Rate Change` : "Incident-Rate Change by Community",
        subtitle: `${formatMonthLabel(leftMonth)} vs ${formatMonthLabel(rightMonth)}`,
        valueLabel: "Rate / 100",
        columns: [
          "Community",
          `${formatMonthLabel(leftMonth)} census`,
          `${formatMonthLabel(leftMonth)} incidents`,
          `${formatMonthLabel(leftMonth)} rate`,
          `${formatMonthLabel(rightMonth)} census`,
          `${formatMonthLabel(rightMonth)} incidents`,
          `${formatMonthLabel(rightMonth)} rate`,
          "Rate change"
        ],
        rows: comparableRows.map((row) => ({
          label: row.communityName,
          value: Number(row.rateDelta || 0),
          cells: [
            row.communityName,
            formatNumber(row.leftCensus),
            formatNumber(row.leftIncidents),
            row.leftRate.toFixed(1),
            formatNumber(row.rightCensus),
            formatNumber(row.rightIncidents),
            row.rightRate.toFixed(1),
            formatSigned(row.rateDelta.toFixed(1))
          ]
        }))
      },
      actions: [
        { label: `Show ${leader.communityName} category comparison`, kind: "tool", tool: "incident_category_comparison", prompt: `Compare ${leader.communityName} ${formatMonthLabel(leftMonth)} incidents to ${formatMonthLabel(rightMonth)} incidents by category` },
        { label: `Open ${leader.communityName} incidents`, kind: "route", route: `/communities/${leader.facilityId}?focus=incidents` }
      ]
    };
  }

  return Object.freeze({
    buildIncidentRateTool,
    buildIncidentRateChangeTool
  });
}

export function createIncidentTopCategoryTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    formatMonthLabel,
    formatNumber,
    formatPercent,
    getFacilityNameById,
    getIncidentRows,
    getRequestedMonthBuckets,
    makeTrace
  } = dependencies;

  function buildTopIncidentCategoryByCommunityTool(content, communities, reportsSummary) {
    const incidentRows = getIncidentRows(communities, reportsSummary);
    const months = [...new Set(incidentRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, months);
    const activeMonths = requestedMonths.length ? requestedMonths : [months.at(-1)].filter(Boolean);
    const missingMonths = requestedMonths.filter((month) => !months.includes(month));
    const scopedRows = incidentRows.filter((row) => activeMonths.includes(row.month_bucket));
    const byCommunity = new Map();

    scopedRows.forEach((row) => {
      const facilityId = row.facility_id;
      if (!facilityId) return;
      const key = `${row.month_bucket}:${facilityId}`;
      if (!byCommunity.has(key)) {
        byCommunity.set(key, {
          month: row.month_bucket,
          facilityId,
          communityName: row.facility_name || getFacilityNameById(communities, facilityId),
          categories: new Map(),
          total: 0
        });
      }

      const entry = byCommunity.get(key);
      const category = row.category || "Uncategorized";
      const count = Number(row.incident_count || 0);
      entry.categories.set(category, (entry.categories.get(category) ?? 0) + count);
      entry.total += count;
    });

    const rows = [...byCommunity.values()]
      .map((entry) => {
        const [topCategory, topCount] = [...entry.categories.entries()]
          .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] ?? ["—", 0];
        return {
          month: entry.month,
          communityName: entry.communityName,
          topCategory,
          topCount,
          total: entry.total,
          share: entry.total ? (topCount / entry.total) * 100 : 0
        };
      })
      .sort((left, right) => left.month.localeCompare(right.month) || right.topCount - left.topCount || left.communityName.localeCompare(right.communityName));

    if (missingMonths.length || !activeMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "top_incident_category_by_community",
        label: "Portfolio",
        subject: "top incident category by community",
        dataSource: "monthly category rows",
        availableMonths: months,
        missingMonths,
        requestedMonths: activeMonths,
        rowCount: scopedRows.length
      });
    }

    return {
      handled: true,
      tool: "top_incident_category_by_community",
      text: [
        "Top incident category by community",
        `${activeMonths.map(formatMonthLabel).join(" and ")} top categories:`,
        ...rows.map((row) => `- ${formatMonthLabel(row.month)} · ${row.communityName}: ${row.topCategory} (${formatNumber(row.topCount)} of ${formatNumber(row.total)}, ${formatPercent(row.share)})`)
      ].join("\n"),
      trace: makeTrace({
        tool: "top_incident_category_by_community",
        dataSource: "monthly category rows",
        rowCount: scopedRows.length,
        period: activeMonths.join(", ")
      }),
      visual: {
        type: "table",
        title: "Top Incident Category by Community",
        subtitle: activeMonths.map(formatMonthLabel).join(" and "),
        valueLabel: "Incidents",
        columns: ["Month", "Community", "Top category", "Category incidents", "Total incidents", "Share"],
        rows: rows.map((row) => ({
          label: row.communityName,
          value: row.topCount,
          cells: [
            formatMonthLabel(row.month),
            row.communityName,
            row.topCategory,
            formatNumber(row.topCount),
            formatNumber(row.total),
            formatPercent(row.share)
          ]
        }))
      },
      actions: [
        { label: "Open Incident Center", kind: "route", route: "/incidents" },
        { label: "Export incident rows", kind: "tool", tool: "export_csv", prompt: "export incidents to csv" }
      ]
    };
  }

  return Object.freeze({
    buildTopIncidentCategoryByCommunityTool
  });
}

export function createIncidentToolDefinitions(handlers) {
  return INCIDENT_TOOL_NAMES.map((name) => {
    const handler = handlers[name];
    if (typeof handler !== "function") {
      throw new TypeError(`Incident tool ${name} requires a handler.`);
    }
    return Object.freeze({ name, domain: "incidents", handler });
  });
}

export { INCIDENT_TOOL_NAMES };

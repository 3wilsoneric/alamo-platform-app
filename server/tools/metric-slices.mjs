export function createMetricSliceTools({
  average,
  buildIncidentCategoryComparisonTool,
  buildUnavailablePeriodResult,
  calculateWeightedCompliance,
  countBySum,
  filterByFacility,
  filterIncidentsByCategory,
  findFacility,
  formatIncidentBreakdownSubject,
  formatIncidentCategoryFilterLabel,
  formatMonthLabel,
  formatNumber,
  formatSigned,
  getDocumentationRows,
  getFacilityNameById,
  getIncidentCategoryFilter,
  getIncidentRows,
  getMedicationComplianceRows,
  getMedicationRefusalRows,
  getPortfolioFallbackScopes,
  getRequestedMonthBuckets,
  getResidentRows,
  groupRowsByKey,
  isAdmissionIntent,
  latestMonth,
  limitRowsForRequest,
  makePreviewTableVisual,
  makeTrace,
  normalizeText,
  sum,
  wantsAllRows
}) {
  function getMetricIntent(content) {
    const text = normalizeText(content);
    if (/\b(census|occupancy|headcount|population|resident count)\b/.test(text)) return "census";
    if (/\b(incident|incidents|awol|elopement)\b/.test(text)) return "incidents";
    if (isAdmissionIntent(content)) return "residents";
    if (/\b(compliance|given|scheduled)\b/.test(text) && /\b(medication|meds|emar)\b/.test(text)) return "medication_compliance";
    if (/\b(refusal|refusals|refused|not given)\b/.test(text)) return "medication_refusals";
    if (/\b(documentation|doc gap|note gap|last note|care note)\b/.test(text)) return "documentation";
    if (/\b(age|ages|demographic|demographics)\b/.test(text)) return "age";
    if (/\b(los|length of stay|tenure)\b/.test(text)) return "los";
    return "incidents";
  }

  function getGroupIntent(content, metric) {
    const text = normalizeText(content);
    if (/\b(category|categories|type|types)\b/.test(text)) return "category";
    if (/\b(community|communities|facility|facilities)\b/.test(text)) return "community";
    if (/\b(resident|residents|client|clients|who)\b/.test(text)) return "resident";
    if (/\b(month|monthly|trends?|over time|time series)\b/.test(text)) return "month";
    if (/\b(medication|medications|meds)\b/.test(text) && metric === "medication_refusals") return "medication";
    return "community";
  }

  function makeTableVisual({ title, subtitle, columns, rows, valueLabel = "Value" }) {
    return {
      type: "table",
      title,
      subtitle,
      valueLabel,
      columns,
      rows: rows.map((row) => ({
        label: row.label,
        value: Number(row.value || 0),
        cells: row.cells
      }))
    };
  }

  function buildSliceMetricTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const metric = getMetricIntent(content);
    const group = getGroupIntent(content, metric);
    const label = facility?.community_name ?? "Portfolio";
    let rows = [];
    let grouped = [];
    let title = "";
    let subtitle = "";
    let columns = [];
    let valueLabel = "Value";
    let dataSource = "tool context tables";
    let traceNote = `metric=${metric}; group=${group}`;
    let tracePeriod = null;

    if (metric === "incidents") {
      const portfolioRows = getIncidentRows(communities, reportsSummary);
      rows = filterByFacility(portfolioRows, facility);
      const months = [...new Set(rows.map((row) => row.month_bucket).filter(Boolean))].sort();
      const parsedRequestedMonths = getRequestedMonthBuckets(content, months);
      const missingMonths = parsedRequestedMonths.filter((month) => !months.includes(month));
      const requestedMonths = parsedRequestedMonths.filter((month) => months.includes(month));
      const categoryFilter = getIncidentCategoryFilter(content, rows);
      const categoryLabel = formatIncidentCategoryFilterLabel(categoryFilter);

      if (missingMonths.length) {
        return buildUnavailablePeriodResult({
          tool: "slice_metric",
          label,
          subject: formatIncidentBreakdownSubject(categoryLabel),
          dataSource: "monthly incident category rows",
          availableMonths: months,
          missingMonths,
          requestedMonths: parsedRequestedMonths,
          fallbackScopes: getPortfolioFallbackScopes(facility, filterIncidentsByCategory(portfolioRows, categoryFilter)),
          facility,
          note: `metric=incidents; group=${group}${categoryLabel ? `; category=${categoryLabel}` : ""}`
        });
      }

      const activeMonths = requestedMonths.length ? requestedMonths : [months.at(-1)].filter(Boolean);
      const multiMonth = activeMonths.length > 1;
      const periodRows = activeMonths.length && !/\b(all months|history|historical|trends?|over time)\b/i.test(content)
        ? rows.filter((row) => activeMonths.includes(row.month_bucket))
        : rows;
      const scopedRows = filterIncidentsByCategory(periodRows, categoryFilter);
      const groupKey = group === "category"
        ? (row) => multiMonth ? `${formatMonthLabel(row.month_bucket)} · ${row.category || "Uncategorized"}` : row.category || "Uncategorized"
        : (row) => multiMonth ? `${formatMonthLabel(row.month_bucket)} · ${row.facility_name || getFacilityNameById(communities, row.facility_id)}` : row.facility_name || getFacilityNameById(communities, row.facility_id);
      grouped = group === "month"
        ? countBySum(scopedRows, (row) => row.month_bucket, (row) => row.incident_count)
            .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
            .map(([month, value]) => [formatMonthLabel(month), value])
            .slice(wantsAllRows(content) ? 0 : -12)
        : limitRowsForRequest(countBySum(scopedRows, groupKey, (row) => row.incident_count), content, 12);
      if (!multiMonth && group === "community" && categoryFilter && !facility) {
        const countsByCommunity = new Map(grouped);
        grouped = communities.facilities
          .map((community) => [community.community_name, Number(countsByCommunity.get(community.community_name) || 0)])
          .sort((left, right) => right[1] - left[1]);
      }
      title = `${label} ${categoryLabel ? `${categoryLabel} ` : ""}Incident Slice`;
      const periodDescription = activeMonths.length ? activeMonths.map(formatMonthLabel).join(" and ") : "loaded periods";
      subtitle = `${group === "month" ? "By month" : group === "category" ? `By category for ${periodDescription}` : `By community for ${periodDescription}`}`;
      columns = [group === "month" ? "Month" : multiMonth ? `Month · ${group === "category" ? "Category" : "Community"}` : group === "category" ? "Category" : "Community", "Incidents"];
      valueLabel = "Incidents";
      dataSource = "monthly incident category records";
      traceNote = `metric=${metric}; group=${group}${categoryLabel ? `; category=${categoryLabel}` : ""}`;
      tracePeriod = activeMonths.join(", ");
      rows = scopedRows;
    } else if (metric === "census") {
      rows = filterByFacility(communities.census ?? [], facility);
      const months = [...new Set(rows.map((row) => row.month_bucket).filter(Boolean))].sort();
      const requestedMonths = getRequestedMonthBuckets(content, months);
      const missingMonths = requestedMonths.filter((month) => !months.includes(month));
      if (missingMonths.length) {
        return buildUnavailablePeriodResult({
          tool: "slice_metric",
          label,
          subject: "census records",
          dataSource: "monthly census records",
          availableMonths: months,
          missingMonths,
          requestedMonths,
          fallbackScopes: getPortfolioFallbackScopes(facility, communities.census),
          facility,
          note: "metric=census; requested period unavailable"
        });
      }
      const scopedRows = requestedMonths.length
        ? rows.filter((row) => requestedMonths.includes(row.month_bucket))
        : rows;
      const multiMonth = requestedMonths.length > 1;
      const groupKey = (row) => getFacilityNameById(communities, row.facility_id);
      const monthGroups = countBySum(scopedRows, (row) => row.month_bucket, (row) => row.census)
        .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
        .map(([month, value]) => [formatMonthLabel(month), value]);
      const communityGroups = multiMonth && group === "community"
        ? countBySum(
            scopedRows,
            (row) => `${formatMonthLabel(row.month_bucket)} · ${groupKey(row)}`,
            (row) => row.census
          ).sort((left, right) => String(left[0]).localeCompare(String(right[0])))
        : countBySum(
            scopedRows.filter((row) => row.month_bucket === latestMonth(scopedRows)),
            groupKey,
            (row) => row.census
          );
      grouped = group === "month"
        ? (wantsAllRows(content) ? monthGroups : monthGroups.slice(-12))
        : communityGroups;
      title = `${label} Census Slice`;
      subtitle = group === "month"
        ? "By month"
        : multiMonth && group === "community"
          ? `By community for ${requestedMonths.map(formatMonthLabel).join(" through ")}`
          : `By community for ${formatMonthLabel(latestMonth(scopedRows))}`;
      columns = [group === "month" ? "Month" : multiMonth && group === "community" ? "Month · Community" : "Community", "Census"];
      valueLabel = "Census";
      dataSource = "monthly census records";
      tracePeriod = requestedMonths.join(", ") || null;
    } else if (metric === "medication_compliance") {
      rows = filterByFacility(getMedicationComplianceRows(reportsSummary), facility);
      const latest = latestMonth(rows);
      const scopedRows = group === "month" ? rows : rows.filter((row) => row.month_bucket === latest);
      const groupedRows = groupRowsByKey(
        scopedRows,
        group === "month"
          ? (row) => row.month_bucket
          : (row) => row.facility_name || getFacilityNameById(communities, row.facility_id)
      );
      const sortedGroups = [...groupedRows.entries()]
        .sort(([left], [right]) => String(left).localeCompare(String(right)));
      grouped = (group === "month" && !wantsAllRows(content) ? sortedGroups.slice(-12) : sortedGroups)
        .map(([key, keyRows]) => [
          group === "month" ? formatMonthLabel(key) : key,
          calculateWeightedCompliance(keyRows).compliancePct ?? 0
        ]);
      title = `${label} Medication Compliance`;
      subtitle = group === "month" ? "By month" : `${formatMonthLabel(latest)} by community`;
      columns = [group === "month" ? "Month" : "Community", "Compliance %"];
      valueLabel = "Compliance %";
      dataSource = "medication compliance monthly records";
    } else if (metric === "medication_refusals") {
      rows = filterByFacility(getMedicationRefusalRows(reportsSummary), facility);
      const groupKey = group === "medication" || facility
        ? (row) => row.medication || "Unspecified"
        : (row) => getFacilityNameById(communities, row.facility_id);
      grouped = countBySum(rows, groupKey, (row) => row.refusals);
      title = `${label} Medication Refusals`;
      subtitle = group === "medication" || facility ? "By medication" : "By community";
      columns = [group === "medication" || facility ? "Medication" : "Community", "Refusals"];
      valueLabel = "Refusals";
      dataSource = "medication refusal summary records";
    } else if (metric === "documentation") {
      rows = filterByFacility(getDocumentationRows(reportsSummary), facility);
      if (group === "resident" || facility) {
        grouped = [...rows]
          .sort((left, right) => Number(right.days_since_last_note || 0) - Number(left.days_since_last_note || 0))
          .map((row) => [row.resident_name || row.resident_id || "Unknown resident", Number(row.days_since_last_note || 0)]);
        columns = ["Resident", "Days since last note"];
        subtitle = "Largest resident documentation gaps";
      } else {
        grouped = countBySum(rows, (row) => getFacilityNameById(communities, row.facility_id), () => 1);
        columns = ["Community", "Documentation gaps"];
        subtitle = "Documentation gaps by community";
      }
      title = `${label} Documentation Slice`;
      valueLabel = columns[1] ?? "Value";
      dataSource = "documentation status records";
    } else {
      rows = filterByFacility(getResidentRows(communities, reportsSummary), facility);
      const field = metric === "los" ? "los_days" : "age";
      grouped = facility
        ? [[label, average(rows.map((row) => row[field]))]]
        : communities.facilities.map((community) => {
            const communityRows = rows.filter((row) => row.facility_id === community.facility_id);
            return [community.community_name, average(communityRows.map((row) => row[field]))];
          }).sort((left, right) => right[1] - left[1]);
      title = `${label} Resident ${metric === "los" ? "Length of Stay" : "Age"} Slice`;
      subtitle = "Current residents";
      columns = ["Community", metric === "los" ? "Average LOS days" : "Average age"];
      valueLabel = columns[1] ?? "Value";
      dataSource = "resident profiles";
    }

    grouped = limitRowsForRequest(grouped, content, 12);
    const tableRows = grouped.map(([rowLabel, value]) => ({
      label: rowLabel,
      value: Number(value || 0),
      cells: [rowLabel, Number(value || 0).toFixed(Number(value) % 1 === 0 ? 0 : 1)]
    }));

    return {
      handled: true,
      tool: "slice_metric",
      text: [
        `${title}`,
        `${subtitle}.`,
        tableRows.length ? `Leading results: ${tableRows.slice(0, 5).map((row) => `${row.label} (${row.cells[1]})`).join(", ")}.` : "No records matched this slice."
      ].join("\n"),
      trace: makeTrace({
        tool: "slice_metric",
        dataSource,
        rowCount: rows.length,
        facility,
        period: tracePeriod,
        note: traceNote
      }),
      visual: tableRows.length
        ? makePreviewTableVisual({
            title,
            subtitle,
            columns,
            rows: tableRows,
            valueLabel
          })
        : undefined,
      actions: [
        { label: "Show available data slices", kind: "tool", tool: "tool_context_catalog", prompt: "show available analytical slices" },
        { label: `Export ${label} ${metric}`, kind: "tool", tool: "export_csv", prompt: `export ${label} ${metric} to csv` }
      ]
    };
  }

  function buildComparePeriodsTool(content, communities, reportsSummary) {
    const normalizedContent = normalizeText(content);
    if (/\b(incident|incidents)\b/.test(normalizedContent) && /\b(category|categories|type|types|breakdown)\b/.test(normalizedContent)) {
      return buildIncidentCategoryComparisonTool(content, communities, reportsSummary);
    }

    const facility = findFacility(content, communities);
    const metric = getMetricIntent(content);
    const label = facility?.community_name ?? "Portfolio";
    const portfolioSourceRows = metric === "census"
      ? communities.census ?? []
      : metric === "medication_compliance"
        ? getMedicationComplianceRows(reportsSummary)
        : getIncidentRows(communities, reportsSummary);
    const sourceRows = filterByFacility(portfolioSourceRows, facility);
    const months = [...new Set(sourceRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, months);
    const comparisonMonths = requestedMonths.length >= 2
      ? requestedMonths.slice(0, 2).sort()
      : [months.at(-2), months.at(-1)].filter(Boolean);
    const missingMonths = requestedMonths.filter((month) => !months.includes(month));

    if (requestedMonths.length > 2) {
      return {
        handled: true,
        tool: "compare_periods",
        text: `This comparison accepts exactly two periods, but ${formatNumber(requestedMonths.length)} were requested: ${requestedMonths.map(formatMonthLabel).join(", ")}. Choose two months, or request a trend.`,
        trace: makeTrace({
          tool: "compare_periods",
          dataSource: "tool context tables",
          rowCount: 0,
          facility,
          period: requestedMonths.join(", "),
          note: "too many comparison periods"
        })
      };
    }
    const [leftMonth, rightMonth] = comparisonMonths;

    if (!leftMonth || !rightMonth || missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "compare_periods",
        label,
        subject: `${metric} period comparison`,
        dataSource: "tool context tables",
        availableMonths: months,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, portfolioSourceRows),
        facility,
        rowCount: sourceRows.length,
        note: missingMonths.length ? `missing: ${missingMonths.join(", ")}` : "missing comparison months"
      });
    }

    const valueForMonth = (month) => {
      const rows = sourceRows.filter((row) => row.month_bucket === month);
      if (metric === "census") return sum(rows, (row) => row.census);
      if (metric === "medication_compliance") return calculateWeightedCompliance(rows).compliancePct ?? 0;
      return sum(rows, (row) => row.incident_count);
    };
    const leftValue = valueForMonth(leftMonth);
    const rightValue = valueForMonth(rightMonth);
    const delta = rightValue - leftValue;
    const valueLabel = metric === "census" ? "Census" : metric === "medication_compliance" ? "Compliance %" : "Incidents";

    return {
      handled: true,
      tool: "compare_periods",
      text: [
        `${label} ${valueLabel.toLowerCase()} comparison`,
        `${formatMonthLabel(leftMonth)}: ${Number(leftValue).toFixed(metric === "medication_compliance" ? 1 : 0)}. ${formatMonthLabel(rightMonth)}: ${Number(rightValue).toFixed(metric === "medication_compliance" ? 1 : 0)} (${formatSigned(delta)}).`
      ].join("\n"),
      trace: makeTrace({
        tool: "compare_periods",
        dataSource: "tool context tables",
        rowCount: sourceRows.length,
        facility,
        period: `${leftMonth} vs ${rightMonth}`,
        note: `metric=${metric}`
      }),
      visual: makeTableVisual({
        title: `${label} ${valueLabel} Comparison`,
        subtitle: `${formatMonthLabel(leftMonth)} vs ${formatMonthLabel(rightMonth)}`,
        columns: ["Metric", formatMonthLabel(leftMonth), formatMonthLabel(rightMonth), "Delta"],
        valueLabel,
        rows: [
          {
            label: valueLabel,
            value: rightValue,
            cells: [
              valueLabel,
              Number(leftValue).toFixed(metric === "medication_compliance" ? 1 : 0),
              Number(rightValue).toFixed(metric === "medication_compliance" ? 1 : 0),
              formatSigned(delta)
            ]
          }
        ]
      })
    };
  }

  return {
    buildComparePeriodsTool,
    buildSliceMetricTool
  };
}

export function createMetricSliceToolDefinitions({ compare_periods, slice_metric }) {
  return [
    { name: "compare_periods", domain: "platform", handler: compare_periods },
    { name: "slice_metric", domain: "platform", handler: slice_metric }
  ];
}

const TREND_TOOL_NAMES = Object.freeze([
  "community_time_series"
]);

export function createCommunityTimeSeriesTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    formatMonthLabel,
    getIncidentRows,
    getRequestedMonthBuckets,
    makeTrace,
    normalizeText
  } = dependencies;

  function buildCommunityTimeSeriesTool(content, communities, reportsSummary) {
    const text = normalizeText(content);
    const requestsCensus = /\b(census|occupancy|population)\b/.test(text);
    const requestsIncidents = /\b(incident|incidents)\b/.test(text);
    const metrics = requestsCensus && requestsIncidents
      ? ["census", "incidents"]
      : [requestsIncidents ? "incidents" : "census"];
    const rowsForMetric = (metric) => metric === "incidents"
      ? getIncidentRows(communities, reportsSummary)
      : communities.census ?? [];
    const availableByMetric = metrics.map((metric) => new Set(rowsForMetric(metric).map((row) => row.month_bucket).filter(Boolean)));
    const availableMonths = [...(availableByMetric[0] ?? new Set())]
      .filter((month) => availableByMetric.every((available) => available.has(month)))
      .sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "community_time_series",
        label: "Portfolio",
        subject: `community ${metrics.join(" and ")} time series`,
        dataSource: metrics.length > 1 ? "monthly census and incident category rows" : metrics[0] === "incidents" ? "monthly incident category rows" : "monthly census rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        note: `metric=${metrics.join("+")}`
      });
    }

    const activeMonths = requestedMonths.length >= 2
      ? requestedMonths
      : availableMonths.slice(/\b(year|12 month|twelve month)\b/.test(text) ? -12 : -6);
    const facilities = communities.facilities ?? [];
    const heatmap = /\b(heatmap|heat map|matrix)\b/.test(text);
    const series = metrics.map((metric) => {
      const sourceRows = rowsForMetric(metric);
      const valueByMonthFacility = new Map();
      sourceRows
        .filter((row) => activeMonths.includes(row.month_bucket))
        .forEach((row) => {
          const key = `${row.month_bucket}:${row.facility_id}`;
          const value = metric === "incidents" ? Number(row.incident_count || 0) : Number(row.census || 0);
          valueByMonthFacility.set(key, Number(valueByMonthFacility.get(key) || 0) + value);
        });
      const rows = activeMonths.map((month) => {
        const values = facilities.map((facility) => Number(valueByMonthFacility.get(`${month}:${facility.facility_id}`) || 0));
        return {
          month,
          values,
          total: values.reduce((sumValue, value) => sumValue + value, 0)
        };
      });
      const valueLabel = metric === "incidents" ? "Incidents" : "Census";
      const visual = {
        type: heatmap && metrics.length === 1 ? "heatmap" : "multi_line_chart",
        title: `Community ${valueLabel} ${heatmap && metrics.length === 1 ? "Heatmap" : "Trends"}`,
        subtitle: activeMonths.length ? `${formatMonthLabel(activeMonths[0])} to ${formatMonthLabel(activeMonths.at(-1))}` : "No periods available",
        valueLabel,
        columns: ["Month", ...facilities.map((facility) => facility.community_name)],
        rows: rows.map((row) => ({
          label: formatMonthLabel(row.month),
          value: row.total,
          cells: [
            formatMonthLabel(row.month),
            ...facilities.map((facility, index) => row.values[index] ?? Number(valueByMonthFacility.get(`${row.month}:${facility.facility_id}`) || 0))
          ]
        }))
      };
      return { metric, sourceRows, rows, visual };
    });
    const primary = series[0];
    if (!primary) {
      return buildUnavailablePeriodResult({
        tool: "community_time_series",
        label: "Portfolio",
        subject: "community time series",
        dataSource: "monthly census and incident category records",
        availableMonths: [],
        missingMonths: requestedMonths,
        requestedMonths,
        note: "no metric series could be constructed"
      });
    }
    const supporting = series.slice(1);
    const dataSource = metrics.length > 1
      ? "monthly census and incident category rows"
      : primary.metric === "incidents" ? "monthly incident category rows" : "monthly census rows";
    const trace = makeTrace({
      tool: "community_time_series",
      dataSource,
      rowCount: series.reduce((total, item) => total + item.sourceRows.filter((row) => activeMonths.includes(row.month_bucket)).length, 0),
      period: activeMonths.join(", "),
      note: `metric=${metrics.join("+")}; visual=${heatmap && metrics.length === 1 ? "heatmap" : "multi-series"}`
    });

    return {
      handled: true,
      tool: "community_time_series",
      text: [
        `${metrics.map((metric) => metric === "incidents" ? "Incidents" : "Census").join(" and ")} by community over time`,
        `Period: ${activeMonths.length ? `${formatMonthLabel(activeMonths[0])} through ${formatMonthLabel(activeMonths.at(-1))}` : "no loaded months"}.`,
        `Communities shown: ${facilities.map((facility) => facility.community_name).join(", ")}.`
      ].join("\n"),
      trace,
      visual: primary.visual,
      supportingVisuals: supporting.map((item) => ({
        visual: item.visual,
        trace: {
          ...trace,
          dataSource: item.metric === "incidents" ? "monthly incident category rows" : "monthly census rows",
          rowCount: item.sourceRows.filter((row) => activeMonths.includes(row.month_bucket)).length,
          note: `metric=${item.metric}; visual=multi-series`
        }
      })),
      actions: [
        { label: "Open Communities Overview", kind: "route", route: "/communities" },
        { label: `Export ${metrics.join(" and ")}`, kind: "tool", tool: "export_csv", prompt: `export ${metrics.join(" and ")} to csv` }
      ]
    };
  }

  return Object.freeze({
    buildCommunityTimeSeriesTool
  });
}

export function createTrendToolDefinitions(handlers) {
  return TREND_TOOL_NAMES.map((name) => {
    const handler = handlers[name];
    if (typeof handler !== "function") {
      throw new TypeError(`Trend tool ${name} requires a handler.`);
    }
    return Object.freeze({ name, domain: "trends", handler });
  });
}

export function createCommunityHistoryTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    calculateWeightedCompliance,
    filterByFacility,
    findClosestMonthWindow,
    findFacility,
    formatMonthLabel,
    formatNumber,
    formatSigned,
    getIncidentRows,
    getMedicationComplianceRows,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    getScopedCensusSeries,
    groupRowsByKey,
    makeTrace,
    sum,
    sumIncidentCountsByKey
  } = dependencies;

  function formatMonthList(months = []) {
    const labels = months.map((month) => formatMonthLabel(month));
    if (labels.length <= 2) return labels.join(" and ");
    return `${labels[0]} through ${labels.at(-1)}`;
  }

  function formatRequestedMonthList(months = []) {
    const labels = formatMonthList(months);
    const raw = months.filter(Boolean).join(", ");
    return raw ? `${labels} (${raw})` : labels;
  }

  function resolveOperatingMonths(requestedMonths, availableMonths) {
    const available = [...new Set(availableMonths)].filter(Boolean).sort();
    const requested = [...new Set(requestedMonths)].filter(Boolean).sort();
    if (!available.length) return { months: [], note: null };
    if (!requested.length) {
      const latest = available.at(-1);
      return {
        months: latest ? [latest] : [],
        note: `No month was specified. The latest available month is ${formatMonthLabel(latest)}.`
      };
    }

    const availableSet = new Set(available);
    const loadedRequested = requested.filter((month) => availableSet.has(month));
    if (loadedRequested.length === requested.length) return { months: requested, note: null };
    if (loadedRequested.length) {
      const missing = requested.filter((month) => !availableSet.has(month));
      return {
        months: loadedRequested,
        note: `Available coverage includes ${formatMonthList(loadedRequested)}. ${formatRequestedMonthList(missing)} is unavailable for this community operating view.`
      };
    }

    const closest = findClosestMonthWindow(requested, available);
    return {
      months: closest,
      note: closest.length
        ? `${formatRequestedMonthList(requested)} is unavailable. The closest available ${closest.length > 1 ? "window" : "month"} is ${formatMonthList(closest)}.`
        : null
    };
  }

  function formatTopCategories(categories = []) {
    if (!categories.length) return "No incident categories are available for this selection";
    return categories.map(([category, count]) => `${category} (${formatNumber(count)})`).join(", ");
  }

  function buildCommunityHistoryTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const censusRows = getScopedCensusSeries(communities.census ?? [], facility);
    const incidentRows = filterByFacility(getIncidentRows(communities, reportsSummary), facility);
    const complianceRows = filterByFacility(getMedicationComplianceRows(reportsSummary), facility);
    const availableMonths = [...new Set([
      ...censusRows.map((row) => row.month_bucket).filter(Boolean),
      ...incidentRows.map((row) => row.month_bucket).filter(Boolean),
      ...complianceRows.map((row) => row.month_bucket).filter(Boolean)
    ])].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const { months: activeMonths, note: fallbackNote } = resolveOperatingMonths(requestedMonths, availableMonths);
    const missingMonths = activeMonths.filter((month) => !availableMonths.includes(month));

    if (!activeMonths.length || missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "community_history",
        label,
        subject: "community month detail",
        dataSource: "monthly census, incident, and medication rows",
        availableMonths,
        missingMonths,
        requestedMonths: activeMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, [
          ...(communities.census ?? []),
          ...getIncidentRows(communities, reportsSummary),
          ...getMedicationComplianceRows(reportsSummary)
        ]),
        facility
      });
    }

    const censusByMonth = new Map(censusRows.map((row) => [row.month_bucket, Number(row.census || 0)]));
    const incidentRowsByMonth = groupRowsByKey(incidentRows, (row) => row.month_bucket);
    const complianceRowsByMonth = groupRowsByKey(complianceRows, (row) => row.month_bucket);
    const previousCensusFor = (month) => {
      const previousMonth = censusRows
        .map((row) => row.month_bucket)
        .filter((candidate) => candidate < month)
        .sort()
        .at(-1);
      return previousMonth ? censusByMonth.get(previousMonth) ?? null : null;
    };
    const previousIncidentTotalFor = (month) => {
      const previousMonth = incidentRows
        .map((row) => row.month_bucket)
        .filter((candidate) => candidate < month)
        .sort()
        .at(-1);
      return previousMonth ? sum(incidentRowsByMonth.get(previousMonth) ?? [], (row) => row.incident_count) : null;
    };
    const historyRows = activeMonths.map((month) => {
      const monthIncidentRows = incidentRowsByMonth.get(month) ?? [];
      const monthComplianceRows = complianceRowsByMonth.get(month) ?? [];
      const census = censusByMonth.get(month) ?? null;
      const previousCensus = census == null ? null : previousCensusFor(month);
      const incidentTotal = sum(monthIncidentRows, (row) => row.incident_count);
      const previousIncidentTotal = previousIncidentTotalFor(month);
      const topCategories = sumIncidentCountsByKey(monthIncidentRows, (row) => row.category).slice(0, 3);
      const compliance = calculateWeightedCompliance(monthComplianceRows).compliancePct;

      return {
        month,
        census,
        censusDelta: census == null || previousCensus == null ? null : census - previousCensus,
        incidentTotal,
        incidentDelta: previousIncidentTotal == null ? null : incidentTotal - previousIncidentTotal,
        topCategories,
        compliance
      };
    });
    const lines = [
      `${label} operating picture`,
      fallbackNote,
      "Monthly detail",
      ...historyRows.map((row) => {
        const movementClause = (delta) => {
          if (delta == null) return "";
          if (Number(delta) === 0) return ", unchanged from the previous month";
          return `, ${Number(delta) > 0 ? "up" : "down"} ${formatNumber(Math.abs(Number(delta)))} from the previous month`;
        };
        const censusSentence = row.census == null
          ? "census is unavailable."
          : `census was ${formatNumber(row.census)}${movementClause(row.censusDelta)}.`;
        const incidentSentence = `Incidents totaled ${formatNumber(row.incidentTotal)}${movementClause(row.incidentDelta)}.`;
        const context = [
          row.topCategories.length ? `Leading categories were ${formatTopCategories(row.topCategories)}` : null,
          Number.isFinite(row.compliance) ? `medication compliance was ${row.compliance.toFixed(1)}%` : null
        ].filter(Boolean);
        const contextSentence = context.length ? `${context.join(", and ")}.` : "";
        return `- ${formatMonthLabel(row.month)}: ${censusSentence} ${incidentSentence}${contextSentence ? ` ${contextSentence}` : ""}`;
      })
    ].filter(Boolean);
    const singleMonth = historyRows.length === 1 ? historyRows[0] : null;
    const visualColumns = ["Month", "Census", "Census change", "Incidents", "Incident change", "Top incident categories", "Medication compliance"];
    const tableRows = historyRows.map((row) => ({
      label: formatMonthLabel(row.month),
      value: Number(row.incidentTotal || row.census || 0),
      cells: [
        formatMonthLabel(row.month),
        row.census == null ? "—" : formatNumber(row.census),
        row.censusDelta == null ? "—" : formatSigned(row.censusDelta),
        formatNumber(row.incidentTotal),
        row.incidentDelta == null ? "—" : formatSigned(row.incidentDelta),
        row.topCategories.length
          ? row.topCategories.map(([category, count]) => `${category} (${formatNumber(count)})`).join(", ")
          : "—",
        Number.isFinite(row.compliance) ? `${row.compliance.toFixed(1)}%` : "—"
      ]
    }));
    const visualRows = singleMonth
      ? [
          {
            label: "Census",
            value: Number(singleMonth.census || 0),
            cells: [
              "Census",
              singleMonth.census == null ? "—" : formatNumber(singleMonth.census),
              singleMonth.censusDelta == null ? "No prior comparison" : `${formatSigned(singleMonth.censusDelta)} from prior month`
            ]
          },
          {
            label: "Incidents",
            value: Number(singleMonth.incidentTotal || 0),
            cells: [
              "Incidents",
              formatNumber(singleMonth.incidentTotal),
              singleMonth.incidentDelta == null ? "No prior comparison" : `${formatSigned(singleMonth.incidentDelta)} from prior month`
            ]
          },
          {
            label: "Leading category",
            value: Number(singleMonth.topCategories[0]?.[1] || 0),
            cells: [
              "Leading category",
              singleMonth.topCategories[0]?.[0] ?? "—",
              singleMonth.topCategories[0] ? `${formatNumber(singleMonth.topCategories[0][1])} incidents` : "No category data"
            ]
          },
          {
            label: "Medication compliance",
            value: Number(singleMonth.compliance || 0),
            cells: [
              "Medication compliance",
              Number.isFinite(singleMonth.compliance) ? `${singleMonth.compliance.toFixed(1)}%` : "—",
              formatMonthLabel(singleMonth.month)
            ]
          }
        ]
      : tableRows;

    return {
      handled: true,
      tool: "community_history",
      truthState: "valid_rows",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "community_history",
        dataSource: "monthly census, incident, and medication rows",
        rowCount: censusRows.length + incidentRows.length + complianceRows.length,
        facility,
        period: activeMonths.join(", "),
        note: fallbackNote ? `historical community operating detail; ${fallbackNote}` : "historical community operating detail"
      }),
      summary: { historyRows: tableRows },
      visual: {
        type: singleMonth ? "summary_card" : "table",
        title: `${label} Operating Picture`,
        subtitle: singleMonth
          ? formatMonthLabel(singleMonth.month)
          : `${formatMonthLabel(activeMonths[0])} to ${formatMonthLabel(activeMonths.at(-1))}`,
        valueLabel: singleMonth ? null : "Months",
        columns: visualColumns,
        rows: visualRows
      },
      actions: [
        { label: `Open ${facility ? label : "Communities Overview"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}` : "/communities" }
      ]
    };
  }

  return {
    buildCommunityHistoryTool
  };
}

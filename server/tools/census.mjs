export function createCensusVisualTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    filterByFacility,
    findFacility,
    formatMonthLabel,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets
  } = dependencies;

  function buildAdHocCensusVisual(content, communities) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const rows = filterByFacility(communities.census ?? [], facility)
      .sort((left, right) => left.month_bucket.localeCompare(right.month_bucket));
    const availableMonths = [...new Set(rows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "ad_hoc_census_chart",
        label,
        subject: "census chart",
        dataSource: "monthly census rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, communities.census ?? []),
        facility
      });
    }
    const grouped = facility
      ? rows.slice(-10).map((row) => [formatMonthLabel(row.month_bucket), Number(row.census || 0)])
      : [...rows
          .reduce((acc, row) => {
            acc.set(row.month_bucket, (acc.get(row.month_bucket) ?? 0) + Number(row.census || 0));
            return acc;
          }, new Map())
          .entries()]
          .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
          .slice(-10)
          .map(([month, value]) => [formatMonthLabel(month), value]);

    return {
      handled: true,
      tool: "ad_hoc_census_chart",
      text: `${label} census trend from the available monthly census rows.`,
      visual: {
        type: "line_chart",
        title: `${label} Census Trend`,
        subtitle: "Latest available monthly points",
        valueLabel: "Census",
        rows: grouped.map(([rowLabel, value]) => ({
          label: rowLabel,
          value: Number(value)
        }))
      },
      actions: [
        { label: `Open ${facility ? `${label} census` : "Communities Overview"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=census` : "/communities" },
        { label: `Export ${facility ? label : "census series"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} census to csv` }
      ]
    };
  }

  return {
    buildAdHocCensusVisual
  };
}

export function createCensusTrendTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    findFacility,
    formatMonthLabel,
    formatNumber,
    formatSigned,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    getScopedCensusSeries,
    makeTrace
  } = dependencies;

  function buildCensusTrendTool(content, communities) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const rows = getScopedCensusSeries(communities.census ?? [], facility);
    const availableMonths = [...new Set(rows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "census_trend",
        label,
        subject: "census trend",
        dataSource: "monthly census rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, communities.census ?? []),
        facility
      });
    }
    const requestedRows = requestedMonths.length
      ? rows.filter((row) => requestedMonths.includes(row.month_bucket))
      : [];
    const latest = rows.at(-1);
    const prior = rows.at(-2);
    const targetRow = requestedRows.at(-1) ?? latest;
    const targetIndex = targetRow ? rows.findIndex((row) => row.month_bucket === targetRow.month_bucket) : -1;
    const targetPrior = targetIndex > 0 ? rows[targetIndex - 1] : null;
    const lines = [`${label} census${requestedRows.length ? "" : " trend"}`];
    if (requestedRows.length === 1) {
      const row = requestedRows[0];
      lines.push(`${formatMonthLabel(row.month_bucket)} census: ${formatNumber(row.census)}.`);
      if (targetPrior) lines.push(`Movement vs ${formatMonthLabel(targetPrior.month_bucket)}: ${formatSigned(Number(row.census || 0) - Number(targetPrior.census || 0))}.`);
    } else if (requestedRows.length > 1) {
      lines.push("Requested months");
      requestedRows.forEach((row) => lines.push(`- ${formatMonthLabel(row.month_bucket)}: ${formatNumber(row.census)}`));
    } else {
      if (latest) lines.push(`${formatMonthLabel(latest.month_bucket)} census: ${formatNumber(latest.census)}.`);
      if (latest && prior) lines.push(`Movement vs ${formatMonthLabel(prior.month_bucket)}: ${formatSigned(Number(latest.census || 0) - Number(prior.census || 0))}.`);
      lines.push("Last six points");
      rows.slice(-6).forEach((row) => lines.push(`- ${formatMonthLabel(row.month_bucket)}: ${formatNumber(row.census)}`));
    }
    const visibleRows = rows.slice(-12);
    const pointCountIntent = requestedRows.length === 1 &&
      /\b(how many|count|headcount|what was|number of)\b/i.test(content) &&
      !/\b(trends?|history|over time|trajectory)\b/i.test(content);

    return {
      handled: true,
      tool: "census_trend",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "census_trend",
        dataSource: "monthly census rows",
        rowCount: rows.length,
        facility,
        period: requestedMonths.length ? requestedMonths.join(", ") : latest?.month_bucket ?? null
      }),
      visual: pointCountIntent
        ? {
            type: "summary_card",
            title: `${label} Census`,
            subtitle: formatMonthLabel(targetRow?.month_bucket),
            valueLabel: "Census",
            rows: [
              {
                label: "Census",
                value: Number(targetRow?.census || 0),
                cells: ["Census", formatNumber(targetRow?.census || 0), formatMonthLabel(targetRow?.month_bucket)]
              },
              ...(targetPrior
                ? [{
                    label: "Change from prior month",
                    value: Number(targetRow?.census || 0) - Number(targetPrior.census || 0),
                    cells: [
                      "Change from prior month",
                      formatSigned(Number(targetRow?.census || 0) - Number(targetPrior.census || 0)),
                      `Compared with ${formatMonthLabel(targetPrior.month_bucket)}`
                    ]
                  }]
                : [])
            ]
          }
        : {
            type: "line_chart",
            title: `${label} Census Trend`,
            subtitle: rows.length ? `${formatMonthLabel(visibleRows[0]?.month_bucket)} to ${formatMonthLabel(latest?.month_bucket)}` : "No census records matched",
            valueLabel: "Census",
            rows: visibleRows.map((row) => ({
              label: formatMonthLabel(row.month_bucket),
              value: Number(row.census || 0)
            })),
            highlightedLabel: targetRow ? formatMonthLabel(targetRow.month_bucket) : undefined,
            highlightedValue: targetRow ? Number(targetRow.census || 0) : undefined
          },
      summary: targetRow
        ? {
            communityName: label,
            period: targetRow.month_bucket,
            census: Number(targetRow.census || 0),
            movement: targetPrior ? Number(targetRow.census || 0) - Number(targetPrior.census || 0) : null
          }
        : undefined,
      actions: [
        { label: `Open ${facility ? `${label} census` : "Communities Overview"}`, kind: "route", route: facility ? `/communities/${facility.facility_id}?focus=census` : "/communities" },
        { label: `Export ${facility ? label : "census series"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} census to csv` }
      ]
    };
  }

  return {
    buildCensusTrendTool
  };
}

export function createCensusMovementTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    findFacility,
    formatMonthLabel,
    formatNumber,
    formatSigned,
    getFacilityMaps,
    getPortfolioFallbackScopes,
    getRequestedMonthBuckets,
    makeTrace,
    sum
  } = dependencies;

  function buildCensusMovementTool(content, communities) {
    const facility = findFacility(content, communities);
    const facilityNames = getFacilityMaps(communities).byId;
    const censusRows = communities.census ?? [];
    const availableMonths = [...new Set(censusRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "census_movement",
        label: facility?.community_name ?? "Portfolio",
        subject: "census movement",
        dataSource: "monthly census rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, censusRows),
        facility
      });
    }
    const latestCensusMonth = requestedMonths.at(-1) ?? availableMonths.at(-1) ?? null;
    const targetIndex = availableMonths.indexOf(latestCensusMonth);
    const priorCensusMonth = targetIndex > 0 ? availableMonths[targetIndex - 1] : null;
    const current = new Map();
    const prior = new Map();
    censusRows.forEach((row) => {
      if (row.month_bucket === latestCensusMonth) current.set(row.facility_id, Number(row.census || 0));
      if (row.month_bucket === priorCensusMonth) prior.set(row.facility_id, Number(row.census || 0));
    });
    const rows = [...current.entries()]
      .map(([facilityId, census]) => ({
        facilityId,
        communityName: facilityNames.get(facilityId)?.community_name ?? facilityId,
        census,
        priorCensus: prior.get(facilityId) ?? null,
        delta: census - Number(prior.get(facilityId) ?? 0)
      }))
      .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta));
    const scopedRows = facility
      ? rows.filter((row) => String(row.facilityId) === String(facility.facility_id))
      : rows;
    const portfolioCurrent = sum(rows, (row) => row.census);
    const portfolioPrior = sum(rows, (row) => row.priorCensus);
    const scopedRow = scopedRows[0] ?? null;
    const label = facility?.community_name ?? "Portfolio";
    const deltaText = (value) => formatSigned
      ? formatSigned(value)
      : `${value > 0 ? "+" : ""}${formatNumber(value)}`;
    const text = facility
      ? [
          `${label} census movement`,
          scopedRow
            ? `${formatMonthLabel(latestCensusMonth)} census: ${formatNumber(scopedRow.census)} (${deltaText(scopedRow.delta)} vs ${formatMonthLabel(priorCensusMonth)}).`
            : `No census movement row was loaded for ${label} in ${formatMonthLabel(latestCensusMonth)}.`
        ].join("\n")
      : [
          `Portfolio census movement`,
          `${formatMonthLabel(latestCensusMonth)} census: ${formatNumber(portfolioCurrent)} (${portfolioCurrent - portfolioPrior > 0 ? "+" : ""}${formatNumber(portfolioCurrent - portfolioPrior)} vs ${formatMonthLabel(priorCensusMonth)}).`,
          `Largest community moves: ${rows.slice(0, 5).map((row) => `${row.communityName} ${row.delta > 0 ? "+" : ""}${formatNumber(row.delta)} to ${formatNumber(row.census)}`).join("; ")}.`
        ].join("\n");

    return {
      handled: true,
      tool: "census_movement",
      text,
      trace: makeTrace({
        tool: "census_movement",
        dataSource: "monthly census rows",
        rowCount: scopedRows.length,
        facility,
        period: latestCensusMonth
      }),
      visual: {
        type: "bar_chart",
        title: facility ? `${label} Census Movement` : "Census Movement by Community",
        subtitle: `${formatMonthLabel(latestCensusMonth)} vs ${formatMonthLabel(priorCensusMonth)}`,
        valueLabel: "Delta",
        rows: scopedRows.map((row) => ({
          label: row.communityName,
          value: row.delta,
          meta: `Census ${formatNumber(row.census)}`
        }))
      },
      actions: [
        facility
          ? { label: `Open ${label} census`, kind: "route", route: `/communities/${facility.facility_id}?focus=census` }
          : { label: "Open Communities Overview", kind: "route", route: "/communities" },
        { label: `Export ${facility ? label : "census series"}`, kind: "tool", tool: "export_csv", prompt: `export ${facility ? label : "census series"} to csv` }
      ]
    };
  }

  return {
    buildCensusMovementTool
  };
}

export function createCensusHistoryTools(dependencies) {
  const {
    filterByFacility,
    findFacility,
    formatMonthLabel,
    formatNumber,
    formatSigned,
    getFacilityLabel,
    getFacilityMaps,
    makeTrace
  } = dependencies;

  function buildCensusDropHistoryTool(content, communities) {
    const facility = findFacility(content, communities);
    const facilityNames = getFacilityMaps(communities).byId;
    const sourceRows = filterByFacility(communities.census ?? [], facility)
      .map((row) => ({
        facility_id: row.facility_id,
        communityName: facilityNames.get(row.facility_id)?.community_name ?? row.facility_name ?? row.facility_id,
        month_bucket: row.month_bucket,
        census: Number(row.census || 0)
      }))
      .filter((row) => row.month_bucket)
      .sort((left, right) =>
        left.facility_id.localeCompare(right.facility_id) ||
        left.month_bucket.localeCompare(right.month_bucket)
      );
    const availableMonths = [...new Set(sourceRows.map((row) => row.month_bucket))].sort();
    const monthsToInspect = /\b(year|12 month|twelve month|last year)\b/i.test(content)
      ? availableMonths.slice(-12)
      : availableMonths;
    const rowsByFacility = new Map();

    sourceRows
      .filter((row) => monthsToInspect.includes(row.month_bucket))
      .forEach((row) => {
        if (!rowsByFacility.has(row.facility_id)) rowsByFacility.set(row.facility_id, []);
        rowsByFacility.get(row.facility_id).push(row);
      });

    const drops = [];
    const totalsByCommunity = [];

    rowsByFacility.forEach((rows, facilityId) => {
      const sortedRows = [...rows].sort((left, right) => left.month_bucket.localeCompare(right.month_bucket));
      let dropCount = 0;
      let largestDrop = null;

      sortedRows.forEach((row, index) => {
        const prior = sortedRows[index - 1];
        if (!prior) return;
        const delta = row.census - prior.census;
        if (delta < 0) {
          dropCount += 1;
          const drop = {
            facilityId,
            communityName: row.communityName,
            month: row.month_bucket,
            priorMonth: prior.month_bucket,
            census: row.census,
            priorCensus: prior.census,
            delta
          };
          drops.push(drop);
          if (!largestDrop || delta < largestDrop.delta) largestDrop = drop;
        }
      });

      totalsByCommunity.push({
        facilityId,
        communityName: sortedRows[0]?.communityName ?? facilityId,
        dropCount,
        largestDrop
      });
    });

    const sortedDrops = drops.sort((left, right) =>
      left.month.localeCompare(right.month) ||
      left.communityName.localeCompare(right.communityName)
    );
    const rankedCommunities = totalsByCommunity
      .filter((row) => row.dropCount > 0)
      .sort((left, right) => right.dropCount - left.dropCount || (left.largestDrop?.delta ?? 0) - (right.largestDrop?.delta ?? 0));
    const scopeLabel = facility ? getFacilityLabel(facility) : "Portfolio";
    const periodLabel = monthsToInspect.length
      ? `${formatMonthLabel(monthsToInspect[0])} through ${formatMonthLabel(monthsToInspect.at(-1))}`
      : "loaded census history";

    const answerLine = sortedDrops.length
      ? facility
        ? `Yes. ${scopeLabel} had ${formatNumber(sortedDrops.length)} month-over-month census drop${sortedDrops.length === 1 ? "" : "s"} in ${periodLabel}.`
        : `Yes. ${formatNumber(rankedCommunities.length)} communit${rankedCommunities.length === 1 ? "y" : "ies"} had at least one month-over-month census drop in ${periodLabel}.`
      : `No. I did not find a month-over-month census drop in ${periodLabel}.`;
    const detailLine = sortedDrops.length
      ? `Drops found: ${sortedDrops.slice(0, 8).map((row) => `${row.communityName} ${formatMonthLabel(row.priorMonth)} to ${formatMonthLabel(row.month)} (${formatSigned(row.delta)} to ${formatNumber(row.census)})`).join("; ")}.`
      : "Every community with loaded census rows was flat or up month-over-month across this window.";

    return {
      handled: true,
      tool: "census_drop_history",
      text: [
        "Census drop history",
        answerLine,
        detailLine
      ].join("\n"),
      trace: makeTrace({
        tool: "census_drop_history",
        dataSource: "monthly census rows",
        rowCount: sourceRows.length,
        facility,
        period: periodLabel
      }),
      visual: {
        type: "table",
        title: `${scopeLabel} Census Drops`,
        subtitle: periodLabel,
        valueLabel: "Drop",
        columns: ["Community", "From", "To", "Prior census", "Current census", "Change"],
        rows: sortedDrops.length
          ? sortedDrops.map((row) => ({
              label: row.communityName,
              value: row.delta,
              cells: [
                row.communityName,
                formatMonthLabel(row.priorMonth),
                formatMonthLabel(row.month),
                formatNumber(row.priorCensus),
                formatNumber(row.census),
                formatSigned(row.delta)
              ]
            }))
          : totalsByCommunity.map((row) => ({
              label: row.communityName,
              value: 0,
              cells: [row.communityName, "—", "—", "—", "—", "0"]
            }))
      },
      actions: [
        { label: "Show latest census movement", kind: "tool", tool: "census_movement", prompt: `${scopeLabel} latest census movement` },
        { label: "Open Communities Overview", kind: "route", route: "/communities" },
        { label: `Export ${facility ? scopeLabel : "census series"}`, kind: "tool", tool: "export_csv", prompt: `export ${scopeLabel} census to csv` }
      ]
    };
  }

  return {
    buildCensusDropHistoryTool
  };
}

export function createCensusToolDefinitions(handlers) {
  return [
    { name: "ad_hoc_census_chart", domain: "census", handler: handlers.ad_hoc_census_chart },
    { name: "census_trend", domain: "census", handler: handlers.census_trend },
    { name: "census_movement", domain: "census", handler: handlers.census_movement },
    { name: "census_drop_history", domain: "census", handler: handlers.census_drop_history }
  ];
}

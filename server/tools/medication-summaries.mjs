export function createMedicationSummaryTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    filterByFacility,
    findFacility,
    formatMonthLabel,
    formatNumber,
    getFacilityLabel,
    getFacilityMaps,
    getMarMonthlyRows,
    getMedicationComplianceRows,
    getMedicationRefusalRows,
    getPortfolioFallbackScopes,
    getRequestedMedicationName,
    getRequestedMonthBuckets,
    groupRowsByKey,
    latestMonth,
    makeTrace,
    sum
  } = dependencies;

  function buildAdHocMedicationVisual(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const rows = filterByFacility(getMedicationComplianceRows(reportsSummary), facility);
    const grouped = [...rows
          .reduce((acc, row) => {
            const existing = acc.get(row.month_bucket) ?? { given: 0 };
            existing.given += Number(row.given || 0);
            acc.set(row.month_bucket, existing);
            return acc;
          }, new Map())
          .entries()]
          .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
          .slice(-8)
          .map(([month, value]) => [formatMonthLabel(month), value.given]);

    return {
      handled: true,
      tool: "ad_hoc_medication_chart",
      text: `${label} medication administrations given by month.`,
      visual: {
        type: "bar_chart",
        title: `${label} Administrations Given`,
        subtitle: "Recorded administrations given by month",
        valueLabel: "Given",
        rows: grouped.map(([rowLabel, value]) => ({
          label: rowLabel,
          value: Number(value)
        }))
      },
      actions: [
        { label: `Export ${facility ? label : "medication"} given administrations`, kind: "tool", tool: "export_csv", prompt: `export ${label} medication administrations given to csv` }
      ]
    };
  }

  function buildMedicationProfileTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const complianceRows = filterByFacility(getMedicationComplianceRows(reportsSummary), facility);
    const latestComplianceMonth = latestMonth(complianceRows);
    const latestRows = complianceRows.filter((row) => row.month_bucket === latestComplianceMonth);
    const groupedByCommunity = !facility && /\b(by|across|for|each|all)\s+(?:each |all )?(community|communities|facility|facilities)\b/i.test(content);

    if (groupedByCommunity) {
      const facilitiesById = getFacilityMaps(communities).byId;
      const grouped = new Map();
      for (const row of latestRows) {
        const facilityId = String(row.facility_id ?? row.facilityId ?? "");
        const current = grouped.get(facilityId) ?? { given: 0 };
        current.given += Number(row.given || 0);
        grouped.set(facilityId, current);
      }
      const rows = [...grouped.entries()].map(([facilityId, values]) => {
        const communityName = facilitiesById.get(facilityId)?.community_name ?? facilityId ?? "Unknown community";
        const cells = [communityName, formatNumber(values.given)];
        return { label: communityName, value: values.given, cells };
      }).sort((left, right) => Number(right.value) - Number(left.value));
      const groupedGiven = [...grouped.values()].reduce((total, values) => total + values.given, 0);

      return {
        handled: true,
        tool: "medication_profile",
        truthState: latestRows.length ? "valid_rows" : "not_loaded",
        text: [
          "Medication profile by community",
          `The comparison covers ${formatNumber(rows.length)} communities in ${formatMonthLabel(latestComplianceMonth)}.`,
          `${formatNumber(groupedGiven)} administrations were recorded as given.`
        ].filter(Boolean).join("\n"),
        trace: makeTrace({
          tool: "medication_profile",
          dataSource: "medication administration rows",
          rowCount: rows.length,
          period: latestComplianceMonth,
          note: "group=community",
          truthState: latestRows.length ? "valid_rows" : "not_loaded"
        }),
        summary: { given: groupedGiven },
        visual: {
          type: "table",
          title: "Medication Profile by Community",
          subtitle: `${formatMonthLabel(latestComplianceMonth)} medication summary`,
          valueLabel: "Given",
          columns: ["Community", "Given"],
          rows
        },
        actions: []
      };
    }

    const given = sum(latestRows, (row) => row.given);
    const hasGovernedMar = getMarMonthlyRows(reportsSummary).length > 0;

    const lines = [
      `${label} medication profile`,
      `${formatNumber(given)} administrations were recorded as given in ${formatMonthLabel(latestComplianceMonth)}.`
    ];

    return {
      handled: true,
      tool: "medication_profile",
      truthState: latestRows.length ? "valid_rows" : "not_loaded",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "medication_profile",
        dataSource: hasGovernedMar ? "governed MAR monthly medication rows" : "medication administration rows",
        rowCount: latestRows.length,
        facility,
        period: latestComplianceMonth,
        truthState: latestRows.length ? "valid_rows" : "not_loaded"
      }),
      summary: { given },
      visual: {
        type: "summary_card",
        title: `${label} Medication Profile`,
        subtitle: latestComplianceMonth ? `${formatMonthLabel(latestComplianceMonth)} MAR summary` : "Medication summary",
        valueLabel: "Given",
        rows: [
          { label: "Given", value: Number(given || 0), cells: ["Given", formatNumber(given), "Recorded administrations"] }
        ]
      },
      actions: [
        { label: `Show ${label} administrations given`, kind: "tool", tool: "medication_compliance", prompt: `show ${label} medication administrations given latest month` }
      ]
    };
  }

  function buildMedicationRefusalsByCommunityTool(content, communities, reportsSummary) {
    const medicationName = getRequestedMedicationName(content, getMedicationRefusalRows(reportsSummary));
    if (medicationName) {
      const facility = findFacility(content, communities);
      const label = getFacilityLabel(facility);
      return {
        handled: true,
        tool: "medication_refusals_by_community",
        truthState: "summary_not_shown",
        text: `This view shows administrations recorded as given. A medication-specific count for ${medicationName} is not shown here.`,
        trace: makeTrace({
          tool: "medication_refusals_by_community",
          dataSource: "medication administration rows",
          rowCount: 0,
          facility,
          note: `requestedMedication=${medicationName}`,
          truthState: "summary_not_shown"
        }),
        visual: {
          type: "table",
          title: `${label} Administrations Given`,
          subtitle: "Medication-specific count unavailable in this view",
          columns: ["Status"],
          rows: []
        },
        actions: []
      };
    }
    // Legacy tool identifier: requests now resolve to the given-administrations view.
    const givenResult = buildMedicationComplianceTool(content, communities, reportsSummary);
    return { ...givenResult, tool: "medication_refusals_by_community" };

  }

  function buildMedicationComplianceTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = getFacilityLabel(facility);
    const facilityNames = getFacilityMaps(communities).byId;
    const portfolioRows = getMedicationComplianceRows(reportsSummary);
    const rows = filterByFacility(portfolioRows, facility);
    const availableMonths = [...new Set(rows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    const activeMonths = requestedMonths.length ? requestedMonths : [availableMonths.at(-1)].filter(Boolean);

    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "medication_compliance",
        label,
        subject: "administrations given",
        dataSource: "medication compliance rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, portfolioRows),
        facility
      });
    }

    const scopedRows = rows.filter((row) => activeMonths.includes(row.month_bucket));
    if (!scopedRows.length) {
      return {
        handled: true,
        tool: "medication_compliance",
        truthState: "not_loaded",
        text: `${label} administrations given are not available in the current data bundle.`,
        trace: makeTrace({
          tool: "medication_compliance",
          dataSource: "medication administration rows",
          rowCount: 0,
          facility,
          truthState: "not_loaded"
        }),
        visual: {
          type: "table",
          title: `${label} Administrations Given`,
          subtitle: "No administration records available",
          columns: ["Status"],
          rows: [{ label: "Unavailable", value: 0, cells: ["Unavailable"] }]
        },
        actions: []
      };
    }
    const groupedRows = groupRowsByKey(scopedRows, (row) => `${row.month_bucket}:${row.facility_id}`);
    const grouped = [...groupedRows.values()]
      .map((keyRows) => {
        const first = keyRows[0];
        return {
          month: first.month_bucket,
          communityName: facilityNames.get(first.facility_id)?.community_name ?? first.facility_name ?? first.facility_id,
          given: sum(keyRows, (row) => row.given)
        };
      })
      .sort((left, right) => left.month.localeCompare(right.month) || right.given - left.given);
    const multiMonth = activeMonths.length > 1;
    const hasGovernedMar = scopedRows.some((row) => row.source === "governed_mar");
    const chronological = [...grouped].sort((left, right) => left.month.localeCompare(right.month));
    const firstPeriod = chronological[0];
    const lastPeriod = chronological.at(-1);
    const givenChange = firstPeriod && lastPeriod
      ? lastPeriod.given - firstPeriod.given
      : 0;
    const trendSentence = multiMonth && facility && firstPeriod && lastPeriod
      ? `${label} recorded ${formatNumber(firstPeriod.given)} administrations given in ${formatMonthLabel(firstPeriod.month)} and ${formatNumber(lastPeriod.given)} in ${formatMonthLabel(lastPeriod.month)}${givenChange === 0 ? "." : `, a change of ${givenChange > 0 ? "+" : ""}${formatNumber(givenChange)}.`}`
      : null;

    return {
      handled: true,
      tool: "medication_compliance",
      text: [
        trendSentence ?? `${label} medication administrations given`,
        `Period: ${activeMonths.map(formatMonthLabel).join(" and ")}.`,
        grouped.length ? `Administrations given: ${grouped.map((row) => `${multiMonth ? `${formatMonthLabel(row.month)} · ` : ""}${row.communityName} ${formatNumber(row.given)}`).join(", ")}.` : "No given-administration values are loaded for this slice."
      ].join("\n"),
      trace: makeTrace({
        tool: "medication_compliance",
        dataSource: hasGovernedMar ? "governed MAR monthly medication rows" : "medication administration rows",
        rowCount: scopedRows.length,
        facility,
        period: activeMonths.join(", ")
      }),
      visual: {
        type: multiMonth && facility ? "line_chart" : "table",
        title: `${label} Administrations Given`,
        subtitle: activeMonths.map(formatMonthLabel).join(" and "),
        columns: [...(multiMonth ? ["Month"] : []), "Community", "Given"],
        valueLabel: "Given",
        rows: (multiMonth && facility ? chronological : grouped).map((row) => ({
          label: multiMonth && facility ? formatMonthLabel(row.month) : row.communityName,
          value: row.given,
          cells: [
            ...(multiMonth ? [formatMonthLabel(row.month)] : []),
            row.communityName,
            formatNumber(row.given)
          ]
        }))
      },
      actions: [
        { label: `Export ${facility ? label : "medication"} given administrations`, kind: "tool", tool: "export_csv", prompt: `export ${label} medication administrations given to csv` }
      ]
    };
  }

  return Object.freeze({
    buildAdHocMedicationVisual,
    buildMedicationProfileTool,
    buildMedicationRefusalsByCommunityTool,
    buildMedicationComplianceTool
  });
}

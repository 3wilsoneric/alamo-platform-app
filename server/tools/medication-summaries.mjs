export function createMedicationSummaryTools(dependencies) {
  const {
    buildUnavailablePeriodResult,
    calculateWeightedCompliance,
    countBySum,
    filterByFacility,
    findFacility,
    formatMonthLabel,
    formatNumber,
    formatPercent,
    getDocumentationRows,
    getFacilityLabel,
    getFacilityMaps,
    getMarExceptionDetailRows,
    getMarPrnEffectivenessRows,
    getMarMonthlyRows,
    getMedicationComplianceRows,
    getMedicationRefusalRows,
    getPortfolioFallbackScopes,
    getRequestedMedicationName,
    getRequestedMonthBuckets,
    getResidentRows,
    groupRowsByKey,
    latestMonth,
    limitRowsForRequest,
    makeTrace,
    medicationMatches,
    sum
  } = dependencies;

  function buildAdHocMedicationVisual(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const refusalIntent = /\b(refusal|refused|not given)\b/i.test(content);
    const rows = refusalIntent
      ? filterByFacility(getMedicationRefusalRows(reportsSummary), facility)
      : filterByFacility(getMedicationComplianceRows(reportsSummary), facility);
    const grouped = refusalIntent
      ? limitRowsForRequest(countBySum(rows, (row) => row.medication, (row) => row.refusals), content, 8)
      : [...rows
          .reduce((acc, row) => {
            const existing = acc.get(row.month_bucket) ?? { scheduled: 0, given: 0 };
            existing.scheduled += Number(row.total_scheduled || 0);
            existing.given += Number(row.given || 0);
            acc.set(row.month_bucket, existing);
            return acc;
          }, new Map())
          .entries()]
          .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
          .slice(-8)
          .map(([month, value]) => [formatMonthLabel(month), value.scheduled ? (value.given / value.scheduled) * 100 : 0]);

    return {
      handled: true,
      tool: "ad_hoc_medication_chart",
      text: `${label} ${refusalIntent ? "medication refusals by medication" : "medication compliance by month"}.`,
      visual: {
        type: "bar_chart",
        title: `${label} ${refusalIntent ? "Medication Refusals" : "Medication Compliance"}`,
        subtitle: refusalIntent ? "Top refused medications from available data" : "Compliance percentage by month",
        valueLabel: refusalIntent ? "Refusals" : "Compliance %",
        rows: grouped.map(([rowLabel, value]) => ({
          label: rowLabel,
          value: Number(value)
        }))
      },
      actions: [
        { label: `Export ${facility ? label : "medication"} records`, kind: "tool", tool: "export_csv", prompt: `export ${label} ${refusalIntent ? "refusals" : "medication compliance"} to csv` }
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
      const allRefusalRows = getMedicationRefusalRows(reportsSummary);
      const hasMonthlyRefusalGrain = allRefusalRows.some((row) => row.month_bucket);
      const refusalSource = hasMonthlyRefusalGrain
        ? allRefusalRows.filter((row) => !latestComplianceMonth || row.month_bucket === latestComplianceMonth)
        : [];
      const refusalByFacility = new Map();
      for (const row of refusalSource) {
        const facilityId = String(row.facility_id ?? row.facilityId ?? "");
        refusalByFacility.set(facilityId, (refusalByFacility.get(facilityId) ?? 0) + Number(row.refusals || 0));
      }
      const grouped = new Map();
      for (const row of latestRows) {
        const facilityId = String(row.facility_id ?? row.facilityId ?? "");
        const current = grouped.get(facilityId) ?? { scheduled: 0, given: 0, notGiven: 0 };
        current.scheduled += Number(row.total_scheduled || 0);
        current.given += Number(row.given || 0);
        current.notGiven += Number(row.not_given || 0);
        grouped.set(facilityId, current);
      }
      const rows = [...grouped.entries()].map(([facilityId, values]) => {
        const communityName = facilitiesById.get(facilityId)?.community_name ?? facilityId ?? "Unknown community";
        const compliance = values.scheduled ? values.given / values.scheduled * 100 : 0;
        const cells = [
          communityName,
          formatPercent(compliance),
          formatNumber(values.scheduled),
          formatNumber(values.given),
          formatNumber(values.notGiven),
          formatPercent(values.scheduled ? values.notGiven / values.scheduled * 100 : 0)
        ];
        if (hasMonthlyRefusalGrain) {
          cells.push(formatNumber(refusalByFacility.get(facilityId) ?? 0));
        }
        return { label: communityName, value: compliance, cells };
      }).sort((left, right) => Number(left.value) - Number(right.value));
      const groupedScheduled = [...grouped.values()].reduce((total, values) => total + values.scheduled, 0);
      const groupedGiven = [...grouped.values()].reduce((total, values) => total + values.given, 0);
      const groupedNotGiven = [...grouped.values()].reduce((total, values) => total + values.notGiven, 0);
      const groupedStatusDifference = groupedScheduled - groupedGiven - groupedNotGiven;

      return {
        handled: true,
        tool: "medication_profile",
        truthState: latestRows.length ? "valid_rows" : "not_loaded",
        text: [
          "Medication profile by community",
          `The comparison covers ${formatNumber(rows.length)} communities in ${formatMonthLabel(latestComplianceMonth)}.`,
          groupedStatusDifference > 0
            ? `The published given and not-given totals do not account for ${formatNumber(groupedStatusDifference)} scheduled administrations.`
            : null
        ].filter(Boolean).join("\n"),
        trace: makeTrace({
          tool: "medication_profile",
          dataSource: "legacy medication compliance and refusal rows",
          rowCount: rows.length,
          period: latestComplianceMonth,
          note: "group=community",
          truthState: latestRows.length ? "valid_rows" : "not_loaded"
        }),
        summary: {
          refusalCoverage: hasMonthlyRefusalGrain ? "monthly" : "legacy_cumulative",
          cumulativeLegacyRefusals: hasMonthlyRefusalGrain ? null : sum(allRefusalRows, (row) => row.refusals)
        },
        visual: {
          type: "table",
          title: "Medication Profile by Community",
          subtitle: `${formatMonthLabel(latestComplianceMonth)} medication summary`,
          valueLabel: "Compliance",
          columns: [
            "Community",
            "Compliance",
            "Scheduled",
            "Given",
            "Not given",
            "Not-given share",
            ...(hasMonthlyRefusalGrain ? ["Monthly refusals"] : [])
          ],
          rows
        },
        actions: [
          { label: "Show medication exceptions", kind: "tool", tool: "medication_exception_detail", prompt: "show medication exception detail by community" }
        ]
      };
    }

    const scheduled = sum(latestRows, (row) => row.total_scheduled);
    const given = sum(latestRows, (row) => row.given);
    const notGiven = sum(latestRows, (row) => row.not_given);
    const statusDifference = scheduled - given - notGiven;
    const compliance = scheduled ? (given / scheduled) * 100 : 0;
    const allScopedRefusalRows = filterByFacility(getMedicationRefusalRows(reportsSummary), facility);
    const hasMonthlyRefusalGrain = allScopedRefusalRows.some((row) => row.month_bucket);
    const periodRefusalRows = hasMonthlyRefusalGrain
      ? allScopedRefusalRows.filter((row) => !latestComplianceMonth || row.month_bucket === latestComplianceMonth)
      : [];
    const refusalRows = countBySum(
      periodRefusalRows,
      (row) => row.medication || "Unspecified",
      (row) => row.refusals
    )
      .slice(0, 5)
      .map(([medication, refusals]) => ({ medication, refusals }));
    const hasGovernedMar = getMarMonthlyRows(reportsSummary).length > 0;
    const gapRows = filterByFacility(getDocumentationRows(reportsSummary), facility)
      .filter((row) => Number(row.days_since_last_note || 0) > 0)
      .sort((a, b) => Number(b.days_since_last_note || 0) - Number(a.days_since_last_note || 0))
      .slice(0, 5);
    const residents = filterByFacility(getResidentRows(communities, reportsSummary), facility);
    const residentsWithMar = residents.filter((resident) =>
      Number(resident.active_medication_count || 0) > 0 ||
      Number(resident.mar_scheduled_30d || 0) > 0 ||
      resident.mar_compliance_pct_30d != null
    );
    const exceptionRows = filterByFacility(getMarExceptionDetailRows(reportsSummary), facility);
    const latestExceptionMonth = latestMonth(exceptionRows);
    const latestExceptionRows = latestExceptionMonth
      ? exceptionRows.filter((row) => row.month_bucket === latestExceptionMonth)
      : exceptionRows;
    const exceptionText = (row) => [
      row.not_given_reason,
      row.missed_or_held_reason,
      row.administration_outcome,
      row.outcome_category,
      row.administration_note
    ].filter(Boolean).join(" ").toLowerCase();
    const activeMedicationCount = sum(residentsWithMar, (resident) => resident.active_medication_count);
    const belowTargetResidents = residentsWithMar.filter((resident) =>
      Number(resident.mar_scheduled_30d || 0) > 0 &&
      resident.mar_compliance_pct_30d != null &&
      Number(resident.mar_compliance_pct_30d) < 90
    );
    const prnGiven30 = sum(residentsWithMar, (resident) => resident.mar_prn_given_30d);
    const refusalExceptionCount = latestExceptionRows.filter((row) => row.is_refusal || /refus/.test(exceptionText(row))).length;
    const lateExceptionCount = latestExceptionRows.filter((row) => row.is_over_60_minutes_late || Number(row.minutes_late || 0) > 60).length;
    const heldExceptionCount = latestExceptionRows.filter((row) => row.is_on_hold || /\bhold|held\b/.test(exceptionText(row))).length;
    const prnRows = filterByFacility(getMarPrnEffectivenessRows(reportsSummary), facility);
    const latestPrnMonth = latestMonth(prnRows);
    const prnExceptionCount = latestPrnMonth
      ? prnRows.filter((row) => row.month_bucket === latestPrnMonth).length
      : prnRows.length;
    const totalRefusals = sum(periodRefusalRows, (row) => row.refusals);
    const cumulativeLegacyRefusals = hasMonthlyRefusalGrain ? null : sum(allScopedRefusalRows, (row) => row.refusals);

    const lines = [
      `${label} medication profile`,
      `Compliance: ${formatPercent(compliance)} for ${formatMonthLabel(latestComplianceMonth)}.`,
      `Scheduled: ${formatNumber(scheduled)}; given: ${formatNumber(given)}; not given: ${formatNumber(notGiven)}.`
    ];
    if (statusDifference > 0) lines.push(`The published given and not-given totals do not account for ${formatNumber(statusDifference)} scheduled administrations.`);
    if (refusalRows.length) lines.push(`Most refused medications: ${refusalRows.slice(0, 3).map((row) => `${row.medication} (${formatNumber(row.refusals)})`).join(", ")}.`);
    if (hasGovernedMar) lines.push(`${formatNumber(residentsWithMar.length)} residents have current MAR summaries, and ${formatNumber(belowTargetResidents.length)} were below 90% compliance over the last 30 days.`);
    if (hasGovernedMar) lines.push(`The latest exception detail contains ${formatNumber(latestExceptionRows.length)} records${latestExceptionMonth ? ` for ${formatMonthLabel(latestExceptionMonth)}` : ""}.`);
    if (gapRows.length) lines.push(`Longest current documentation gaps: ${gapRows.map((row) => `${row.resident_name} (${formatNumber(row.days_since_last_note)} days)`).join(", ")}.`);
    if (!hasGovernedMar) lines.push("Resident-level MAR detail is unavailable in this snapshot. These figures come from the published medication summary.");

    return {
      handled: true,
      tool: "medication_profile",
      truthState: latestRows.length ? "valid_rows" : "not_loaded",
      text: lines.join("\n"),
      trace: makeTrace({
        tool: "medication_profile",
        dataSource: hasGovernedMar
          ? "governed MAR monthly medication, refusal, and documentation rows"
          : "legacy medication compliance, refusal, and documentation rows",
        rowCount: latestRows.length + refusalRows.length + latestExceptionRows.length + residentsWithMar.length,
        facility,
        period: latestComplianceMonth,
        truthState: latestRows.length ? "valid_rows" : "not_loaded"
      }),
      summary: {
        scheduled,
        given,
        notGiven,
        compliance,
        activeMedicationCount,
        belowTargetResidents: belowTargetResidents.length,
        prnGiven30,
        exceptionPeriod: latestExceptionMonth,
        refusalCoverage: hasMonthlyRefusalGrain ? "monthly" : "legacy_cumulative",
        cumulativeLegacyRefusals
      },
      visual: {
        type: "summary_card",
        title: `${label} Medication Profile`,
        subtitle: latestComplianceMonth ? `${formatMonthLabel(latestComplianceMonth)} MAR summary` : "Medication summary",
        valueLabel: "Medication profile",
        rows: [
          { label: "Compliance", value: Number(compliance || 0), cells: ["Compliance", formatPercent(compliance), latestComplianceMonth ? formatMonthLabel(latestComplianceMonth) : "No period available"] },
          { label: "Scheduled", value: Number(scheduled || 0), cells: ["Scheduled", formatNumber(scheduled), "Scheduled administrations"] },
          { label: "Given", value: Number(given || 0), cells: ["Given", formatNumber(given), "Recorded as given"] },
          { label: "Not given", value: Number(notGiven || 0), cells: ["Not given", formatNumber(notGiven), "Not-given administrations"] },
          ...(hasMonthlyRefusalGrain ? [{ label: "Refusals", value: Number(totalRefusals || 0), cells: ["Refusals", formatNumber(totalRefusals), latestComplianceMonth ? formatMonthLabel(latestComplianceMonth) : "Available period"] }] : []),
          ...(hasGovernedMar ? [{ label: "Below 90%", value: belowTargetResidents.length, cells: ["Below 90%", formatNumber(belowTargetResidents.length), "Residents below 90% compliance over 30 days"] }] : []),
          ...(hasGovernedMar ? [{ label: "Resident summaries", value: Number(residentsWithMar.length || 0), cells: ["Resident summaries", formatNumber(residentsWithMar.length), "Residents with current MAR summaries"] }] : []),
          ...(hasGovernedMar ? [{ label: "Active medications", value: activeMedicationCount, cells: ["Active medications", formatNumber(activeMedicationCount), "Active orders across resident MAR summaries"] }] : []),
          ...(hasGovernedMar ? [{ label: "PRN given, 30d", value: prnGiven30, cells: ["PRN given, 30d", formatNumber(prnGiven30), "PRN administrations recorded as given"] }] : []),
          ...(hasGovernedMar ? [{ label: "Medication exceptions", value: Number(latestExceptionRows.length || 0), cells: ["Medication exceptions", formatNumber(latestExceptionRows.length), latestExceptionMonth ? formatMonthLabel(latestExceptionMonth) : "Available period"] }] : []),
          ...(hasGovernedMar ? [{ label: "Refusal detail", value: refusalExceptionCount, cells: ["Refusal detail", formatNumber(refusalExceptionCount), latestExceptionMonth ? formatMonthLabel(latestExceptionMonth) : "Available period"] }] : []),
          ...(hasGovernedMar ? [{ label: "Late administrations", value: lateExceptionCount, cells: ["Late administrations", formatNumber(lateExceptionCount), "More than 60 minutes late"] }] : []),
          ...(hasGovernedMar ? [{ label: "Held medications", value: heldExceptionCount, cells: ["Held medications", formatNumber(heldExceptionCount), latestExceptionMonth ? formatMonthLabel(latestExceptionMonth) : "Available period"] }] : []),
          ...(hasGovernedMar ? [{ label: "PRN detail", value: prnExceptionCount, cells: ["PRN detail", formatNumber(prnExceptionCount), latestExceptionMonth ? formatMonthLabel(latestExceptionMonth) : "Available period"] }] : [])
        ]
      },
      actions: [
        { label: `Show ${label} compliance`, kind: "tool", tool: "medication_compliance", prompt: `show ${label} medication compliance latest month` },
        { label: `Show ${label} exception detail`, kind: "tool", tool: "medication_exception_detail", prompt: `show ${label} medication exception detail` }
      ]
    };
  }

  function buildMedicationRefusalsByCommunityTool(content, communities, reportsSummary) {
    const facility = findFacility(content, communities);
    const label = facility?.community_name ?? "Portfolio";
    const facilityNames = getFacilityMaps(communities).byId;
    const portfolioRows = getMedicationRefusalRows(reportsSummary);
    const requestedMedication = getRequestedMedicationName(content, portfolioRows);
    const allRows = filterByFacility(portfolioRows, facility);
    const availableMonths = [...new Set(allRows.map((row) => row.month_bucket).filter(Boolean))].sort();
    const requestedMonths = getRequestedMonthBuckets(content, availableMonths);
    const missingMonths = requestedMonths.filter((month) => !availableMonths.includes(month));
    const activeMonths = requestedMonths.length ? requestedMonths : [availableMonths.at(-1)].filter(Boolean);
    if (missingMonths.length) {
      return buildUnavailablePeriodResult({
        tool: "medication_refusals_by_community",
        label,
        subject: requestedMedication ? `${requestedMedication} medication refusals` : "medication refusals",
        dataSource: "medication refusal rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, portfolioRows),
        facility,
        note: requestedMedication ? `medication=${requestedMedication}; requested period unavailable` : "requested period unavailable"
      });
    }

    const baseRows = activeMonths.length ? allRows.filter((row) => activeMonths.includes(row.month_bucket)) : allRows;
    const rows = requestedMedication ? baseRows.filter((row) => medicationMatches(row, requestedMedication)) : baseRows;
    const hasGovernedMar = rows.some((row) => row.source === "governed_mar");
    const baseHasGovernedMar = baseRows.some((row) => row.source === "governed_mar");
    const verifiedZero = requestedMedication && baseRows.length > 0 && baseHasGovernedMar && sum(rows, (row) => row.refusals) === 0;
    if (verifiedZero) {
      const periodLabel = activeMonths.length ? activeMonths.map(formatMonthLabel).join(" and ") : "loaded period";
      return {
        handled: true,
        tool: "medication_refusals_by_community",
        truthState: "verified_zero",
        text: [
          `${label} ${requestedMedication} refusals`,
          `${periodLabel}: no matching medication refusals.`,
          "Medication records are available for this community and month, making this a verified zero."
        ].join("\n"),
        trace: makeTrace({
          tool: "medication_refusals_by_community",
          dataSource: "governed MAR monthly medication rows",
          rowCount: 0,
          facility,
          period: activeMonths.join(", "),
          note: `medication=${requestedMedication}; verified zero`,
          truthState: "verified_zero"
        }),
        visual: {
          type: "table",
          title: `${label} Medication Refusals`,
          subtitle: `${requestedMedication} · ${periodLabel} · no matching refusals`,
          valueLabel: "Refusals",
          columns: ["Medication", "Refusals"],
          rows: [{ label: requestedMedication, value: 0, cells: [requestedMedication, "0"] }]
        },
        actions: []
      };
    }
    if (requestedMedication && rows.length === 0 && !baseHasGovernedMar) {
      const periodLabel = activeMonths.length ? activeMonths.map(formatMonthLabel).join(" and ") : "available period";
      return {
        handled: true,
        tool: "medication_refusals_by_community",
        truthState: "summary_not_shown",
        text: [
          `${label} ${requestedMedication} refusals`,
          `${periodLabel}: ${requestedMedication} is not included in the cumulative refusal summary for this scope.`,
          "Resident-level MAR detail is unavailable, so this cannot be verified as zero."
        ].join("\n"),
        trace: makeTrace({
          tool: "medication_refusals_by_community",
          dataSource: "medication refusal rows",
          rowCount: 0,
          facility,
          period: activeMonths.join(", "),
          note: `medication=${requestedMedication}; legacy summary not shown`,
          truthState: "summary_not_shown"
        }),
        visual: {
          type: "table",
          title: `${label} Medication Refusals`,
          subtitle: `${requestedMedication} · ${periodLabel} · not included in cumulative summary`,
          valueLabel: "Status",
          columns: ["Medication", "Status"],
          rows: [{ label: requestedMedication, value: 0, cells: [requestedMedication, "Not included in cumulative summary"] }]
        },
        actions: []
      };
    }
    const grouped = limitRowsForRequest(
      countBySum(rows, (row) => facilityNames.get(row.facility_id)?.community_name ?? row.facility_name ?? row.facility_id, (row) => row.refusals),
      content,
      8
    );
    const topMedications = limitRowsForRequest(
      countBySum(rows, (row) => row.medication || "Unspecified", (row) => row.refusals),
      content,
      8
    );

    return {
      handled: true,
      tool: "medication_refusals_by_community",
      truthState: rows.length ? "valid_rows" : "verified_zero",
      text: [
        `${label} medication refusals`,
        requestedMedication ? `Medication: ${requestedMedication}.` : null,
        grouped.length
          ? `Community totals: ${grouped.map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.`
          : "No refusal records are available for this selection.",
        topMedications.length
          ? `Most refused medications: ${topMedications.slice(0, 3).map(([name, count]) => `${name} (${formatNumber(count)})`).join(", ")}.`
          : "Medication-level refusal counts are not available for this slice.",
        hasGovernedMar
          ? "Counts use available MAR records for the displayed period."
          : "Resident-level MAR data is not published in this bundle. These are cumulative refusal totals without a monthly period."
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool: "medication_refusals_by_community",
        dataSource: hasGovernedMar ? "governed MAR monthly medication rows" : "medication refusal rows",
        rowCount: rows.length,
        facility,
        period: activeMonths.join(", "),
        note: requestedMedication ? `medication=${requestedMedication}` : null
      }),
      visual: {
        type: "bar_chart",
        title: `${label} Medication Refusals`,
        subtitle: facility ? "Top refused medications" : "Refusals by community",
        valueLabel: "Refusals",
        rows: (facility ? topMedications : grouped).map(([rowLabel, value]) => ({ label: rowLabel, value: Number(value) }))
      },
      actions: [
        { label: `Export ${facility ? label : "refusals"}`, kind: "tool", tool: "export_csv", prompt: `export ${label} refusals to csv` }
      ]
    };
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
        subject: "medication compliance",
        dataSource: "medication compliance rows",
        availableMonths,
        missingMonths,
        requestedMonths,
        fallbackScopes: getPortfolioFallbackScopes(facility, portfolioRows),
        facility
      });
    }

    const scopedRows = rows.filter((row) => activeMonths.includes(row.month_bucket));
    const groupedRows = groupRowsByKey(scopedRows, (row) => `${row.month_bucket}:${row.facility_id}`);
    const grouped = [...groupedRows.values()]
      .map((keyRows) => {
        const first = keyRows[0];
        const weighted = calculateWeightedCompliance(keyRows);
        const notGiven = sum(keyRows, (row) => row.not_given);
        return {
          month: first.month_bucket,
          communityName: facilityNames.get(first.facility_id)?.community_name ?? first.facility_name ?? first.facility_id,
          scheduled: weighted.scheduled,
          given: weighted.given,
          notGiven,
          compliance: weighted.compliancePct ?? 0
        };
      })
      .sort((left, right) => left.month.localeCompare(right.month) || left.compliance - right.compliance);
    const multiMonth = activeMonths.length > 1;
    const hasGovernedMar = scopedRows.some((row) => row.source === "governed_mar");
    const chronological = [...grouped].sort((left, right) => left.month.localeCompare(right.month));
    const firstPeriod = chronological[0];
    const lastPeriod = chronological.at(-1);
    const complianceChange = firstPeriod && lastPeriod
      ? lastPeriod.compliance - firstPeriod.compliance
      : 0;
    const trendSentence = multiMonth && facility && firstPeriod && lastPeriod
      ? Math.abs(complianceChange) < 0.05
        ? `${label} medication compliance was unchanged at ${formatPercent(lastPeriod.compliance)} from ${formatMonthLabel(firstPeriod.month)} through ${formatMonthLabel(lastPeriod.month)}.`
        : `${label} medication compliance ${complianceChange > 0 ? "increased" : "decreased"} by ${Math.abs(complianceChange).toFixed(1)} percentage points, from ${formatPercent(firstPeriod.compliance)} in ${formatMonthLabel(firstPeriod.month)} to ${formatPercent(lastPeriod.compliance)} in ${formatMonthLabel(lastPeriod.month)}.`
      : null;

    return {
      handled: true,
      tool: "medication_compliance",
      text: [
        trendSentence ?? `${label} medication compliance`,
        `Period: ${activeMonths.map(formatMonthLabel).join(" and ")}.`,
        grouped.length ? `Compliance by community: ${grouped.map((row) => `${multiMonth ? `${formatMonthLabel(row.month)} · ` : ""}${row.communityName} ${formatPercent(row.compliance)}`).join(", ")}.` : "No compliance values are loaded for this slice.",
        hasGovernedMar
          ? "Compliance uses governed scheduled MAR administrations; PRN administrations are excluded from the denominator."
          : "Governed MAR context is not loaded in this snapshot; these figures come from the legacy compliance summary."
      ].join("\n"),
      trace: makeTrace({
        tool: "medication_compliance",
        dataSource: hasGovernedMar ? "governed MAR monthly medication rows" : "legacy medication compliance rows",
        rowCount: scopedRows.length,
        facility,
        period: activeMonths.join(", ")
      }),
      visual: {
        type: multiMonth && facility ? "line_chart" : "table",
        title: `${label} Medication Compliance`,
        subtitle: activeMonths.map(formatMonthLabel).join(" and "),
        columns: [...(multiMonth ? ["Month"] : []), "Community", "Scheduled", "Given", "Not given", "Compliance"],
        valueLabel: "Compliance %",
        rows: (multiMonth && facility ? chronological : grouped).map((row) => ({
          label: multiMonth && facility ? formatMonthLabel(row.month) : row.communityName,
          value: row.compliance,
          cells: [
            ...(multiMonth ? [formatMonthLabel(row.month)] : []),
            row.communityName,
            formatNumber(row.scheduled),
            formatNumber(row.given),
            formatNumber(row.notGiven),
            formatPercent(row.compliance)
          ]
        }))
      },
      actions: [
        { label: `Export ${facility ? label : "medication"} compliance`, kind: "tool", tool: "export_csv", prompt: `export ${label} medication compliance to csv` }
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

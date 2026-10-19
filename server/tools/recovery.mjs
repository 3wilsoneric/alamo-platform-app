export function createUnavailablePeriodRecoveryTools(dependencies) {
  const {
    findClosestMonthWindow,
    formatMonthLabel,
    formatNumber,
    makeTrace,
    normalizeMonthBucket
  } = dependencies;

  function formatLoadedPeriodWindow(months = []) {
    const loadedMonths = [...new Set(months)].filter(Boolean).sort();
    if (!loadedMonths.length) return "No periods are available at that level.";
    if (loadedMonths.length === 1) return `Available period: ${formatMonthLabel(loadedMonths[0])}.`;
    if (loadedMonths.length <= 4) return `Available periods: ${loadedMonths.map(formatMonthLabel).join(", ")}.`;
    return `Available range: ${formatMonthLabel(loadedMonths[0])} through ${formatMonthLabel(loadedMonths.at(-1))} (${formatNumber(loadedMonths.length)} periods).`;
  }

  function findClosestLoadedPeriods(requestedMonths = [], availableMonths = []) {
    return findClosestMonthWindow(requestedMonths, availableMonths);
  }

  function buildClosestPeriodPrompt({ label, subject, periods }) {
    const periodText = periods.map(formatMonthLabel).join(" and ");
    if (periods.length > 1) {
      const comparisonSubject = subject.replace(/\bcomparison\b/i, "").replace(/\s{2,}/g, " ").trim();
      return `compare ${label} ${comparisonSubject} for ${periodText}`;
    }
    return `show ${label} ${subject} for ${periodText}`;
  }

  function getPortfolioFallbackScopes(facility, rows = []) {
    if (!facility) return [];
    const availableMonths = [...new Set(rows.map((row) => normalizeMonthBucket(row.month_bucket)).filter(Boolean))].sort();
    return availableMonths.length ? [{ label: "Portfolio", availableMonths }] : [];
  }

  function formatRequestedGrain(dataSource) {
    return String(dataSource ?? "requested rows")
      .replace(/\btool context tables\b/i, "structured analytical records")
      .replace(/\bdetail incident rows\b/i, "incident records")
      .replace(/\brows unavailable\b/i, "records")
      .replace(/\brows\b/gi, "records")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function buildUnavailablePeriodResult(/** @type {{
    tool: string,
    label?: string,
    subject?: string,
    dataSource: string,
    availableMonths?: string[],
    missingMonths?: string[],
    requestedMonths?: string[],
    fallbackScopes?: Array<{ label: string, availableMonths?: string[] }>,
    requiredFields?: string[],
    facility?: any | null,
    note?: string | null,
    rowCount?: number
  }} */ {
    tool,
    label = "Portfolio",
    subject = "requested slice",
    dataSource,
    availableMonths = [],
    missingMonths = [],
    requestedMonths = missingMonths,
    fallbackScopes = [],
    requiredFields = [],
    facility = null,
    note = null,
    rowCount = 0
  }) {
    const displaySubject = String(subject)
      .replace(/^top incident category by community$/i, "incident category results by community")
      .replace(/\bincidents detail list\b/i, "incident detail")
      .trim();
    const availabilityVerb = /\b(?:results|records|categories|refusals|incidents)\b/i.test(displaySubject) ? "are" : "is";
    const periodLabel = missingMonths.length
      ? missingMonths.map(formatMonthLabel).join(", ")
      : "the requested period";
    const closestPeriods = findClosestLoadedPeriods(requestedMonths, availableMonths);
    const closestPeriodText = closestPeriods.length
      ? closestPeriods.map(formatMonthLabel).join(" and ")
      : null;
    const closestAction = closestPeriods.length
      ? {
          label: closestPeriods.length > 1 ? `Compare ${closestPeriodText}` : `Show ${closestPeriodText}`,
          kind: "tool",
          tool: "run_analysis",
          prompt: buildClosestPeriodPrompt({ label, subject, periods: closestPeriods })
        }
      : null;
    const exactFallbackScope = fallbackScopes.find((scope) => {
      const scopeMonths = new Set(scope.availableMonths ?? []);
      return requestedMonths.length > 0 && requestedMonths.every((month) => scopeMonths.has(month));
    });
    const scopeAction = exactFallbackScope
      ? {
          label: `${requestedMonths.length > 1 ? "Compare" : "Show"} ${exactFallbackScope.label} · ${requestedMonths.map(formatMonthLabel).join(" and ")}`,
          kind: "tool",
          tool: "run_analysis",
          prompt: buildClosestPeriodPrompt({ label: exactFallbackScope.label, subject, periods: requestedMonths })
        }
      : null;
    const requestedLevel = formatRequestedGrain(dataSource);
    const diagnosticRows = [
      ["Requested scope", label],
      ["Requested period", periodLabel],
      ["Requested level", requestedLevel],
      ["Available at requested scope", availableMonths.length ? formatLoadedPeriodWindow(availableMonths).replace(/\.$/, "") : "No records available"],
      ["Closest available period", closestPeriodText ?? "None at requested scope"],
      ["Same period at portfolio scope", exactFallbackScope ? "Available" : "Not available"]
    ];
    if (requiredFields.length) diagnosticRows.push(["Required fields", requiredFields.join(", ")]);

    return {
      handled: true,
      tool,
      safeRefusal: true,
      truthState: "not_loaded",
      text: [
        `${label} ${displaySubject} ${availabilityVerb} not available for ${periodLabel}.`,
        formatLoadedPeriodWindow(availableMonths),
        `Requested level: ${requestedLevel}.`,
        closestPeriodText ? `Closest available ${closestPeriods.length > 1 ? "periods" : "period"} in the same scope: ${closestPeriodText}.` : null,
        exactFallbackScope ? `The requested ${requestedMonths.length > 1 ? "periods are" : "period is"} available at ${exactFallbackScope.label} scope.` : null,
        "I did not substitute a different period."
      ].filter(Boolean).join("\n"),
      trace: makeTrace({
        tool,
        dataSource,
        rowCount,
        facility,
        period: requestedMonths.length ? requestedMonths.join(", ") : missingMonths.join(", "),
        note,
        truthState: "not_loaded"
      }),
      visual: {
        type: "table",
        title: "Available Data for This Request",
        subtitle: "Requested period not available · no period substituted",
        valueLabel: "Coverage",
        columns: ["Check", "Coverage"],
        rows: diagnosticRows.map(([check, value], index) => ({
          label: check,
          value: index + 1,
          cells: [check, value]
        }))
      },
      actions: [
        scopeAction,
        closestAction
      ].filter(Boolean).slice(0, 1)
    };
  }

  return Object.freeze({
    buildUnavailablePeriodResult,
    formatLoadedPeriodWindow,
    getPortfolioFallbackScopes
  });
}

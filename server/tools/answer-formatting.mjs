import {
  getAnalystCapability,
  getAnswerFormatContractById,
  getAnswerFormatContractForTool
} from "../../shared/analyst-capability-registry.mjs";
import {
  EXISTING_ANSWER_UPGRADE_TOOLS,
  executiveValueLabel,
  firstMeaningfulTextLine,
  formatNaturalList,
  formatOneDecimal,
  formatPercentageChange,
  hasExplicitMonthIntent,
  isRankingOrComparisonIntent,
  isRelativeLatestIntent,
  movementComparison,
  parseDisplayNumber,
  previousMonthLabel,
  wordCount
} from "./answer-formatting-helpers.mjs";

export function createAnswerFormattingTools({
  buildReadableAnswerText,
  buildStructuredToolResult,
  formatMonthLabel,
  formatNumber,
  normalizeText
}) {
  function getAnswerFormatContract(content, result) {
    const capability = getAnalystCapability(result?.certifiedQuestion?.id);
    const capabilityContract = capability ? getAnswerFormatContractById(capability.answerFormat) : null;
    const toolContract = getAnswerFormatContractForTool(result?.tool);
    const text = normalizeText(content);

    if (["medication_exception_detail", "medication_orders_current"].includes(result?.tool)) return getAnswerFormatContractById("medication");
    if (capabilityContract && capabilityContract.id !== "generic") return capabilityContract;
    if (result?.tool === "slice_metric" && /metric=incidents/i.test(String(result?.trace?.note ?? ""))) {
      return getAnswerFormatContractById(/group=(?:community|category)/i.test(String(result.trace?.note ?? "")) ? "composition" : "count");
    }
    if (toolContract) return toolContract;
    if (/\b(detail|details|list|every|exact rows?|export)\b/.test(text) || /\ball\b.*\b(rows?|records?|incidents?)\b/.test(text)) return getAnswerFormatContractById("detail_list");
    if (/\b(compare|comparison|versus| vs |change|delta|moved|increase|decrease|rate change)\b/.test(text)) return getAnswerFormatContractById("comparison");
    if (/\b(trends?|history|historical|over time|trajectory|movement|drop|decline)\b/.test(text)) return getAnswerFormatContractById("trend");
    if (/\b(profile|who is|lookup|how is|overview|topline)\b/.test(text)) return getAnswerFormatContractById("profile");
    if (/\b(how many|count|total|number of)\b/.test(text)) return getAnswerFormatContractById("count");
    if (/\b(available|loaded|coverage|fresh|current|latest loaded|what data)\b/.test(text)) return getAnswerFormatContractById("availability");
    if (/\b(medication|meds|emar|compliance|refusal|refused|not given)\b/.test(text)) return getAnswerFormatContractById("medication");

    return getAnswerFormatContractById("generic");
  }

  function formatTracePeriodRange(period) {
    const labels = String(period ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .map(formatMonthLabel);

    if (labels.length === 0) return null;
    if (labels.length === 1) return labels[0];
    if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
    return `${labels[0]} through ${labels.at(-1)}`;
  }

  function hasVisualColumn(result, columnName) {
    return (result?.visual?.columns ?? []).some((column) => normalizeText(column) === normalizeText(columnName));
  }

  function visualCell(result, row, columnName) {
    const index = (result?.visual?.columns ?? []).findIndex((column) => normalizeText(column) === normalizeText(columnName));
    return index >= 0 ? row?.cells?.[index] : null;
  }

  function isGroupedCensusPeriodSlice(result) {
    if (!["slice_metric", "slice_discovery"].includes(result?.tool)) return false;
    if (normalizeText(result?.visual?.valueLabel) !== "census") return false;
    return hasVisualColumn(result, "Community") && (hasVisualColumn(result, "Month") || hasVisualColumn(result, "Week"));
  }

  function buildGroupedCensusPeriodTakeaway(result) {
    const periodUnit = hasVisualColumn(result, "Week") ? "week" : "month";
    const scope = result.trace?.communityName ?? "Portfolio";
    const period = formatTracePeriodRange(result.trace?.period);
    const periodText = period ? ` for ${period}` : "";
    return `${scope} census is shown by ${periodUnit} and community${periodText}. These are point-in-time census counts, so read each ${periodUnit}-community value separately rather than as a summed total.`;
  }

  function buildUnavailablePeriodTakeaway(result) {
    if (result?.truthState !== "not_loaded" || result?.visual?.title !== "Available Data for This Request") return null;
    const valueFor = (label) => result.visual.rows
      ?.find((row) => normalizeText(row?.cells?.[0] ?? row?.label) === normalizeText(label))
      ?.cells?.[1];
    const lead = firstMeaningfulTextLine(result.text);
    const availableWindow = valueFor("Available at requested scope");
    const requestedLevel = valueFor("Requested level");
    const nearestPeriod = valueFor("Closest available period");
    const portfolioCoverage = valueFor("Same period at portfolio scope");
    const normalizedLead = String(lead ?? "");
    return [
      normalizedLead,
      availableWindow === "No records available" && requestedLevel
        ? `Answering it requires ${requestedLevel}, but those records are not published at the requested scope.`
        : availableWindow
          ? requestedLevel
            ? `Answering it requires ${requestedLevel}, and the available range for those records is ${String(availableWindow).replace(/^Available (?:range|periods?):?\s*/i, "").replace(/\.$/, "")}.`
            : `The available range is ${String(availableWindow).replace(/^Available (?:range|periods?):?\s*/i, "").replace(/\.$/, "")}.`
          : requestedLevel
            ? `Answering it requires ${requestedLevel}.`
          : null,
      nearestPeriod && nearestPeriod !== "None at requested scope"
        ? `The closest available period in the same scope is ${nearestPeriod}.`
        : null,
      portfolioCoverage === "Available" ? "The requested period is available at Portfolio scope." : null,
      "I did not substitute a different period."
    ].filter(Boolean).join(" ");
  }

  function buildAnalystTakeaway(content, result) {
    if (!result?.handled || !result.text) return null;
    if (/^answer\b/i.test(result.text.trim())) {
      const existingAnswer = String(result.structuredAnswer?.answer ?? "")
        || String(result.text ?? "")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .find((line, index) => index > 0 && !/^[-*]\s+/.test(line))
        || "";
      const upgradeThreshold = result.tool === "medication_exception_detail" ? 28 : 12;
      const shouldUpgrade = EXISTING_ANSWER_UPGRADE_TOOLS.has(result.tool) && wordCount(existingAnswer) < upgradeThreshold;
      if (!shouldUpgrade) return null;
    }
    if (result.safeRefusal) return buildUnavailablePeriodTakeaway(result) ?? firstMeaningfulTextLine(result.text);

    const rows = result.visual?.rows ?? [];
    const label = result.trace?.communityName ?? "Portfolio";
    const text = normalizeText(content);

    if (result.tool === "data_availability") {
      if (/incident freshness/i.test(String(result.visual?.title ?? ""))) {
        const rowFor = (name) => rows.find((row) => normalizeText(row.cells?.[0] ?? row.label) === normalizeText(name));
        const latest = rowFor("Latest incident detail date")?.cells?.[1];
        const today = rowFor("Incident records dated today")?.cells?.[2];
        const lag = parseDisplayNumber(rowFor("Lag to today")?.value);
        if (!latest || latest === "-") return "No dated incident detail is available, so the Incident Center cannot verify any current events.";
        if (lag === 0) return `Incident detail is current through today (${latest}).`;
        return `The most recent incident detail is dated ${latest}, ${formatNumber(lag ?? 0)} day${lag === 1 ? "" : "s"} behind today${today ? ` (${today})` : ""}. Today's incidents will not appear until a newer incident feed is published.`;
      }

      const requestedPeriodRow = rows.find((row) => /^requested period\s*·/i.test(String(row?.cells?.[0] ?? row?.label ?? "")));
      if (requestedPeriodRow) {
        const cells = requestedPeriodRow.cells ?? [];
        const dataset = String(cells[0] ?? requestedPeriodRow.label ?? "Requested dataset").replace(/^requested period\s*·\s*/i, "");
        const status = String(cells[1] ?? "");
        const requestedPeriod = String(cells[2] ?? "the requested period");
        const detail = String(cells[3] ?? "");
        if (/^available$/i.test(status)) return `${dataset} includes ${requestedPeriod}.`;
        if (/current snapshot/i.test(status)) {
          return `${dataset} is current-only data and does not provide monthly history for ${requestedPeriod}.`;
        }
        const loadedRange = detail.match(/loaded\s+(.+?)\s+through\s+(.+)$/i);
        if (loadedRange?.[1] && loadedRange?.[2]) {
          return `${dataset} does not include ${requestedPeriod}. Available coverage runs from ${loadedRange[1]} through ${loadedRange[2]}.`;
        }
        return `${dataset} does not include ${requestedPeriod}.`;
      }

      if (/\b(data availability|show data availability|what data (?:is|are) available|loaded data|how current is (?:the )?data|data freshness|snapshot freshness)\b/.test(text) && rows.length) {
        const rowFor = (name) => rows.find((row) => normalizeText(row.cells?.[0] ?? row.label) === normalizeText(name));
        const incidentDetail = rowFor("Incident detail")?.cells ?? [];
        const census = rowFor("Census monthly")?.cells ?? [];
        const medication = rowFor("Medication compliance")?.cells ?? [];
        const missingMar = ["MAR monthly", "MAR resident summary", "MAR exceptions"]
          .filter((name) => parseDisplayNumber(rowFor(name)?.cells?.[2]) === 0);
        const historicalParts = [
          incidentDetail[3] && incidentDetail[4] ? `incident detail from ${incidentDetail[3]} through ${incidentDetail[4]}` : null,
          census[3] && census[4] ? `monthly census from ${census[3]} through ${census[4]}` : null,
          medication[3] && medication[4] ? `medication compliance from ${medication[3]} through ${medication[4]}` : null
        ].filter(Boolean);
        const marBoundary = missingMar.length
          ? ` ${formatNaturalList(missingMar)} ${missingMar.length === 1 ? "is" : "are"} not populated, so resident-level medication analysis is limited.`
          : "";
        const loadedDatasetCount = rows.filter((row) => (parseDisplayNumber(row.cells?.[2]) ?? 0) > 0).length;
        return `${loadedDatasetCount} of ${rows.length} published data areas are populated. Historical coverage includes ${formatNaturalList(historicalParts)}. Resident roster and documentation are current-only.${marBoundary}`;
      }

      const focus = rows.find((row) => !/^requested period\s*·/i.test(String(row?.cells?.[0] ?? row?.label ?? ""))) ?? rows[0];
      const cells = focus?.cells ?? [];
      const dataset = cells[0] ?? focus?.label;
      const grain = cells[1];
      const count = cells[2];
      const earliest = cells[3];
      const latest = cells[4];

      if (/incident detail/i.test(String(dataset ?? ""))) {
        const range = earliest && latest && earliest !== "Current only" && latest !== "—"
          ? ` spanning ${earliest} through ${latest}`
          : "";
        const unit = /incident events?/i.test(String(grain ?? "")) ? "incident events" : "incidents";
        const latestSentence = latest && latest !== "—" ? `The most recent incident detail is ${latest}.` : null;
        const periodCount = String(result.text ?? "").match(/across\s+([\d,]+)\s+monthly periods/i)?.[1];
        return [
          latestSentence,
          `${count ?? formatNumber(result.trace?.rowCount ?? 0)} ${unit} are available${range}${periodCount ? ` across ${periodCount} monthly periods` : ""}.`
        ].filter(Boolean).join(" ");
      }

      if (/resident roster/i.test(String(dataset ?? ""))) {
        return `The resident roster contains ${count ?? formatNumber(result.trace?.rowCount ?? 0)} current residents. It is current-only and does not provide month-by-month roster history.`;
      }

      if (/census/i.test(String(dataset ?? ""))) {
        const range = earliest && latest && earliest !== "Current only" && latest !== "—"
          ? ` Coverage runs from ${earliest} through ${latest}.`
          : "";
        return `Census coverage includes ${count ?? formatNumber(result.trace?.rowCount ?? 0)} monthly census points at the ${grain ?? "community-month"} level.${range}`.trim();
      }

      if (/documentation/i.test(String(dataset ?? ""))) {
        return `Documentation coverage includes ${count ?? formatNumber(result.trace?.rowCount ?? 0)} current status entries. This is current-state coverage, not monthly history.`;
      }

      if (dataset) {
        const range = earliest && latest && earliest !== "Current only" && latest !== "—"
          ? ` Coverage runs from ${earliest} through ${latest}.`
          : latest && latest !== "—"
            ? ` The most recent available value is ${latest}.`
            : "";
        return `${dataset} contains ${count ?? formatNumber(result.trace?.rowCount ?? rows.length)} values at the ${grain ?? "available"} level.${range}`.trim();
      }

      return firstMeaningfulTextLine(result.text) || "Available data is summarized by dataset and date range.";
    }

    if (result.tool === "detail_list") {
      const firstLine = firstMeaningfulTextLine(result.text);
      const detailMatch = firstLine.match(/^(.+?)\s+detail:\s*([\d,]+)\s+matching records?\s+for\s+(.+)\.?$/i);
      if (detailMatch?.[1] && detailMatch[2] && detailMatch[3]) {
        const requestedScope = detailMatch[3].replace(/\.$/, "");
        const coverage = /^available data$/i.test(requestedScope)
          ? "in the available data"
          : `for ${requestedScope}`;
        return `There are ${detailMatch[2]} matching ${detailMatch[1].toLowerCase()} entries ${coverage}.`;
      }
      return firstLine || "The exact matches are shown below.";
    }

    if (result.tool === "export_csv") {
      const rowCount = result.artifact?.rowCount ?? result.trace?.rowCount ?? 0;
      const scope = result.trace?.communityName ?? "the portfolio";
      const noun = /incident/i.test(String(result.trace?.dataSource ?? result.text ?? "")) ? "incidents" : "entries";
      const category = String(result.trace?.note ?? "").match(/category=([^;]+)/i)?.[1]?.trim();
      const period = formatTracePeriodRange(result.trace?.period);
      const coverage = period ? ` in ${period}` : noun === "incidents" ? " for the full available incident history" : " for the available data";
      return `The CSV is ready with all ${formatNumber(rowCount)}${category ? ` ${category}` : ""} ${noun} for ${scope}${coverage}.`;
    }

    if (result.tool === "incident_detail_list") {
      const rowCount = result.artifact?.rowCount ?? result.visual?.originalRowCount ?? result.trace?.rowCount ?? result.visual?.rows?.length ?? 0;
      const category = String(result.trace?.note ?? "").match(/category=([^;]+)/i)?.[1]?.trim();
      const scope = result.trace?.communityName ?? "Portfolio";
      const period = String(result.trace?.period ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
        .map(formatMonthLabel)
        .join(" and ");
      const categoryText = category ? ` for the ${category} category` : "";
      const periodText = period ? ` in ${period}` : "";
      const summary = result.summary ?? {};
      const uniqueResidentCount = Number(summary.uniqueResidentCount ?? 0);
      const topResidents = Array.isArray(summary.topResidents) ? summary.topResidents : [];
      const monthlyCounts = Array.isArray(summary.countsByMonth) && summary.countsByMonth.length > 1
        ? ` The monthly split was ${formatNaturalList(summary.countsByMonth.map((item) => `${formatNumber(item.count)} in ${formatMonthLabel(item.month)}`))}.`
        : "";
      if (Number(rowCount) === 0 && (result.truthState ?? result.trace?.truthState) === "verified_zero") {
        return `${scope} had no matching incidents${categoryText}${periodText}. Incident detail is available for this scope and period, making this a verified zero.`;
      }
      if (/\b(who|resident|residents|client|clients|people|person|involved|names?)\b/.test(text) && uniqueResidentCount > 0) {
        const leaders = topResidents.map((resident) => `${resident.name} (${formatNumber(resident.count)})`);
        const scopePrefix = scope === "Portfolio" ? "" : `At ${scope}, `;
        const locationSuffix = scope === "Portfolio" ? " across the portfolio" : "";
        return `${scopePrefix}${formatNumber(uniqueResidentCount)} unique residents were involved in ${formatNumber(rowCount)} matching${category ? ` ${category}` : ""} incident${Number(rowCount) === 1 ? "" : "s"}${periodText}${locationSuffix}.${leaders.length ? ` ${formatNaturalList(leaders)} had the highest incident counts.` : ""}`;
      }
      if (/\b(description|descriptions|narrative|narratives|details?)\b/.test(text)) {
        return `${scope === "Portfolio" ? "The portfolio" : scope} recorded ${formatNumber(rowCount)} matching${category ? ` ${category}` : ""} incident${Number(rowCount) === 1 ? "" : "s"}${periodText}.${monthlyCounts}`;
      }
      return `${scope === "Portfolio" ? "The portfolio" : scope} recorded ${formatNumber(rowCount)} matching${category ? ` ${category}` : ""} incident${Number(rowCount) === 1 ? "" : "s"}${periodText}.${monthlyCounts}`;
    }

    if (result.tool === "census_drop_history") {
      if (!rows.length) return "No month-over-month census declines were found in the available history.";
      const communityCount = new Set(rows.map((row) => row.cells?.[0] ?? row.label).filter(Boolean)).size;
      const biggest = [...rows].sort((left, right) => Number(left.value || 0) - Number(right.value || 0))[0];
      const latest = rows.at(-1);
      const biggestCells = biggest?.cells ?? [];
      const latestCells = latest?.cells ?? [];
      const period = result.trace?.period ?? "the available history";
      const biggestSentence = biggest
        ? ` The largest was ${biggestCells[0] ?? biggest.label}, down ${formatNumber(Math.abs(biggest.value))} from ${biggestCells[1]} to ${biggestCells[2]}.`
        : "";
      const latestSentence = latest && latest !== biggest
        ? ` The most recent decline was ${latestCells[0] ?? latest.label}, down ${formatNumber(Math.abs(latest.value))} from ${latestCells[1]} to ${latestCells[2]}.`
        : "";
      return `${communityCount} communities had ${formatNumber(rows.length)} month-over-month census declines from ${period}.${biggestSentence}${latestSentence}`;
    }

    if (result.tool === "census_movement" && rows.length) {
      const downRows = rows.filter((row) => Number(row.value || 0) < 0);
      const upRows = rows.filter((row) => Number(row.value || 0) > 0);
      const flatRows = rows.filter((row) => Number(row.value || 0) === 0);
      const totalDelta = rows.reduce((total, row) => total + Number(row.value || 0), 0);
      const latestTotal = rows.reduce((total, row) => {
        const census = String(row.meta ?? "").match(/census\s+([\d,]+)/i)?.[1];
        return total + (parseDisplayNumber(census) ?? 0);
      }, 0);
      const largestMove = [...rows].sort((left, right) => Math.abs(Number(right.value || 0)) - Math.abs(Number(left.value || 0)))[0];
      const period = result.trace?.period ? formatMonthLabel(result.trace.period) : "the latest month";
      const direction = totalDelta === 0 ? "was unchanged" : totalDelta > 0 ? `increased by ${formatNumber(totalDelta)}` : `decreased by ${formatNumber(Math.abs(totalDelta))}`;
      const relativeLatest = isRelativeLatestIntent(text) || (result.certifiedQuestion?.id === "census-movement" && !hasExplicitMonthIntent(text));
      const latestAvailableSentence = relativeLatest ? `${period} is the latest available census month. ` : "";
      const latestCensus = String(largestMove?.meta ?? "").match(/census\s+([\d,]+)/i)?.[1];
      const largestMoveValue = Number(largestMove?.value ?? 0);
      const leader = largestMove
        ? ` ${largestMove.label} had the largest move, ${largestMoveValue === 0 ? "holding steady" : `${largestMoveValue > 0 ? "increasing" : "decreasing"} by ${formatNumber(Math.abs(largestMoveValue))}`}${latestCensus ? ` to ${latestCensus}` : ""}.`
        : "";
      const scope = result.trace?.communityName ?? "Portfolio";
      if (rows.length === 1) {
        return `${latestAvailableSentence}${scope} census ${direction} to ${formatNumber(latestTotal)} in ${period}.`;
      }
      return `${latestAvailableSentence}${scope} census ${direction} to ${formatNumber(latestTotal)} in ${period}. Across communities, ${upRows.length} increased, ${flatRows.length} were unchanged, and ${downRows.length} decreased.${leader}`;
    }

    if (result.tool === "incident_category_comparison" && rows.length) {
      const deltaRows = rows
        .map((row) => {
          const cells = row.cells ?? [];
          const delta = parseDisplayNumber(cells.at(-1));
          return { row, delta };
        })
        .filter((entry) => entry.delta != null)
        .sort((left, right) => Math.abs(right.delta ?? 0) - Math.abs(left.delta ?? 0));
      const biggest = deltaRows[0];

      if (biggest) {
        const columns = result.visual?.columns ?? [];
        const firstPeriod = columns[1] ?? "the first period";
        const secondPeriod = columns[2] ?? "the second period";
        const firstTotal = rows.reduce((total, row) => total + (parseDisplayNumber(row.cells?.[1]) ?? 0), 0);
        const secondTotal = rows.reduce((total, row) => total + (parseDisplayNumber(row.cells?.[2]) ?? 0), 0);
        const totalDelta = secondTotal - firstTotal;
        const totalMovement = movementComparison(totalDelta, firstPeriod);
        const percentageMovement = formatPercentageChange(totalDelta, firstTotal);
        const requestedCategory = String(result.trace?.note ?? "").match(/category=([^;]+)/i)?.[1]?.trim();
        if (requestedCategory && rows.length === 1) {
          const categoryLabel = rows[0]?.label ?? requestedCategory;
          return `${label} recorded ${formatNumber(secondTotal)} incidents for ${categoryLabel} in ${secondPeriod}, ${totalMovement}${percentageMovement ? ` (${percentageMovement})` : ""}. The count moved from ${formatNumber(firstTotal)} to ${formatNumber(secondTotal)}.`;
        }
        const categoryDirection = biggest.delta > 0 ? "up" : "down";
        const totalSentence = `${label} recorded ${formatNumber(secondTotal)} incidents in ${secondPeriod}, ${totalMovement}${percentageMovement ? ` (${percentageMovement})` : ""}.`;
        const driverSentence = `The largest category movement was ${biggest.row.label}, ${categoryDirection} ${formatNumber(Math.abs(biggest.delta))} from ${formatNumber(biggest.row.cells?.[1])} to ${formatNumber(biggest.row.cells?.[2])}.`;
        return `${totalSentence} ${driverSentence}`;
      }
    }

    if (result.tool === "incident_rate" && rows.length) {
      if (result.trace?.facilityId && rows.length === 1) {
        const row = rows[0];
        const cells = row.cells ?? [];
        const community = cells[0] ?? row.label ?? result.trace?.communityName ?? "This community";
        const incidents = cells[1] ?? "—";
        const census = cells[2] ?? "—";
        const rate = cells[3] ?? (formatOneDecimal(row.value) ?? formatNumber(row.value));
        const period = result.trace?.period ? formatMonthLabel(result.trace.period) : "the latest available month";
        return `${community}'s incident rate was ${rate} per 100 residents in ${period}, based on ${incidents} incidents and a census of ${census}.`;
      }
      const ranked = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0));
      const top = ranked[0];
      const next = ranked[1];
      const period = result.trace?.period ? formatMonthLabel(result.trace.period) : result.visual?.subtitle?.split(" incidents per")?.[0];
      if (top?.label) {
        const topRate = formatOneDecimal(top.value) ?? formatNumber(top.value);
        const nextRate = next ? formatOneDecimal(next.value) ?? formatNumber(next.value) : null;
        const comparison = next && nextRate
          ? ` The next-highest rate was ${next.label} at ${nextRate}, a gap of ${formatOneDecimal(Number(topRate) - Number(nextRate))} incidents per 100.`
          : "";
        return `In ${period || "the latest available month"}, ${top.label} had the highest incident rate at ${topRate} incidents per 100 residents.${comparison}`;
      }
      return `Incident rates are shown by community for ${period || "the latest available month"}.`;
    }

    if (result.tool === "incident_rate_change") {
      return String(result.text ?? "").split("\n").map((line) => line.trim()).find(Boolean) ?? null;
    }

    if (result.tool === "incident_breakdown") {
      if (/category=/i.test(String(result.trace?.note ?? ""))) {
        const category = result.summary?.category ?? String(result.trace?.note ?? "").match(/category=([^;]+)/i)?.[1]?.trim() ?? "matching";
        const period = result.trace?.period ? formatMonthLabel(result.trace.period) : "the available period";
        const eventCount = Number(result.summary?.incidentCount ?? result.trace?.rowCount ?? rows[0]?.value ?? 0);
        const distinctResidents = /metricGrain=distinct_residents/i.test(String(result.trace?.note ?? ""));
        const count = distinctResidents
          ? Number(result.summary?.uniqueResidentCount ?? rows[0]?.value ?? result.trace?.rowCount ?? 0)
          : eventCount;
        if (distinctResidents) {
          if (count === 0) {
            return `In ${period}, no unique residents were involved in incidents in the ${category} category${label === "Portfolio" ? " across the portfolio" : ` at ${label}`}.`;
          }
          return `In ${period}, ${formatNumber(count)} unique residents were involved in ${formatNumber(eventCount)} ${category} incidents${label === "Portfolio" ? " across the portfolio" : ` at ${label}`}.`;
        }
        if (count === 0) {
          return `${label === "Portfolio" ? "The portfolio" : label} recorded 0 incidents in the ${category} category in ${period}.`;
        }
        return `${label === "Portfolio" ? "The portfolio" : label} recorded ${formatNumber(count)} ${category} incidents in ${period}.`;
      }

      const total = Number(result.trace?.rowCount ?? 0);
      const period = result.trace?.period ? formatMonthLabel(result.trace.period) : null;
      const movementMatch = String(result.text ?? "").match(/\(([+-][\d,]+)\s+vs\s+([^)]+)\)/i);
      const delta = parseDisplayNumber(movementMatch?.[1]);
      const priorPeriod = movementMatch?.[2]?.trim();
      const priorTotal = delta == null ? null : total - delta;
      const totalMovement = delta == null || !priorPeriod ? null : movementComparison(delta, priorPeriod);
      const percentageMovement = delta == null || priorTotal == null ? null : formatPercentageChange(delta, priorTotal);
      const top = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0))[0];
      const second = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0))[1];
      if (total && period && top) {
        const movementClause = totalMovement ? `, ${totalMovement}${percentageMovement ? ` (${percentageMovement})` : ""}` : "";
        const topShare = formatOneDecimal(Number(top.value || 0) / total * 100);
        const secondClause = second ? `, followed by ${second.label} at ${formatNumber(second.value)}` : "";
        const scope = label === "Portfolio" ? "the portfolio" : label;
        const relativeLatest = isRelativeLatestIntent(text) || (result.certifiedQuestion?.id === "incident-current-snapshot" && !hasExplicitMonthIntent(text));
        const lead = relativeLatest
          ? `${period} is the latest available incident month. ${scope.charAt(0).toUpperCase()}${scope.slice(1)} recorded`
          : `${label} recorded`;
        return `${lead} ${formatNumber(total)} incidents${relativeLatest ? "" : ` in ${period}`}${movementClause}. ${top.label} was the largest category at ${formatNumber(top.value)}${topShare ? ` (${topShare}% of incidents)` : ""}${secondClause}.`;
      }

      const firstLine = firstMeaningfulTextLine(result.text);
      if (firstLine) return firstLine;
    }

    if (result.tool === "compare_periods" && rows.length) {
      const cells = rows[0]?.cells ?? [];
      const columns = result.visual?.columns ?? [];
      const delta = parseDisplayNumber(cells.at(-1));
      if (delta != null) {
        const leftPeriod = columns[1] ?? "First period";
        const rightPeriod = columns[2] ?? "Second period";
        const leftValue = cells[1];
        const rightValue = cells[2];
        const metricLabel = normalizeText(cells[0] ?? result.visual?.valueLabel ?? "metric");
        const metricNoun = /\bincident/.test(metricLabel) ? "incidents" : /\bcensus/.test(metricLabel) ? "census" : metricLabel;
        if (delta === 0) return `${leftPeriod} and ${rightPeriod} were unchanged at ${rightValue} ${metricNoun}.`;
        const direction = delta > 0 ? "up" : "down";
        const magnitude = normalizeText(cells[0]).includes("compliance")
          ? Math.abs(delta).toFixed(1)
          : formatNumber(Math.abs(delta));
        const pairedIncidentContext = /\bincident|incidents\b/.test(text) && /metric=census/i.test(String(result.trace?.note ?? ""))
          ? " Incident context is surfaced alongside this census comparison."
          : "";
        if (/\bincidents\b/.test(metricNoun)) {
          return `${leftPeriod} had ${leftValue} incidents; ${rightPeriod} had ${rightValue}, ${direction} ${magnitude}.${pairedIncidentContext}`;
        }
        if (metricNoun === "census") {
          return `${leftPeriod} census was ${leftValue}; ${rightPeriod} was ${rightValue}, ${direction} ${magnitude}.${pairedIncidentContext}`;
        }
        return `${leftPeriod} was ${leftValue}; ${rightPeriod} was ${rightValue}, ${direction} ${magnitude}.${pairedIncidentContext}`;
      }
    }

    if (result.tool === "community_time_series" && rows.length) {
      const relatedVisuals = [
        result.visual,
        ...(Array.isArray(result.supportingVisuals) ? result.supportingVisuals.map((item) => item?.visual) : [])
      ].filter(Boolean);
      const censusVisual = relatedVisuals.find((visual) => normalizeText(visual?.valueLabel) === "census");
      const incidentVisual = relatedVisuals.find((visual) => normalizeText(visual?.valueLabel) === "incidents");
      const summarizeVisual = (visual) => {
        const visualRows = visual?.rows ?? [];
        const firstRow = visualRows[0];
        const lastRow = visualRows.at(-1);
        const columns = visual?.columns ?? [];
        const communities = columns.slice(1).map((communityName, index) => ({
          communityName,
          firstValue: parseDisplayNumber(firstRow?.cells?.[index + 1]),
          latestValue: parseDisplayNumber(lastRow?.cells?.[index + 1])
        })).filter((entry) => entry.latestValue != null);
        const leader = [...communities].sort((left, right) => right.latestValue - left.latestValue)[0];
        const mover = [...communities]
          .filter((entry) => entry.firstValue != null)
          .map((entry) => ({ ...entry, delta: entry.latestValue - entry.firstValue }))
          .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0];
        const start = parseDisplayNumber(firstRow?.value);
        const end = parseDisplayNumber(lastRow?.value);
        return {
          firstLabel: firstRow?.label,
          lastLabel: lastRow?.label,
          start,
          end,
          delta: start != null && end != null ? end - start : null,
          leader,
          mover
        };
      };
      if (censusVisual && incidentVisual) {
        const census = summarizeVisual(censusVisual);
        const incidents = summarizeVisual(incidentVisual);
        const movementPhrase = (summary, noun) => {
          if (summary.delta == null) return `${noun} ended at ${formatNumber(summary.end)}`;
          if (summary.delta === 0) return `${noun} held steady at ${formatNumber(summary.end)}`;
          const percentage = formatPercentageChange(summary.delta, summary.start);
          return `${noun} ${summary.delta > 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(summary.delta))} to ${formatNumber(summary.end)}${percentage ? ` (${percentage})` : ""}`;
        };
        const censusMover = census.mover
          ? `${census.mover.communityName} had the largest census ${census.mover.delta >= 0 ? "increase" : "decrease"}, at ${formatNumber(Math.abs(census.mover.delta))}`
          : null;
        const incidentMover = incidents.mover
          ? `${incidents.mover.communityName} had the largest incident ${incidents.mover.delta >= 0 ? "increase" : "decrease"}, at ${formatNumber(Math.abs(incidents.mover.delta))}`
          : null;
        const latestLeaders = census.leader?.communityName === incidents.leader?.communityName
          ? `${census.leader.communityName} led both measures, with census at ${formatNumber(census.leader.latestValue)} and ${formatNumber(incidents.leader.latestValue)} incidents`
          : `${census.leader?.communityName} had the highest census at ${formatNumber(census.leader?.latestValue)}, and ${incidents.leader?.communityName} had the highest incident count at ${formatNumber(incidents.leader?.latestValue)}`;
        return `From ${census.firstLabel} through ${census.lastLabel}, portfolio ${movementPhrase(census, "census")}, while ${movementPhrase(incidents, "incidents")}. In ${census.lastLabel}, ${latestLeaders}. ${[censusMover, incidentMover].filter(Boolean).join(", while ")}.`;
      }
      const first = rows[0];
      const last = rows.at(-1);
      const columns = result.visual?.columns ?? [];
      const firstCells = first?.cells ?? [];
      const latestCells = last?.cells ?? [];
      const communityValues = columns.slice(1).map((communityName, index) => ({
        communityName,
        firstValue: parseDisplayNumber(firstCells[index + 1]),
        value: parseDisplayNumber(latestCells[index + 1])
      })).filter((entry) => entry.value != null);
      const top = [...communityValues].sort((left, right) => Number(right.value) - Number(left.value))[0];
      const biggestMover = [...communityValues]
        .filter((entry) => entry.firstValue != null)
        .map((entry) => ({ ...entry, delta: entry.value - entry.firstValue }))
        .sort((left, right) => Math.abs(right.delta) - Math.abs(left.delta))[0];
      const valueLabel = result.visual?.valueLabel || "values";
      const noun = normalizeText(valueLabel) === "census" ? "census" : executiveValueLabel(valueLabel);
      const period = first?.label && last?.label ? `${first.label} through ${last.label}` : formatTracePeriodRange(result.trace?.period);
      const portfolioStart = parseDisplayNumber(first?.value);
      const portfolioEnd = parseDisplayNumber(last?.value);
      if (top && portfolioStart != null && portfolioEnd != null) {
        const portfolioDelta = portfolioEnd - portfolioStart;
        const portfolioMovement = movementComparison(portfolioDelta, first?.label ?? "the first available month");
        const percentageMovement = formatPercentageChange(portfolioDelta, portfolioStart);
        const moverDirection = biggestMover?.delta > 0 ? "an increase" : "a decrease";
        const moverSentence = biggestMover
          ? ` ${biggestMover.communityName} had the largest absolute change, ${moverDirection} of ${formatNumber(Math.abs(biggestMover.delta))} from ${formatNumber(biggestMover.firstValue)} to ${formatNumber(biggestMover.value)}.`
          : "";
        const latestNoun = noun === "incidents" ? "incident count" : noun;
        return `Portfolio ${noun} reached ${formatNumber(portfolioEnd)} in ${last?.label || "the latest month"}, ${portfolioMovement}${percentageMovement ? ` (${percentageMovement})` : ""}. ${top.communityName} had the highest latest ${latestNoun} at ${formatNumber(top.value)}.${moverSentence}`;
      }
      return `${valueLabel} are shown by community for ${period || "the available period"}.`;
    }

    if (result.tool === "community_history" && rows.length) {
      const historyRows = result.summary?.historyRows?.length ? result.summary.historyRows : rows;
      const first = historyRows[0]?.cells ?? [];
      const last = historyRows.at(-1)?.cells ?? [];
      if (historyRows.length === 1) {
        const period = first[0] ?? "the selected month";
        const priorPeriod = previousMonthLabel(period);
        const census = first[1] && first[1] !== "—" ? first[1] : null;
        const incidents = first[3] && first[3] !== "—" ? first[3] : null;
        const censusMovement = first[2] && first[2] !== "—" ? movementComparison(first[2], priorPeriod) : null;
        const incidentMovement = first[4] && first[4] !== "—" ? movementComparison(first[4], priorPeriod) : null;
        const censusSentence = census
          ? `${label}'s census was ${census} clients in ${period}${censusMovement ? `, ${censusMovement}` : ""}.`
          : null;
        const incidentSentence = incidents
          ? `There were ${incidents} incidents that month${incidentMovement ? `, ${incidentMovement}` : ""}.`
          : null;
        const category = first[5] && first[5] !== "—" ? first[5] : null;
        const compliance = first[6] && first[6] !== "—" ? first[6] : null;
        const leadingCategory = category?.match(/^(.+?)\s*\(([\d,]+)\)/);
        const leadingShare = leadingCategory && incidents
          ? formatOneDecimal((parseDisplayNumber(leadingCategory[2]) ?? 0) / (parseDisplayNumber(incidents) || 1) * 100)
          : null;
        const categoryPhrase = leadingCategory
          ? `${leadingCategory[1]} was the most common category, with ${leadingCategory[2]} incidents${leadingShare ? ` (${leadingShare}% of the total)` : ""}.`
          : category;
        const complianceSentence = compliance ? `Medication compliance was ${compliance}.` : null;
        const operatingParagraph = [censusSentence, incidentSentence].filter(Boolean).join(" ");
        const clinicalParagraph = [
          categoryPhrase ? categoryPhrase.replace(/\.$/, "") + "." : null,
          complianceSentence
        ].filter(Boolean).join(" ");
        return [operatingParagraph, clinicalParagraph].filter(Boolean).join("\n\n") || `${label} is summarized for ${period}.`;
      }
      const censusStart = parseDisplayNumber(first[1]);
      const censusEnd = parseDisplayNumber(last[1]);
      const incidentsStart = parseDisplayNumber(first[3]);
      const incidentsEnd = parseDisplayNumber(last[3]);
      const periodLabels = [...new Set(historyRows
        .map((row) => formatMonthLabel(row.cells?.[0] ?? row.label))
        .filter(Boolean))];
      const period = formatTracePeriodRange(result.trace?.period) ?? formatNaturalList(periodLabels);
      const incidentTotal = historyRows.reduce((total, row) => total + (parseDisplayNumber(row.cells?.[3]) ?? 0), 0);
      const periodCountPhrase = historyRows.length === 1 ? "That month" : "Together, those months";
      const describeChange = (start, end, labelText) => {
        if (start == null || end == null) return null;
        const delta = end - start;
        if (delta === 0) return `${labelText} held steady at ${formatNumber(end)}`;
        return `${labelText} ${delta > 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(delta))} to ${formatNumber(end)}`;
      };
      const censusChange = describeChange(censusStart, censusEnd, "census");
      const incidentChange = describeChange(incidentsStart, incidentsEnd, "monthly incidents");
      const periodSentence = censusChange && incidentChange
        ? `Across ${period}, ${label}'s ${censusChange}, while ${incidentChange}. ${periodCountPhrase} recorded ${formatNumber(incidentTotal)} incidents in total.`
        : censusChange || incidentChange
          ? `Across ${period}, ${label}'s ${censusChange ?? incidentChange}. ${periodCountPhrase} recorded ${formatNumber(incidentTotal)} incidents in total.`
          : `${label} recorded ${formatNumber(incidentTotal)} incidents across ${period}.`;
      const latestCategory = last[5] && last[5] !== "—" ? last[5] : null;
      const latestCompliance = last[6] && last[6] !== "—" ? last[6] : null;
      const latestLeadingCategory = latestCategory?.match(/^(.+?)\s*\(([\d,]+)\)/);
      const latestSentence = latestLeadingCategory && latestCompliance
        ? `In ${formatMonthLabel(last[0]) ?? "the latest month"}, ${latestLeadingCategory[1]} was the leading incident category with ${latestLeadingCategory[2]} incidents, and medication compliance was ${latestCompliance}.`
        : latestCategory
          ? `In ${last[0] ?? "the latest month"}, the leading incident categories were ${latestCategory}.`
          : latestCompliance
            ? `In ${last[0] ?? "the latest month"}, medication compliance was ${latestCompliance}.`
            : null;
      return [periodSentence, latestSentence].filter(Boolean).join("\n\n");
    }

    if (result.tool === "community_profile") {
      const summaryRows = result.visual?.rows ?? [];
      const residentsRow = summaryRows.find((row) => ["residents", "active roster"].includes(normalizeText(row.label)));
      const censusRow = summaryRows.find((row) => normalizeText(row.label) === "reporting census");
      const movementRow = summaryRows.find((row) => normalizeText(row.label) === "census movement");
      const incidentRow = summaryRows.find((row) => normalizeText(row.label) === "incidents");
      const averageLosRow = summaryRows.find((row) => normalizeText(row.label) === "average los");
      const residents = residentsRow?.cells?.[1];
      const reportingCensus = censusRow?.cells?.[1];
      const reportingPeriod = censusRow?.cells?.[2] ?? formatTracePeriodRange(result.trace?.period);
      const movement = movementRow?.cells?.[1];
      const incidents = incidentRow?.cells?.[1];
      const incidentContext = String(incidentRow?.cells?.[2] ?? "");
      const incidentPeriod = incidentContext.split(";")[0]?.trim() ?? "";
      const incidentDelta = parseDisplayNumber(incidentContext.match(/\(([+-][\d,]+)\s+vs/i)?.[1]);
      const averageLos = averageLosRow?.cells?.[1];
      const censusMovement = movement && movement !== "—" ? movementComparison(movement, previousMonthLabel(reportingPeriod)) : null;
      const relativeLatest = isRelativeLatestIntent(text) || (result.certifiedQuestion?.id === "community-topline" && !hasExplicitMonthIntent(text));
      const censusSentence = reportingCensus
        ? relativeLatest
          ? `${reportingPeriod ?? "The most recent available month"} is the latest available reporting month. ${label}'s census was ${reportingCensus}${censusMovement ? `, ${censusMovement}` : ""}.`
          : `${label} had a census of ${reportingCensus}${reportingPeriod ? ` in ${reportingPeriod}` : ""}${censusMovement ? `, ${censusMovement}` : ""}${residents ? `, alongside ${residents} active residents` : ""}.`
        : residents
          ? `${label} had ${residents} active residents.`
          : null;
      const rosterSentence = relativeLatest && residents ? `The current roster has ${residents} active residents.` : null;
      const incidentDetail = incidents
        ? `${incidents} incidents${incidentPeriod ? ` in ${incidentPeriod}` : ""}${incidentDelta != null ? `, ${movementComparison(incidentDelta, previousMonthLabel(incidentPeriod))}` : ""}`
        : null;
      const detailSentence = incidentDetail || averageLos
        ? relativeLatest
          ? `Incidents totaled ${incidentDetail ?? "no available total"}. Current roster length of stay averages ${averageLos ?? "are unavailable"}.`
          : `The current operating picture shows ${[incidentDetail, averageLos ? `an average length of stay of ${averageLos}` : null].filter(Boolean).join(" and ")}.`
        : null;
      const reportingCensusValue = parseDisplayNumber(reportingCensus);
      const residentCountValue = parseDisplayNumber(residents);
      const censusDifference = reportingCensusValue !== null && residentCountValue !== null
        ? reportingCensusValue - residentCountValue
        : null;
      if (relativeLatest) {
        const reportingSentence = reportingCensus
          ? `${reportingPeriod ?? "The most recent available month"} is the latest available reporting month. ${label}'s census was ${reportingCensus}${censusMovement ? `, ${censusMovement}` : ""}.`
          : residents
            ? `The current roster has ${residents} active residents.`
            : null;
        const operationsSentence = incidents || averageLos
          ? incidents
            ? `It recorded ${incidents} incidents${incidentDelta != null ? `, ${movementComparison(incidentDelta, previousMonthLabel(incidentPeriod))}` : ""}.`
            : `The current roster's average length of stay was ${averageLos}.`
          : null;
        const rosterSentence = residents && averageLos
          ? `Its current roster has ${residents} active residents, with an average length of stay of ${averageLos}.`
          : residents
            ? `Its current roster has ${residents} active residents.`
            : null;
        return [reportingSentence, operationsSentence, rosterSentence].filter(Boolean).join("\n\n");
      }
      const reconciliationSentence = censusDifference && censusDifference !== 0
        ? `Reporting census is ${Math.abs(censusDifference)} ${censusDifference > 0 ? "higher" : "lower"} than the current roster, so the two point-in-time measures should be read separately.`
        : null;

      return [
        [censusSentence, rosterSentence].filter(Boolean).join(" "),
        detailSentence,
        reconciliationSentence
      ].filter(Boolean).join("\n\n") || `${label} topline is summarized below.`;
    }

    if (result.tool === "community_compare" && rows.length) {
      const ranked = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0));
      const top = ranked[0];
      const bottom = ranked.at(-1);
      const cells = top?.cells ?? [];
      const community = cells[0] ?? top?.label;
      const census = cells[1];
      const incidents = cells[3];
      const rate = cells[4];
      if (community) {
        const bottomRate = bottom?.cells?.[4];
        const movementLeader = [...rows].sort((left, right) => Math.abs(parseDisplayNumber(right.cells?.[2]) ?? 0) - Math.abs(parseDisplayNumber(left.cells?.[2]) ?? 0))[0];
        const movementDelta = parseDisplayNumber(movementLeader?.cells?.[2]);
        const movementPhrase = movementDelta == null || movementDelta === 0
          ? "holding steady"
          : `${movementDelta > 0 ? "increasing" : "decreasing"} by ${formatNumber(Math.abs(movementDelta))}`;
        const period = formatTracePeriodRange(result.trace?.period);
        return `${period ? `In ${period}, ` : ""}${community} had the highest incident rate at ${rate} per 100 residents, with ${incidents} incidents and a census of ${census}. ${bottom?.label} had the lowest rate at ${bottomRate} per 100. ${movementLeader?.label} had the largest census movement, ${movementPhrase}.`;
      }
      return "The community comparison is summarized below.";
    }

    if (result.tool === "resident_incident_history") {
      const residentName = result.visual?.title?.replace(/\s+Incident Categories$/i, "") || firstMeaningfulTextLine(result.text) || "This resident";
      const community = String(result.text ?? "").match(/\bCommunity:\s*([^.;]+)(?:[.;]|$)/i)?.[1]?.trim();
      const matchedCount = result.trace?.rowCount ?? result.visual?.originalRowCount ?? rows.reduce((total, row) => total + Number(row.value || 0), 0);
      const topCategories = rows.slice(0, 3)
        .map((row) => `${row.label} (${formatNumber(row.value)})`)
        .join(", ");
      const rollup = String(result.text ?? "").match(/(?:Historical|Loaded-history) rollup:\s*([\d,]+) total;\s*([\d,]+) in 30 days;\s*([\d,]+) in 90 days;\s*([\d,]+) in 180 days/i);
      const recent = String(result.text ?? "").match(/Recent incidents:\s*([^;\n.]+(?:\s+on\s+[^;\n.]+)?)/i)?.[1]?.trim();
      const recencyText = rollup
          ? ` Of those incidents, ${rollup[3]} occurred within 90 days and ${rollup[2]} within 30 days${recent ? `. The most recent incident was ${recent}` : ""}.`
        : "";
      const categoryText = topCategories ? ` The leading categories were ${topCategories}.` : "";
      return `${residentName}'s incident history includes ${formatNumber(matchedCount)} matched incident${Number(matchedCount) === 1 ? "" : "s"}${community ? ` at ${community}` : ""}.${recencyText}${categoryText}`;
    }

    if (result.tool === "resident_lookup") {
      const profileRows = result.visual?.rows ?? [];
      const matchesProfileLabel = (value, labels) => {
        const normalizedValue = normalizeText(value);
        return labels.some((label) => {
          const normalizedLabel = normalizeText(label);
          return normalizedValue === normalizedLabel || normalizedValue.startsWith(`${normalizedLabel} `);
        });
      };
      const valueFor = (labels) => {
        const row = profileRows.find((entry) => matchesProfileLabel(entry.cells?.[0] ?? entry.label, labels));
        return row?.cells?.[1] ?? null;
      };
      const residentName = result.visual?.title?.replace(/\s+Resident Profile$/i, "") ?? "Resident";
      const residentId = valueFor(["resident #", "resident id"]);
      const residentIdentity = residentId && residentId !== "—" ? `${residentName} (Resident #${residentId})` : residentName;
      const community = valueFor(["community"]);
      const unit = valueFor(["unit"]);
      if (/\b(medication|medications|meds|emar|mar)\b/.test(text)) {
        const activeMeds = valueFor(["active medications"]);
        const compliance = valueFor(["mar compliance, 30 days"]);
        const notGiven = valueFor(["mar not given, 30 days"]);
        const refusals30 = valueFor(["mar refusals, 30 days"]);
        const lastMar = valueFor(["last mar record"]);
        const location = community ? `${community}${unit && unit !== "—" ? `, unit ${unit}` : ""}` : "the current roster";
        const marParts = [
          activeMeds && activeMeds !== "—" ? `${activeMeds} active medications` : null,
          compliance && compliance !== "—" ? `${compliance} 30-day MAR compliance` : null,
          notGiven && notGiven !== "—" ? `${notGiven} not given in 30 days` : null,
          refusals30 && refusals30 !== "—" ? `${refusals30} refusals in 30 days` : null,
          lastMar && lastMar !== "—" ? `last MAR record ${lastMar}` : null
        ].filter(Boolean);
        return marParts.length
          ? `${residentIdentity} is at ${location}. Medication details show ${formatNaturalList(marParts)}.`
          : `${residentIdentity} is at ${location}. Resident-level MAR summary data is unavailable.`;
      }
      const age = valueFor(["age"]);
      const los = valueFor(["length of stay", "los"]);
      const diagnosis = valueFor(["primary diagnosis", "diagnosis"]);
      const incidentCount = valueFor(["incidents, available history", "incidents, all history", "incidents, loaded history"]);
      const incidents90 = valueFor(["incidents, 90 days"]);
      const lastIncident = valueFor(["last incident"]);
      const location = community
        ? `${community}${unit && unit !== "—" ? `, unit ${unit}` : ""}`
        : "the current roster";
      const profileDetails = [
        age && age !== "—" ? `age ${age}` : null,
        los && los !== "—" ? `length of stay ${los}` : null,
        diagnosis && diagnosis !== "—" ? `primary diagnosis ${diagnosis}` : null
      ].filter(Boolean);
      const incidentDetails = incidentCount && incidentCount !== "—"
        ? `Incident history shows ${incidentCount} incidents${incidents90 && incidents90 !== "—" ? `, including ${incidents90} in the past 90 days` : ""}${lastIncident && lastIncident !== "—" ? `, with the most recent ${lastIncident.replace(" · ", " on ")}` : ""}.`
        : null;
      const asksForProfileChange = /\b(change|changed|changes|different|recent changes|what's different)\b/.test(text);
      if (community) {
        const profileSentence = profileDetails.length ? ` Current profile: ${formatNaturalList(profileDetails)}.` : "";
        if (asksForProfileChange) {
          return `Historical profile changes are unavailable, so this is the current record for ${residentIdentity} at ${location}.${profileSentence}`.trim();
        }
        return `${residentIdentity} is a current resident at ${location}.${profileSentence} ${incidentDetails ?? "Resident incident history is unavailable."}`.trim();
      }
      const detail = firstMeaningfulTextLine(result.text);
      return detail || "I found a matching resident profile in the current roster.";
    }

    if (result.tool === "resident_risk_summary") {
      const topRows = rows.slice(0, 3);
      if (!topRows.length) return "No residents matched the available review signals.";
      const ranking = formatNaturalList(topRows.map((row) => `${row.label} (${row.cells?.[3] ?? 0} incidents)`));
      const gapValues = rows.map((row) => parseDisplayNumber(row.cells?.[4])).filter((value) => value != null);
      const gapSignal = gapValues.length && gapValues.every((value) => value === 0)
        ? " The current data shows no documentation gaps for the residents in this review. The ranking therefore reflects available incident volume."
        : " Current documentation-gap and length-of-stay context is shown alongside incident volume for human review.";
      const period = formatTracePeriodRange(result.trace?.period) ?? "the available incident-history window";
      return `This is an operational review queue, not a clinical risk score. Across ${period}, the highest-ranked residents are ${ranking}.${gapSignal}`;
    }

    if (result.tool === "resident_search") {
      const total = result.visual?.originalRowCount ?? result.trace?.rowCount ?? rows.length;
      const scope = result.trace?.communityName ?? "Portfolio";
      const note = String(result.trace?.note ?? "");
      const terms = note.match(/terms:\s*([^;]+)/i)?.[1]?.trim();
      if (terms) {
        const topMatches = rows.slice(0, 3).map((row) => row.label).filter(Boolean).join(", ");
        return `${scope} resident search found ${formatNumber(total)} current resident${Number(total) === 1 ? "" : "s"} matching “${terms}”${topMatches ? `: ${formatNaturalList(topMatches.split(", ").filter(Boolean))}` : ""}.`;
      }
      return `${scope} resident roster contains ${formatNumber(total)} current resident${Number(total) === 1 ? "" : "s"}.`;
    }

    if (result.tool === "resident_flow_weekly") {
      const flowLine = String(result.text ?? "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => /\b(intakes?|discharges?|current-roster intakes?|net)\b/i.test(line) && /:/.test(line));
      const flowMatch = flowLine?.match(/last\s+(\d+)\s+weeks through\s+([^:]+):\s*([\d,]+)\s+intakes found from current-roster admit dates/i);
      if (flowMatch) {
        return `Over the last ${flowMatch[1]} weeks through ${flowMatch[2]}, ${flowMatch[3]} admissions appear in the current roster. Discharges are not populated yet, so this view should be read as intake only.`;
      }
      return flowLine || firstMeaningfulTextLine(result.text) || "Weekly resident flow is summarized below.";
    }

    if (result.tool === "diagnosis_mix") {
      const grouped = hasVisualColumn(result, "Community") && hasVisualColumn(result, "Leading diagnosis");
      if (grouped) {
        const totalResidents = rows.reduce((total, row) => total + (parseDisplayNumber(row.cells?.[1]) ?? 0), 0);
        const byCount = [...rows].sort((left, right) => (parseDisplayNumber(right.cells?.[3]) ?? 0) - (parseDisplayNumber(left.cells?.[3]) ?? 0));
        const byShare = [...rows].sort((left, right) => (parseDisplayNumber(right.cells?.[4]) ?? 0) - (parseDisplayNumber(left.cells?.[4]) ?? 0));
        const schizophreniaLeads = rows.filter((row) => /schizophrenia/i.test(String(row.cells?.[2] ?? ""))).length;
        const commonSignal = schizophreniaLeads === rows.length
          ? `A schizophrenia-spectrum diagnosis leads the current diagnosis mix in all ${rows.length} communities.`
          : `Leading diagnoses vary across the ${rows.length} communities.`;
        return `${commonSignal} ${byCount[0]?.label} has the largest leading-diagnosis count at ${byCount[0]?.cells?.[3]} of ${byCount[0]?.cells?.[1]} residents, while ${byShare[0]?.label} has the highest concentration at ${byShare[0]?.cells?.[4]}. The comparison covers ${formatNumber(totalResidents)} current residents.`;
      }
      const residentCount = Number(result.trace?.rowCount ?? 0);
      const topRows = rows.slice(0, 3);
      const top = topRows[0];
      const topShare = residentCount ? formatOneDecimal(Number(top?.value || 0) / residentCount * 100) : null;
      const followers = topRows.slice(1).map((row) => `${row.label} (${formatNumber(row.value)})`);
      return `${label}'s most common diagnosis is ${top?.label ?? "unavailable"} at ${formatNumber(top?.value ?? 0)} of ${formatNumber(residentCount)} current residents${topShare ? ` (${topShare}%)` : ""}${followers.length ? `, followed by ${formatNaturalList(followers)}` : ""}.`;
    }

    if (result.tool === "length_of_stay_mix") {
      const grouped = hasVisualColumn(result, "Community") && hasVisualColumn(result, "Average LOS");
      if (grouped) {
        const ranked = [...rows].sort((left, right) => (parseDisplayNumber(right.cells?.[2]) ?? 0) - (parseDisplayNumber(left.cells?.[2]) ?? 0));
        const longestAverage = ranked[0];
        const shortestAverage = ranked.at(-1);
        const highestLongStayShare = [...rows].sort((left, right) => (parseDisplayNumber(right.cells?.[5]) ?? 0) - (parseDisplayNumber(left.cells?.[5]) ?? 0))[0];
        const shareSubject = highestLongStayShare?.label;
        return `${longestAverage?.label} has the highest average length of stay at ${longestAverage?.cells?.[2]} days, while ${shortestAverage?.label} has the lowest at ${shortestAverage?.cells?.[2]} days. ${shareSubject} has the largest 365-plus-day share at ${highestLongStayShare?.cells?.[5]}.`;
      }
      const averageLine = String(result.text ?? "").split("\n").find((line) => /^average los:/i.test(line.trim()));
      const averageMatch = averageLine?.match(/average los:\s*([\d,]+) days across ([\d,]+) residents/i);
      const longestBucket = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0))[0];
      const longestLine = String(result.text ?? "").split("\n").find((line) => /^longest stays:/i.test(line.trim()));
      const longestResidents = [...String(longestLine ?? "").matchAll(/(?:^|,\s*)([^,(]+?)\s*\(([\d,]+) days\)/g)]
        .flatMap((match) => match[1] && match[2]
          ? [{ name: match[1].replace(/^longest stays:\s*/i, "").trim(), days: match[2] }]
          : [])
        .filter((resident) => resident.name);
      if (/\b(who|longest stay|longest length|longest-stay)\b/.test(text) && longestResidents.length) {
        const [first, ...next] = longestResidents;
        if (!first) return firstMeaningfulTextLine(result.text);
        return `${first.name} has the longest length of stay at ${first.days} days${next.length ? `, followed by ${formatNaturalList(next.slice(0, 2).map((resident) => `${resident.name} at ${resident.days} days`))}` : ""}. ${label} averages ${averageMatch?.[1] ?? "—"} days across ${averageMatch?.[2] ?? formatNumber(result.trace?.rowCount ?? 0)} current residents.`;
      }
      if (averageMatch) {
        const averageResidentCount = averageMatch[2];
        const largestShare = averageResidentCount && Number(averageResidentCount)
          ? formatOneDecimal(Number(longestBucket?.value ?? 0) / Number(averageResidentCount.replace(/,/g, "")) * 100)
          : null;
        const longestStayRead = longestResidents.length
          ? ` Longest stays are ${formatNaturalList(longestResidents.slice(0, 3).map((resident) => `${resident.name} at ${resident.days} days`))}.`
          : "";
        return `Average LOS at ${label} is ${averageMatch[1]} days across ${averageMatch[2]} current residents. The ${longestBucket?.label} band is largest with ${formatNumber(longestBucket?.value ?? 0)} residents${largestShare ? ` (${largestShare}%)` : ""}.${longestStayRead}`;
      }
      return firstMeaningfulTextLine(result.text);
    }

    if (result.tool === "documentation_gaps") {
      const title = result.visual?.title || firstMeaningfulTextLine(result.text);
      const rowCount = result.trace?.rowCount ?? result.visual?.rows?.length ?? 0;
      return `${title || "Documentation gaps"} found ${formatNumber(rowCount)} documentation item${Number(rowCount) === 1 ? "" : "s"} that need review.`;
    }

    if (result.tool === "medication_profile") {
      const summaryRows = result.visual?.rows ?? [];
      if (hasVisualColumn(result, "Community") && hasVisualColumn(result, "Compliance")) {
        const ranked = [...summaryRows].sort((left, right) => Number(left.value || 0) - Number(right.value || 0));
        const lowest = ranked[0];
        const highest = ranked.at(-1);
        const scheduled = summaryRows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Scheduled")) ?? 0), 0);
        const given = summaryRows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Given")) ?? 0), 0);
        const notGiven = summaryRows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Not given")) ?? 0), 0);
        const notGivenShare = scheduled ? formatOneDecimal(notGiven / scheduled * 100) : null;
        const period = formatTracePeriodRange(result.trace?.period) ?? "the latest available month";
        const relativeLatest = isRelativeLatestIntent(text) || (result.certifiedQuestion?.id === "medication-profile" && !hasExplicitMonthIntent(text));
        const periodLead = relativeLatest ? `${period} is the latest available medication month. Compliance` : `${period} medication compliance`;
        return `${periodLead} ranged from ${visualCell(result, lowest, "Compliance")} at ${lowest?.label} to ${visualCell(result, highest, "Compliance")} at ${highest?.label}. Of ${formatNumber(scheduled)} scheduled administrations, ${formatNumber(given)} were documented as given and ${formatNumber(notGiven)} were not given${notGivenShare ? ` (${notGivenShare}%)` : ""}.`;
      }
      const valueFor = (label) => {
        const row = summaryRows.find((entry) => normalizeText(entry.label) === normalizeText(label));
        return row?.cells?.[1] ?? null;
      };
      const scope = result.trace?.communityName ?? result.visual?.title?.replace(/\s+Medication Profile$/i, "") ?? "Portfolio";
      const compliance = valueFor("Compliance");
      const scheduled = valueFor("Scheduled");
      const given = valueFor("Given") ?? (result.summary?.given != null ? formatNumber(result.summary.given) : null);
      const notGiven = valueFor("Not given");
      const period = formatTracePeriodRange(result.trace?.period);
      const relativeLatest = isRelativeLatestIntent(text) || (result.certifiedQuestion?.id === "medication-profile" && !hasExplicitMonthIntent(text));
      const scopeSubject = normalizeText(scope) === "portfolio"
        ? "The portfolio"
        : scope;
      const latestMonthSentence = period && relativeLatest ? `${period} is the latest available medication month.` : null;
      const summarySentence = compliance
        ? `${scopeSubject} documented ${compliance} medication compliance${period && !relativeLatest ? ` in ${period}` : ""}.`
        : scheduled
          ? `${scope} had ${scheduled} scheduled medication administrations${period ? ` in ${period}` : ""}.`
          : null;
      const notGivenValue = parseDisplayNumber(notGiven);
      const scheduledValue = parseDisplayNumber(scheduled);
      const notGivenRate = notGivenValue !== null && scheduledValue
        ? formatOneDecimal(notGivenValue / scheduledValue * 100)
        : null;
      const exceptionSentence = notGiven != null
        ? `${scheduled ? `Of ${scheduled} scheduled administrations, ` : ""}${given ? `${given} were documented as given and ` : ""}${notGiven} ${String(notGiven) === "1" ? "was" : "were"} not given${notGivenRate ? ` (${notGivenRate}%)` : ""}.`
        : null;
      return [latestMonthSentence, summarySentence, exceptionSentence].filter(Boolean).join(" ") || firstMeaningfulTextLine(result.text);
    }

    if (result.tool === "medication_watch") {
      const title = result.visual?.title || firstMeaningfulTextLine(result.text) || "Medication watch";
      if ((result.truthState ?? result.trace?.truthState) === "not_loaded") {
        return `${title} needs resident-level MAR summaries, and those are not published in the current data bundle. The supported path for now is community medication compliance and refusal totals, which show site-level performance but not the resident follow-up list.`;
      }
      const rowCount = result.trace?.rowCount ?? result.visual?.originalRowCount ?? result.visual?.rows?.length ?? 0;
      const top = rows[0];
      if (!top) return `${title}: no current resident medication watch items matched this scope.`;
      const cells = top.cells ?? [];
      const resident = cells[0] ?? top.label;
      const signal = cells[3] ?? "MAR summary available";
      const compliance = cells[4] ? `${cells[4]} compliance` : null;
      const detail = formatNaturalList([signal, compliance].filter(Boolean));
      return `${title}: ${resident} is the top medication watch item. The review includes ${formatNumber(rowCount)} resident medication summar${Number(rowCount) === 1 ? "y" : "ies"}, and the leading signal is ${detail}.`;
    }

    if (result.tool === "medication_refusals_by_community") {
      const medicationLine = String(result.text ?? "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => /^most refused medications:/i.test(line));
      const communityLine = String(result.text ?? "")
        .split("\n")
        .map((line) => line.trim())
        .find((line) => /^(?:by community|community totals):/i.test(line));
      const medicationMatch = medicationLine?.match(/^most refused medications:\s*([^()]+?)\s*\(([\d,]+)\)/i);
      const communityMatch = communityLine?.match(/^(?:by community|community totals):\s*([^()]+?)\s*\(([\d,]+)\)/i);
      if (medicationMatch?.[1] && medicationMatch?.[2] && communityMatch?.[1] && communityMatch?.[2]) {
        const total = (result.visual?.rows ?? []).reduce((sum, row) => sum + (Number(row.value) || 0), 0);
        const medicationCount = parseDisplayNumber(medicationMatch[2]) ?? 0;
        const communityCount = parseDisplayNumber(communityMatch[2]) ?? 0;
        const medicationShare = total ? formatOneDecimal(medicationCount / total * 100) : null;
        const communityShare = total ? formatOneDecimal(communityCount / total * 100) : null;
        const period = formatTracePeriodRange(result.trace?.period);
        if (period && result.trace?.communityName) {
          return `In ${period}, ${result.trace.communityName} recorded ${formatNumber(total)} medication refusals. ${medicationMatch[1].trim()} had the most at ${medicationMatch[2]}${medicationShare ? ` (${medicationShare}%)` : ""}.`;
        }
        if (period) {
          return `In ${period}, the portfolio recorded ${formatNumber(total)} medication refusals. ${medicationMatch[1].trim()} had the most at ${medicationMatch[2]}${medicationShare ? ` (${medicationShare}%)` : ""}, and ${communityMatch[1].trim()} had the largest community total at ${communityMatch[2]}${communityShare ? ` (${communityShare}%)` : ""}.`;
        }
        return `The refusal summary includes ${formatNumber(total)} cumulative refusals. ${medicationMatch[1].trim()} had the most at ${medicationMatch[2]}${medicationShare ? ` (${medicationShare}%)` : ""}, and ${communityMatch[1].trim()} had the largest community total at ${communityMatch[2]}${communityShare ? ` (${communityShare}%)` : ""}. These cumulative refusal totals have no monthly period and should not be read as current-month counts.`;
      }
      return [medicationLine, communityLine].filter(Boolean).join(" ");
    }

    if (result.tool === "medication_compliance" && rows.length) {
      const isComplianceHistory = result.certifiedQuestion?.id === "medication-compliance-history";
      if (isComplianceHistory && result.trace?.communityName) {
        // Medication history rows are emitted in chronological order. Keep
        // that order rather than alphabetically sorting display month labels.
        const chronological = [...rows];
        const first = chronological[0];
        const last = chronological.at(-1);
        const firstValue = Number(first?.value ?? 0);
        const lastValue = Number(last?.value ?? 0);
        const change = lastValue - firstValue;
        const firstMonth = visualCell(result, first, "Month") ?? first?.label ?? "the first month";
        const lastMonth = visualCell(result, last, "Month") ?? last?.label ?? "the last month";
        const scheduled = rows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Scheduled")) ?? 0), 0);
        const given = rows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Given")) ?? 0), 0);
        const movement = Math.abs(change) < 0.05
          ? `was unchanged at ${formatOneDecimal(lastValue)}% from ${firstMonth} through ${lastMonth}`
          : `${change > 0 ? "increased" : "decreased"} by ${formatOneDecimal(Math.abs(change))} percentage points, from ${formatOneDecimal(firstValue)}% in ${firstMonth} to ${formatOneDecimal(lastValue)}% in ${lastMonth}`;
        return `${result.trace.communityName} medication compliance ${movement}. Across the period, ${formatNumber(given)} of ${formatNumber(scheduled)} scheduled administrations were documented as given.`;
      }
      const sorted = [...rows].sort((left, right) => Number(left.value || 0) - Number(right.value || 0));
      const lowest = sorted[0];
      const highest = sorted.at(-1);
      const period = formatTracePeriodRange(result.trace?.period) ?? result.visual?.subtitle;
      const lowestCompliance = lowest?.cells?.at(-1) ?? (lowest?.value != null ? `${Number(lowest.value).toFixed(1)}%` : null);
      const highestCompliance = highest?.cells?.at(-1) ?? (highest?.value != null ? `${Number(highest.value).toFixed(1)}%` : null);
      if (lowest?.label && highest?.label) {
        const scheduled = rows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Scheduled")) ?? 0), 0);
        const given = rows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Given")) ?? 0), 0);
        const weightedCompliance = scheduled ? formatOneDecimal(given / scheduled * 100) : null;
        const largestNotGiven = [...rows].sort((left, right) => (parseDisplayNumber(visualCell(result, right, "Not given")) ?? 0) - (parseDisplayNumber(visualCell(result, left, "Not given")) ?? 0))[0];
        if (result.trace?.communityName) {
          const notGiven = rows.reduce((total, row) => total + (parseDisplayNumber(visualCell(result, row, "Not given")) ?? 0), 0);
          const notGivenShare = scheduled ? formatOneDecimal(notGiven / scheduled * 100) : null;
          return `${result.trace.communityName} medication compliance was ${weightedCompliance ?? lowestCompliance} in ${period || "the latest available month"}. Of ${formatNumber(scheduled)} scheduled administrations, ${formatNumber(given)} were documented as given and ${formatNumber(notGiven)} were not given${notGivenShare ? ` (${notGivenShare}%)` : ""}.`;
        }
        const largestNotGivenPeriod = visualCell(result, largestNotGiven, "Month");
        const relativeLatest = isRelativeLatestIntent(text) || (result.certifiedQuestion?.id === "medication-compliance" && !hasExplicitMonthIntent(text));
        const periodLead = period && relativeLatest
          ? `${period} is the latest available medication month. Portfolio compliance`
          : period
            ? `${period} portfolio medication compliance`
            : "Portfolio medication compliance";
        return `${periodLead}${weightedCompliance ? ` was ${weightedCompliance}%: ${formatNumber(given)} of ${formatNumber(scheduled)} scheduled administrations were documented as given` : " is unavailable"}. Community results ranged from ${lowestCompliance} at ${lowest.label} to ${highestCompliance} at ${highest.label}. ${largestNotGiven.label} had the largest not-given count at ${visualCell(result, largestNotGiven, "Not given")}${largestNotGivenPeriod ? ` in ${largestNotGivenPeriod}` : ""}.`;
      }
      return `${period ? `${period} medication compliance` : "Medication compliance"} is summarized below.`;
    }

    if (result.tool === "medication_exception_detail") {
      const rowCount = result.trace?.rowCount ?? result.visual?.originalRowCount ?? result.visual?.rows?.length ?? 0;
      const note = String(result.trace?.note ?? "");
      const kind = note.match(/kind=([^;]+)/i)?.[1]?.trim();
      const scope = result.trace?.communityName ?? result.visual?.title?.split(" · ")?.[0] ?? "Portfolio";
      const period = formatTracePeriodRange(result.trace?.period) ?? "the available period";
      const noun = kind === "refusal"
        ? "medication refusal records"
        : kind === "late"
          ? "late medication administrations"
          : kind === "held"
            ? "held or on-hold medication records"
            : kind === "prn"
              ? "PRN medication records"
              : "MAR exception records";
      if ((result.truthState ?? result.trace?.truthState) === "not_loaded") {
        return `MAR exception detail is not published for ${scope} during ${period}. Community medication compliance and refusal totals are the supported path for now, but they do not include resident names, administration times, or exception reasons.`;
      }
      return `${scope} had ${formatNumber(rowCount)} matching ${noun} for ${period}.`;
    }

    if (result.tool === "medication_orders_current") {
      const orderCount = result.trace?.rowCount ?? result.visual?.originalRowCount ?? result.visual?.rows?.length ?? 0;
      const residentCount = Number(String(result.trace?.note ?? "").match(/residents=(\d+)/i)?.[1] ?? 0);
      const scope = result.trace?.communityName ?? "Portfolio";
      if ((result.truthState ?? result.trace?.truthState) === "not_loaded") {
        return `Current medication orders are not published for ${scope}.`;
      }
      return `${scope} has ${formatNumber(orderCount)} current medication orders for ${formatNumber(residentCount)} residents. The table shows the exact active orders, dosing, route, schedule, indication, and medication flags.`;
    }

    if (result.tool === "top_incident_category_by_community" && rows.length) {
      const highest = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0))[0];
      const mostConcentrated = [...rows].sort((left, right) => (parseDisplayNumber(right.cells?.[5]) ?? 0) - (parseDisplayNumber(left.cells?.[5]) ?? 0))[0];
      const rowsByPeriod = new Map();
      for (const row of rows) {
        const period = row.cells?.[0] ?? formatTracePeriodRange(result.trace?.period) ?? "the available period";
        if (!rowsByPeriod.has(period)) rowsByPeriod.set(period, []);
        rowsByPeriod.get(period).push(row);
      }
      const periodLeaders = [...rowsByPeriod.entries()].map(([period, periodRows]) => {
        const categoryCounts = new Map();
        for (const row of periodRows) {
          const category = row.cells?.[2];
          if (category) categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
        }
        const leader = [...categoryCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0];
        return leader ? { period, category: leader[0], count: leader[1], communities: periodRows.length } : { period, category: null, count: 0, communities: periodRows.length };
      });
      const firstPeriodLeader = periodLeaders[0];
      const firstLeaderCategory = firstPeriodLeader?.category ?? null;
      const sameLeader = Boolean(firstLeaderCategory) && periodLeaders.length > 1 && periodLeaders.every((entry) => entry.category === firstLeaderCategory);
      const leaderSentence = sameLeader
        ? `${firstPeriodLeader?.category} was the most common leading category in each selected period: ${formatNaturalList(periodLeaders.map((entry) => `${entry.count} of ${entry.communities} communities in ${entry.period}`))}.`
        : rowsByPeriod.size > 1
          ? `By period, ${formatNaturalList(periodLeaders.map((entry) => entry.category ? `${entry.category} led ${entry.count} of ${entry.communities} communities in ${entry.period}` : `${entry.communities} communities were shown for ${entry.period}`))}.`
          : periodLeaders[0]?.category
            ? `${periodLeaders[0].category} led ${periodLeaders[0].count} of ${periodLeaders[0].communities} communities in ${periodLeaders[0].period}.`
            : `${periodLeaders[0]?.communities ?? 0} communities were shown.`;
      const highestPeriod = highest?.cells?.[0] ?? "the available period";
      const concentrationPeriod = mostConcentrated?.cells?.[0] ?? "the available period";
      return `${leaderSentence} The largest leading-category total was ${highest?.cells?.[3]} ${highest?.cells?.[2]} incidents at ${highest?.label} in ${highestPeriod}. ${mostConcentrated?.label} had the highest concentration, with ${mostConcentrated?.cells?.[2]} at ${mostConcentrated?.cells?.[5]} in ${concentrationPeriod}.`;
    }

    if (result.tool === "incident_resident_drivers" && rows.length) {
      const sorted = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0) || String(left.label).localeCompare(String(right.label)));
      const top = sorted[0];
      const topValue = Number(top?.value ?? 0);
      const tied = sorted.filter((row) => Number(row.value ?? 0) === topValue);
      const total = Number(result.trace?.rowCount ?? 0);
      const category = String(result.trace?.note ?? "").match(/category=([^;]+)/i)?.[1]?.trim();
      const period = result.trace?.period ? formatMonthLabel(result.trace.period) : "the available period";
      const share = total ? formatOneDecimal(tied.length * topValue / total * 100) : null;
      if (tied.length > 1) {
        return `${formatNaturalList(tied.map((row) => row.label))} tied for the most incidents${category ? ` for ${category}` : ""} in ${period} at ${formatNumber(topValue)} each${share ? `; together they accounted for ${share}% of the ${formatNumber(total)} matching incidents` : ""}.`;
      }
      const next = sorted.find((row) => Number(row.value ?? 0) < topValue);
      return `${top.label} had the most incidents${category ? ` for ${category}` : ""} in ${period} at ${formatNumber(topValue)}${total && share ? ` (${share}% of ${formatNumber(total)})` : ""}${next ? `, followed by ${next.label} at ${formatNumber(next.value)}` : ""}.`;
    }

    if (["slice_metric", "slice_discovery"].includes(result.tool) && rows.length) {
      if (isGroupedCensusPeriodSlice(result)) {
        return buildGroupedCensusPeriodTakeaway(result);
      }

      const columns = result.visual?.columns ?? [];
      const title = normalizeText(result.visual?.title ?? "");
      const isTrendTable = columns.some((column) => normalizeText(column) === "month") || /\btrend|monthly census|census slice\b/.test(title);
      if (isTrendTable) {
        const ordered = [...rows].sort((left, right) => Date.parse(`1 ${left.label}`) - Date.parse(`1 ${right.label}`));
        const latest = ordered.at(-1) ?? rows.at(-1);
        if (latest) return `${latest.label} is the latest point at ${formatNumber(latest.value)}${result.visual?.valueLabel ? ` ${executiveValueLabel(result.visual.valueLabel)}` : ""}.`;
      }
      const note = String(result.trace?.note ?? "");
      const category = note.match(/category=([^;]+)/i)?.[1]?.trim();
      const period = result.trace?.period ? formatMonthLabel(result.trace.period) : null;
      const metric = note.match(/metric=([^;]+)/i)?.[1]?.trim();
      const group = note.match(/group=([^;]+)/i)?.[1]?.trim();
      const top = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0))[0];
      if (top) {
        if (metric === "incidents" && group === "community") {
          const requestedPeriods = String(result.trace?.period ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
            .map(formatMonthLabel);
          if (requestedPeriods.length > 1) {
            /** @type {Map<string, any[]>} */
            const rowsByPeriod = new Map(requestedPeriods.map((periodLabel) => [periodLabel, []]));
            for (const row of rows) {
              const rowLabel = String(row.cells?.[0] ?? row.label ?? "");
              const matchedPeriod = requestedPeriods.find((periodLabel) => rowLabel.startsWith(`${periodLabel} · `));
              if (!matchedPeriod) continue;
              const periodRows = rowsByPeriod.get(matchedPeriod);
              if (!periodRows) continue;
              periodRows.push({
                ...row,
                communityName: rowLabel.slice(`${matchedPeriod} · `.length)
              });
            }
            const periodSummaries = [...rowsByPeriod.entries()].map(([periodLabel, periodRows]) => {
              const rankedRows = [...periodRows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0));
              const periodTotal = rankedRows.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
              const leader = rankedRows[0];
              return {
                periodLabel,
                total: periodTotal,
                leader: leader?.communityName,
                leaderValue: Number(leader?.value ?? 0),
                leaderShare: periodTotal ? Number(leader?.value ?? 0) / periodTotal * 100 : null,
                communities: new Set(periodRows.map((row) => row.communityName).filter(Boolean)).size
              };
            });
            const overallTotal = periodSummaries.reduce((sum, summary) => sum + summary.total, 0);
            const communityCount = Math.max(...periodSummaries.map((summary) => summary.communities), 0);
            const allSameLeader = periodSummaries.every((summary) => summary.leader && summary.leader === periodSummaries[0]?.leader);
            let comparisonSentence;
            if (allSameLeader && periodSummaries.length === 2) {
              const firstPeriod = periodSummaries[0];
              const lastPeriod = periodSummaries[1];
              if (firstPeriod && lastPeriod) {
                const delta = lastPeriod.leaderValue - firstPeriod.leaderValue;
                const movement = delta === 0
                  ? `holding at ${formatNumber(lastPeriod.leaderValue)}`
                  : `${delta > 0 ? "increasing" : "decreasing"} by ${formatNumber(Math.abs(delta))} from ${formatNumber(firstPeriod.leaderValue)} in ${firstPeriod.periodLabel} to ${formatNumber(lastPeriod.leaderValue)} in ${lastPeriod.periodLabel}`;
                comparisonSentence = `${firstPeriod.leader} led both periods, ${movement}. Its share moved from ${formatOneDecimal(firstPeriod.leaderShare)}% to ${formatOneDecimal(lastPeriod.leaderShare)}%.`;
              }
            } else {
              const reads = periodSummaries.map((summary) => `${summary.leader} led ${summary.periodLabel} with ${formatNumber(summary.leaderValue)} of ${formatNumber(summary.total)}${summary.leaderShare != null ? ` (${formatOneDecimal(summary.leaderShare)}%)` : ""}`);
              comparisonSentence = `By period, ${formatNaturalList(reads)}.`;
            }
            return `Across ${formatNaturalList(requestedPeriods)}, ${formatNumber(overallTotal)}${category ? ` ${category}` : ""} incidents were recorded. ${comparisonSentence ?? "Period leaders were unavailable."} The comparison covers all ${formatNumber(communityCount)} communities across ${formatNumber(periodSummaries.length)} periods.`;
          }
          const ranked = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0) || String(left.label).localeCompare(String(right.label)));
          const total = ranked.reduce((sum, row) => sum + (Number(row.value) || 0), 0);
          const topShare = total ? formatOneDecimal(Number(top.value) / total * 100) : null;
          const nextValue = Number(ranked.find((row) => Number(row.value) < Number(top.value))?.value ?? NaN);
          const runnersUp = Number.isFinite(nextValue) ? ranked.filter((row) => Number(row.value) === nextValue) : [];
          const runnerUpSentence = runnersUp.length
            ? ` ${formatNaturalList(runnersUp.map((row) => row.label))} ${runnersUp.length === 1 ? "was" : "were"} next at ${formatNumber(nextValue)}${runnersUp.length > 1 ? " each" : ""}.`
            : "";
          return `${top.label} accounted for ${formatNumber(top.value)} of ${formatNumber(total)}${category ? ` ${category}` : ""} incidents${period ? ` in ${period}` : ""}${topShare ? ` (${topShare}%)` : ""}.${runnerUpSentence} The comparison covers all ${formatNumber(rows.length)} communities.`;
        }
        return `${top.label} was the top result at ${formatNumber(top.value)}${result.visual?.valueLabel ? ` ${executiveValueLabel(result.visual.valueLabel)}` : ""}.`;
      }
    }

    if (["slice_metric", "slice_discovery"].includes(result.tool)) {
      return firstMeaningfulTextLine(result.text) || "The requested slice is shown below.";
    }

    if (result.tool === "tool_context_catalog" && rows.length) {
      const available = rows.map((row) => `${row.cells?.[0] ?? row.label} (${row.cells?.[1] ?? "available coverage"})`);
      return `The current data bundle supports ${formatNaturalList(available)}. Fields outside those areas are not published yet, so analysis stays inside these core areas.`;
    }

    if (result.tool === "census_trend" && rows.length) {
      const summary = result.summary ?? {};
      const pointCountIntent = /\b(how many|count|headcount|what was|number of)\b/.test(text) && !/\b(trends?|history|over time|trajectory)\b/.test(text);
      if (pointCountIntent && summary.period && Number.isFinite(Number(summary.census))) {
        const noun = /\b(clients?|residents?|people)\b/i.test(text) ? "clients" : "census";
        if (noun === "census") return `${summary.communityName ?? "Portfolio"} census was ${formatNumber(summary.census)} in ${formatMonthLabel(summary.period)}.`;
        return `${summary.communityName ?? "Portfolio"} had ${formatNumber(summary.census)} ${noun} in ${formatMonthLabel(summary.period)}.`;
      }
      const first = rows[0];
      const latest = rows.at(-1);
      if (first && latest) {
        const delta = Number(latest.value || 0) - Number(first.value || 0);
        const latestMovement = rows.length > 1 ? Number(latest.value || 0) - Number(rows.at(-2)?.value || 0) : null;
        const highest = Math.max(...rows.map((row) => Number(row.value || 0)));
        const lowest = Math.min(...rows.map((row) => Number(row.value || 0)));
        const rangeSignal = Number(latest.value) === highest
          ? `reached the high point for this period at ${formatNumber(highest)}`
          : `finished within a range of ${formatNumber(lowest)} to ${formatNumber(highest)}`;
        const latestSignal = latestMovement == null || latestMovement === 0
          ? rangeSignal
          : `${latestMovement > 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(latestMovement))} from ${rows.at(-2)?.label} and ${rangeSignal}`;
        return `${summary.communityName ?? result.trace?.communityName ?? "Portfolio"} census moved from ${formatNumber(first.value)} in ${first.label} to ${formatNumber(latest.value)} in ${latest.label}, ${movementComparison(delta, first.label)}. The latest month ${latestSignal}. The low point was ${formatNumber(lowest)}.`;
      }
    }

    if (isRankingOrComparisonIntent(text) && rows.length) {
      const top = [...rows].sort((left, right) => Math.abs(Number(right.value || 0)) - Math.abs(Number(left.value || 0)))[0];
      if (top) {
        return `Top result: ${top.label} at ${formatNumber(top.value)}${result.visual?.valueLabel ? ` ${executiveValueLabel(result.visual.valueLabel)}` : ""}.`;
      }
    }

    if (result.tool === "operating_snapshot" && rows.length) {
      const censusTotal = rows.reduce((total, row) => total + Number(String(row.cells?.[1] ?? 0).replace(/,/g, "") || 0), 0);
      const incidentTotal = rows.reduce((total, row) => total + Number(String(row.cells?.[2] ?? 0).replace(/,/g, "") || 0), 0);
      const top = [...rows].sort((left, right) => Number(right.value || 0) - Number(left.value || 0))[0];
      const censusDelta = rows.reduce((total, row) => total + (parseDisplayNumber(row.cells?.[4]) ?? 0), 0);
      const downCommunities = rows.filter((row) => (parseDisplayNumber(row.cells?.[4]) ?? 0) < 0).length;
      const period = result.trace?.period ? formatMonthLabel(result.trace.period) : "the latest available month";
      const relativeLatest = isRelativeLatestIntent(text) || (result.certifiedQuestion?.id === "operating-snapshot" && !hasExplicitMonthIntent(text));
      const periodLead = relativeLatest ? `${period} is the latest available operating month. ` : `In ${period}, `;
      const censusDirection = censusDelta === 0
        ? `held at ${formatNumber(censusTotal)}`
        : `${censusDelta > 0 ? "increased" : "decreased"} by ${formatNumber(Math.abs(censusDelta))} to ${formatNumber(censusTotal)}`;
      return `${periodLead}Portfolio census ${censusDirection}, with ${downCommunities === 0 ? "no community declining" : `${downCommunities} communit${downCommunities === 1 ? "y" : "ies"} declining`}, while incidents totaled ${formatNumber(incidentTotal)}. ${top?.label ?? "The leading community"} had the highest incident rate at ${formatOneDecimal(top?.value)} per 100 residents.`;
    }

    if (getAnswerFormatContract(content, result).id !== "generic") {
      return firstMeaningfulTextLine(result.text);
    }

    return null;
  }

  function extractExistingAnswer(text) {
    const lines = String(text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines[0]?.toLowerCase() === "answer") {
      return lines.find((line, index) => index > 0 && !/^[-*]\s+/.test(line)) ?? null;
    }
    return lines.find((line) => !/^[-*]\s+/.test(line) && !/^(key facts|context|definition|source)$/i.test(line)) ?? null;
  }

  function addAnalystTakeaway(content, result) {
    const takeaway = buildAnalystTakeaway(content, result);
    if (!takeaway) {
      const existingAnswer = extractExistingAnswer(result?.text);
      const contract = getAnswerFormatContract(content, result);
      if (!existingAnswer || contract.id === "generic") return result;
      return {
        ...result,
        structuredAnswer: buildStructuredToolResult({
          contract,
          content,
          result,
          takeaway: existingAnswer
        })
      };
    }
    const contract = getAnswerFormatContract(content, result);
    const structuredAnswer = buildStructuredToolResult({ contract, content, result, takeaway });

    return {
      ...result,
      structuredAnswer,
      text: buildReadableAnswerText(takeaway, result, content, contract)
    };
  }

  return Object.freeze({
    addAnalystTakeaway,
    buildAnalystTakeaway,
    getAnswerFormatContract
  });
}

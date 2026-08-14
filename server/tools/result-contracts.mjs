import { getMetricGrainDefinitionForResult } from "../../shared/metric-definitions.mjs";

function isDefinitionOrDetailFiller(line, normalizeText) {
  const normalized = normalizeText(line);
  return (
    /^the table includes every loaded matching incident/.test(normalized) ||
    /^computed from loaded/.test(normalized) ||
    /^counts use governed/.test(normalized) ||
    /^governed mar context is not loaded/.test(normalized) ||
    /^compliance uses governed scheduled/.test(normalized) ||
    /^these figures come from/.test(normalized) ||
    /^source detail/.test(normalized)
  );
}

function isInterfaceStageDirection(line) {
  return /\b(?:module|table|chart|card|list) below\b/i.test(String(line ?? "")) ||
    /\b(?:listed|shown|provided) below\b/i.test(String(line ?? "")) ||
    /^The (?:module|table|chart|card|list) (?:shows|opens|previews|compares)\b/i.test(String(line ?? "")) ||
    /\bchat module previews\b/i.test(String(line ?? "")) ||
    /^Preview shown\b/i.test(String(line ?? ""));
}

function isToolTitleLine(line, result, normalizeText) {
  const normalized = normalizeText(line);
  if (!normalized) return true;
  const visualTitle = normalizeText(result?.visual?.title);
  if (visualTitle && (normalized === visualTitle || visualTitle.includes(normalized) || normalized.includes(visualTitle))) return true;
  if (/\bmonth detail$/.test(normalized) && !line.includes(":")) return true;
  return /\b(profile|breakdown|comparison|trends?|slice|topline|movement|snapshot|calculation|category changes|top categories)\b/.test(normalized) && !line.includes(":") && !/^\s*[-*]\s+/.test(line);
}

function cleanExecutiveLanguage(value) {
  return String(value ?? "")
    .replace(/\bJan(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "January")
    .replace(/\bFeb(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "February")
    .replace(/\bMar(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "March")
    .replace(/\bApr(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "April")
    .replace(/\bJun(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "June")
    .replace(/\bJul(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "July")
    .replace(/\bAug(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "August")
    .replace(/\bSep(?:t)?(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "September")
    .replace(/\bOct(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "October")
    .replace(/\bNov(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "November")
    .replace(/\bDec(?=\s+(?:\d{1,2}\s+)?20\d{2}\b)/g, "December")
    .replace(/\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+(20\d{2})\b/g, "$2 $1, $3")
    .replace(/\bactive roster:\s*([\d,]+)\s+current resident rows\b/gi, "active roster: $1 residents")
    .replace(/\bactive roster was\s*([\d,]+)\s+current resident rows\b/gi, "active roster was $1 residents")
    .replace(/\bcurrent roster rows\b/gi, "current residents")
    .replace(/\bcurrent resident rows\b/gi, "residents")
    .replace(/\bresident roster rows\b/gi, "residents")
    .replace(/\broster rows counted\b/gi, "residents counted")
    .replace(/\bdetail incident rows\b/gi, "incident records")
    .replace(/\bincident rows\b/gi, "incidents")
    .replace(/\bincident detail rows\b/gi, "incident detail")
    .replace(/\bmatched incident detail rows\b/gi, "matched incidents")
    .replace(/\bdetail rows\b/gi, "records")
    .replace(/\bsource rows\b/gi, "records")
    .replace(/\bweek\/community rows\b/gi, "weekly community records")
    .replace(/\bcurrent resident admit-date rows\b/gi, "current resident admit dates")
    .replace(/\bresident movement rows\b/gi, "resident movement records")
    .replace(/\bRows shown\b/gi, "Preview shown")
    .replace(/\bTop rows\b/gi, "Leading results")
    .replace(/\bNo rows matched\b/gi, "No records matched")
    .replace(/\brow set\b/gi, "data set")
    .replace(/\brows?\b/gi, "records")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanReadableSentence(value) {
  const clauses = cleanExecutiveLanguage(value)
    .split(/\s*;\s*/g)
    .map((clause) => sentenceCase(clause))
    .filter(Boolean);

  return clauses.join(". ")
    .replace(/\s{2,}/g, " ")
    .replace(/\.+/g, ".")
    .trim();
}

function answerCoverageTokens(value) {
  const matches = String(value ?? "").toLowerCase().match(
    /\d[\d,.]*%?|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|census|incidents?|medications?|compliance|refusals?|awol|elopement|substance|categories?|residents?|clients?|roster|diagnoses?|age|length of stay|los|scheduled|not given)\b/g
  ) ?? [];
  return [...new Set(matches.map((token) => token.replace(/\.$/, "")))];
}

function isFactCoveredByAnswer(fact, answer) {
  const factTokens = answerCoverageTokens(fact);
  const numericTokens = factTokens.filter((token) => /\d/.test(token));
  if (factTokens.length < 2 || numericTokens.length < 1) return false;
  const answerTokens = new Set(answerCoverageTokens(answer));
  const covered = factTokens.filter((token) => answerTokens.has(token)).length;
  return covered / factTokens.length >= 0.75;
}

function cleanExecutiveFactValue(label, value) {
  const normalizedLabel = String(label ?? "").toLowerCase();
  let cleaned = cleanExecutiveLanguage(value);

  if (/\b(top residents?|residents?|clients?|people)\b/.test(normalizedLabel)) {
    cleaned = cleaned.replace(/\brows?\b/gi, "incidents");
  }

  if (/\b(active roster|resident roster)\b/.test(normalizedLabel)) {
    cleaned = cleaned
      .replace(/^([\d,]+)\s+current residents?$/i, "$1 residents")
      .replace(/^([\d,]+)\s+residents?$/i, "$1 residents");
  }

  return cleaned;
}

function normalizeColonLabel(label) {
  return cleanExecutiveLanguage(String(label ?? "")
    .replace(/\s+/g, " ")
    .trim())
    .replace(/^Records compared$/i, "Communities compared")
    .replace(/^Records$/i, "Community results");
}

function normalizeColonValue(value) {
  return cleanExecutiveLanguage(value)
    .replace(/\.$/, "")
    .trim();
}

function sentenceCase(value) {
  const text = String(value ?? "").trim();
  return text ? `${text.charAt(0).toUpperCase()}${text.slice(1)}` : "";
}

function isScopeLikeLabel(label, normalizeText) {
  const normalized = normalizeText(label);
  return (
    /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?) 20\d{2}$/.test(normalized) ||
    /^20\d{2}-\d{2}(?:-\d{2})?$/.test(normalized) ||
    /\b(?:house|services|clarita|pablo|turlock|wallace|victoria|community|portfolio)\b/.test(normalized)
  );
}

function startsWithDeclarativeClause(value) {
  const normalized = String(value ?? "").trim();
  return /^[A-Za-z][A-Za-z0-9 /&'’().,-]{1,70}\s+(?:is|are|was|were|has|had|rose|fell|recorded|declined|increased|decreased|ranges?|shows?|includes?)\b/i.test(normalized);
}

function removeBlankFieldFragments(value) {
  return String(value ?? "")
    .replace(/\b(?:care level|payor|physician|diet|admit date|last incident):\s*[—-](?:[.;]\s*)?/gi, "")
    .replace(/\b(?:care level|payor|physician|diet|admit date|last incident)\s+(?:was\s+)?[—-](?:[.;]\s*)?/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.;])/g, "$1")
    .trim();
}

function normalizeMultiColonFact(line, normalizeText) {
  const matches = [...String(line ?? "").matchAll(/(?:^|[.;]\s+)([A-Za-z0-9 #/&'’().,-]{2,56}):\s*([^.;]+)/g)]
    .map((match) => ({
      label: normalizeColonLabel(match[1]),
      value: normalizeColonValue(match[2])
    }))
    .filter((item) => item.label && item.value && item.value !== "—");

  if (matches.length < 2) return null;

  const get = (labels) => matches.find((item) => labels.some((label) => normalizeText(item.label) === normalizeText(label)))?.value;
  const community = get(["community"]);
  const unit = get(["unit"]);
  const residentId = get(["resident #", "resident"]);
  const age = get(["age"]);
  const los = get(["length of stay", "los"]);
  const admitted = get(["admitted", "admit date"]);
  const diagnosis = get(["primary diagnosis", "diagnosis"]);

  if (community || unit || residentId) {
    return sentenceCase([
      community ? `community is ${community}` : null,
      unit ? `unit is ${unit}` : null,
      residentId ? `resident # is ${residentId.replace(/^#\s*/, "")}` : null
    ].filter(Boolean).join("; ")) + ".";
  }

  if (age || los || admitted) {
    return sentenceCase([
      age ? `age is ${age}` : null,
      los ? `length of stay is ${los}` : null,
      admitted ? `admitted ${admitted}` : null
    ].filter(Boolean).join("; ")) + ".";
  }

  if (diagnosis) return `Primary diagnosis is ${diagnosis}.`;

  return sentenceCase(matches
    .map((item) => {
      const cleanLabel = normalizeColonLabel(item.label);
      const normalizedLabel = normalizeText(cleanLabel);
      if (/^(given|not given|refusals?|incidents?|residents?|scheduled)$/.test(normalizedLabel)) {
        return `${cleanLabel.toLowerCase()} ${item.value}`;
      }
      const verb = /\b(residents|records|incidents|rates|results|communities)\b/i.test(cleanLabel) ? "are" : "is";
      return `${cleanLabel} ${verb} ${item.value}`;
    })
    .join("; ")) + ".";
}

function normalizeFactSentence(line, normalizeText) {
  const trimmed = String(line ?? "").trim().replace(/^\s*[-*]\s+/, "").trim();
  if (!trimmed) return null;
  if (/^(details|answer|context|key facts|supporting facts|source detail|rows checked|data coverage)$/i.test(trimmed)) return null;
  if (/^(top categories|top residents|top medications|last six points|monthly detail|calculation|category changes(?: at .+)?|by community|most frequent residents in the detail records|most frequent residents in the detail rows|residents with the most matching records|medications with the most matching records)$/i.test(trimmed.replace(/:$/, ""))) return null;
  if (isDefinitionOrDetailFiller(trimmed, normalizeText)) return null;
  const monthlyCountList = trimmed.match(/^Counts by month:\s*(.+)$/i)?.[1]
    ?.split(/\s*;\s*/)
    .flatMap((item) => {
      const match = item.match(/^((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d{2})\s*:?\s*([\d,]+)\.?$/i);
      return match?.[1] && match[2] ? [{ month: match[1], count: match[2] }] : [];
    });
  if (monthlyCountList?.length) {
    const readings = monthlyCountList.map(({ month, count }) => `${count} in ${month}`);
    const naturalList = readings.length === 1
      ? readings[0]
      : readings.length === 2
        ? `${readings[0]} and ${readings[1]}`
        : `${readings.slice(0, -1).join(", ")}, and ${readings.at(-1)}`;
    return `Monthly incident counts were ${naturalList}.`;
  }
  const blankFieldThenUsefulField = trimmed.match(/^[A-Za-z0-9 #/&'’().,-]{2,56}:\s*[—-]\.?\s+(.+:.+)$/);
  if (blankFieldThenUsefulField?.[1]) return normalizeFactSentence(blankFieldThenUsefulField[1], normalizeText);
  const multiColonFact = normalizeMultiColonFact(trimmed, normalizeText);
  if (multiColonFact) return multiColonFact;
  const periodFacts = trimmed.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) 20\d{2}:\s*[^.;]+/g);
  if (Array.isArray(periodFacts) && periodFacts.length >= 2) {
    const converted = periodFacts
      .map((fact) => {
        const [label, ...rest] = fact.split(":");
        if (!label) return null;
        return `${label.trim()} was ${rest.join(":").trim().replace(/\.$/, "")}`;
      })
      .filter(Boolean)
      .join("; ");
    return `${converted}.`;
  }
  const colonFact = trimmed.match(/^([A-Za-z0-9][A-Za-z0-9 /&'’().,-]{1,70}):\s+(.+?)\.?$/);
  if (colonFact?.[1] && colonFact?.[2]) {
    const label = colonFact[1].replace(/\bvs\b/i, "versus");
    const cleanLabel = normalizeColonLabel(label);
    const value = removeBlankFieldFragments(cleanExecutiveFactValue(label, colonFact[2].replace(/\.+$/, "")));
    if (!value || value === "—" || value === "-") return null;
    const rowCount = value.match(/^([\d,]+)\s+rows?$/i);
    if (rowCount && !/\b(rows?|records?|source|slice|loaded|current|matched)\b/i.test(label)) {
      return `${cleanLabel} had ${rowCount[1]} incidents.`;
    }
    if (normalizeText(cleanLabel) === "data limit") return `${sentenceCase(value)}.`;
    if (normalizeText(cleanLabel) === "communities compared") return `The comparison covers ${value}.`;
    const countWithShare = value.match(/^([\d,]+)\s*\(([\d.]+%)\)$/);
    if (countWithShare && !/\b(?:community|communities|rate|compliance)\b/i.test(cleanLabel)) {
      return `${cleanLabel} accounted for ${countWithShare[1]} incidents (${countWithShare[2]}).`;
    }
    const movementPeriod = cleanLabel.match(/^movement versus\s+(.+)$/i);
    const movementValue = parseFloat(value.replace(/,/g, ""));
    if (movementPeriod && Number.isFinite(movementValue)) {
      if (movementValue === 0) return `The count was unchanged from ${movementPeriod[1]}.`;
      return `The count ${movementValue > 0 ? "increased" : "decreased"} by ${Math.abs(movementValue)} from ${movementPeriod[1]}.`;
    }
    if (startsWithDeclarativeClause(value)) {
      return isScopeLikeLabel(cleanLabel, normalizeText)
        ? `${cleanLabel} ${value}.`
        : `${sentenceCase(value)}.`;
    }
    const verb = /\b(rows|incidents|categories|residents|clients|people|points|periods|medications|records|diagnoses|meds|counts|totals|results|rates|communities|gaps)\b/i.test(cleanLabel) ? "were" : "was";
    return `${cleanLabel} ${verb} ${value}.`;
  }
  return `${cleanExecutiveLanguage(trimmed.replace(/\.$/, ""))}.`;
}

export function createStructuredToolResultRenderer({
  formatDateLabel,
  formatNumber,
  normalizeText
}) {
  function hasVisualColumn(result, columnName) {
    return (result?.visual?.columns ?? []).some((column) => normalizeText(column) === normalizeText(columnName));
  }

  function isGroupedCensusPeriodSlice(result) {
    return isCensusPeriodSlice(result) && hasVisualColumn(result, "Community");
  }

  function isCensusPeriodSlice(result) {
    if (!["slice_metric", "slice_discovery"].includes(result?.tool)) return false;
    if (normalizeText(result?.visual?.valueLabel) !== "census") return false;
    return hasVisualColumn(result, "Month") || hasVisualColumn(result, "Week");
  }

  function groupedCensusPeriodFact(result) {
    const unit = hasVisualColumn(result, "Week") ? "week" : "month";
    const rowCount = result?.trace?.rowCount ?? result?.visual?.originalRowCount ?? result?.visual?.rows?.length ?? 0;
    return `The table keeps ${unit} and community separate across ${formatNumber(rowCount)} point-in-time census value${Number(rowCount) === 1 ? "" : "s"}.`;
  }

  function getAnswerDefinition(contract, result) {
    if (result?.safeRefusal || result?.truthState === "not_loaded" || result?.truthState === "plan_rejected") return null;
    const valueLabel = String(result?.visual?.valueLabel ?? "").toLowerCase();

    if (contract.id === "count") {
      const grainDefinition = getMetricGrainDefinitionForResult(result);
      if (grainDefinition) return grainDefinition.definition;
      if (/incident|row/i.test(valueLabel) || result?.tool === "incident_breakdown") return "This count is incident events unless the question asks for people/residents.";
    }

    if (contract.id === "comparison") {
      return "The comparison uses the available periods shown; partial current months are not projected unless stated.";
    }

    if (contract.id === "detail_list") {
      if (result?.tool === "resident_search") return null;
      const artifactRows = result?.artifact?.rowCount;
      const visualRows = result?.visual?.rows?.length ?? 0;
      const originalRows = result?.visual?.originalRowCount ?? visualRows;
      if (artifactRows != null && (originalRows > visualRows || artifactRows > visualRows)) {
        return `The CSV includes all ${formatNumber(artifactRows)} exact matches.`;
      }
      return artifactRows != null
        ? `The CSV includes all ${formatNumber(artifactRows)} exact matches.`
        : "The result includes every match.";
    }

    if (contract.id === "trend") {
      return "Trend points use available monthly records in chronological order.";
    }

    if (contract.id === "resident_flow") {
      return null;
    }

    if (contract.id === "medication") {
      if (result?.tool === "medication_profile") return null;
      if (result?.tool === "medication_exception_detail") {
        return "MAR exception detail includes refusal, not-given, late, held, and PRN-related records when those records are available.";
      }
      if (result?.tool === "medication_orders_current") return null;
      if (result?.tool === "medication_refusals_by_community") {
        return null;
      }
      return "Medication compliance uses scheduled administrations as the denominator when MAR data is available.";
    }

    if (contract.id === "availability") {
      if (["module_catalog", "surface_module", "tool_context_catalog"].includes(result?.tool)) return null;
      if (/incident freshness/i.test(String(result?.visual?.title ?? ""))) {
        return "Coverage details include the most recent incident date, lag to today, and the most recent monthly incident totals.";
      }
      return "Coverage details include available datasets, date ranges, and the most recent available dates.";
    }

    if (contract.id === "composition") {
      if (result?.tool === "incident_breakdown") {
        return getMetricGrainDefinitionForResult(result)?.definition ?? "This count is incident events unless the question asks for people/residents.";
      }
      return "Composition answers summarize available records in the selected scope.";
    }

    return null;
  }

  function formatTraceNoteForAnswer(note) {
    return String(note ?? "")
      .replace(/latestIncidentDate=(20\d{2}-\d{2}-\d{2})(?:T[0-9:.]+Z)?/g, (_match, date) => `latest incident date: ${formatDateLabel(date)}`)
      .replace(/today=(20\d{2}-\d{2}-\d{2})/g, (_match, date) => `today: ${formatDateLabel(date)}`)
      .replace(/\bmetricGrain=distinct_residents\b/g, "grain: unique residents")
      .replace(/\bmetricGrain=incident_events\b/g, "grain: incident events")
      .replace(/\bcategory=/g, "category: ")
      .replace(/_/g, " ")
      .replace(/;/g, "; ")
      .replace(/\s{2,}/g, " ")
      .trim();
  }

  function buildStructuredToolResult({ contract, content = "", result, takeaway }) {
    const originalLines = String(result?.text ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const answer = cleanReadableSentence(String(takeaway ?? "").trim().replace(/^answer\s+/i, ""));
    let facts = [];

    for (const line of originalLines) {
      if (line === answer) continue;
      if (isToolTitleLine(line, result, normalizeText)) continue;
      const fact = normalizeFactSentence(line, normalizeText);
      if (!fact) continue;
      if (isInterfaceStageDirection(fact)) continue;
      if (normalizeText(fact) === normalizeText(answer)) continue;
      if (!facts.includes(fact)) facts.push(fact);
      if (facts.length >= contract.maxFacts) break;
    }

    if (isCensusPeriodSlice(result)) {
      facts = facts.filter((fact) =>
        !/^Top result\b/i.test(fact) &&
        !/\btop result\b/i.test(fact) &&
        !/^Slice was\b/i.test(fact) &&
        !/^Monthly census values are shown as point-in-time counts/i.test(fact)
      );
      if (isGroupedCensusPeriodSlice(result)) {
        facts.unshift(groupedCensusPeriodFact(result));
      } else if (!facts.some((fact) => /point-in-time census/i.test(fact))) {
        facts.unshift("Monthly census values are point-in-time counts.");
      }
      facts = facts.slice(0, contract.maxFacts);
    }

    if (contract.id === "trend") {
      facts = facts.filter((fact) => !/^Leading results\b/i.test(fact) && !/^By month\.$/i.test(fact));
      if (facts.length === 0 && result?.visual?.rows?.length) {
        facts.push(`${formatNumber(result.visual.rows.length)} monthly point${result.visual.rows.length === 1 ? " is" : "s are"} shown in chronological order.`);
      }
    }

    if (result?.tool === "top_incident_category_by_community") {
      facts = facts.filter((fact) => !/\btop categories\b/i.test(fact));
    }

    if (result?.tool === "census_movement") {
      facts = facts.filter((fact) => !/^Largest community moves?\b/i.test(fact));
    }

    if (result?.tool === "census_drop_history") {
      facts = facts.filter((fact) => !/^Census drop history\b/i.test(fact) && !/^Drops found\b/i.test(fact));
    }

    if (result?.tool === "resident_risk_summary") {
      facts = facts.filter((fact) => !/^Top residents\b/i.test(fact));
    }

    if (["resident_lookup", "resident_incident_history", "resident_search", "resident_risk_summary", "diagnosis_mix", "length_of_stay_mix", "incident_resident_drivers"].includes(result?.tool)) {
      facts = [];
    }

    if (result?.tool === "community_compare") {
      facts = facts.filter((fact) => !/^Largest census movement\b/i.test(fact));
    }

    if (result?.tool === "community_profile") {
      facts = facts.filter((fact) => !/^(?:Active roster|Reporting census|Census movement|Incidents|Average age)\b/i.test(fact));
    }

    if (result?.tool === "community_history") {
      // The formatted lead already gives the monthly operating story. The raw
      // tool narrative repeats it with source-language phrasing.
      facts = [];
    }

    if (result?.tool === "incident_detail_list") {
      facts = facts.filter((fact) => !/^Monthly incident counts\b/i.test(fact));
    }

    if (result?.tool === "resident_flow_weekly") {
      facts = facts.filter((fact) => !/^Discharges are not populated\b/i.test(fact));
    }

    if (["medication_refusals_by_community", "operating_snapshot"].includes(result?.tool)) {
      facts = [];
    }

    // Direct count routes already present the requested measure in the lead and
    // KPI card. Rankings or repeated movement facts distract from that answer.
    if (contract.id === "count" && ["incident_breakdown", "census_trend"].includes(result?.tool)) {
      facts = [];
    }

    if (result?.tool === "medication_profile") {
      facts = facts.filter((fact) => !/^The published given and not-given totals\b/i.test(fact));
      if (result?.summary?.refusalCoverage === "legacy_cumulative") {
        facts = ["Monthly refusal counts are not available for this period."];
      }
    }

    if (result?.tool === "module_catalog") {
      facts = facts.filter((fact) => !/^Available platform modules\b/i.test(fact));
    }

    if (result?.tool === "tool_context_catalog") {
      facts = [];
    }

    if (result?.tool === "census_trend" && contract.id === "trend") {
      facts = [];
    }

    if (result?.tool === "community_time_series") {
      facts = [];
    }

    if (result?.tool === "incident_rate") {
      facts = [];
    }

    facts = facts.filter((fact) => !/^Period was\b/i.test(fact));

    if (result?.safeRefusal) {
      facts = [];
    }

    if (facts.length === 0 && !result?.safeRefusal) {
      const truthState = String(result?.truthState ?? result?.trace?.truthState ?? "").trim();
      if (result?.tool === "medication_watch" && truthState === "not_loaded") {
        facts.push("Medication watch requires resident-level MAR summary data in the active snapshot.");
      } else if (truthState === "not_loaded" && !/\b(no substitute data|did not run a replacement|no replacement query)\b/i.test(answer)) {
        facts.push("The requested slice is unavailable in the active snapshot. No substitute data was used.");
      } else if (truthState === "plan_rejected") {
        facts.push("The tool result did not match the requested scope, so the platform stopped before showing a potentially wrong answer.");
      } else if (truthState === "summary_not_shown") {
        facts.push("The available summary does not contain this exact detail, so no value was inferred.");
      }
    }

    if (["medication_exception_detail", "medication_orders_current", "medication_watch"].includes(result?.tool) &&
        String(result?.truthState ?? result?.trace?.truthState ?? "") === "not_loaded") {
      facts = [];
    }

    const definition = getAnswerDefinition(contract, result);
    if (
      definition &&
      ["availability", "detail_list", "medication"].includes(contract.id) &&
      facts.length < contract.maxFacts &&
      !facts.some((fact) => /csv export preserves all/i.test(fact)) &&
      !facts.some((fact) => normalizeText(fact) === normalizeText(definition))
    ) {
      facts.push(definition);
    }

    facts = facts.filter((fact) => !isFactCoveredByAnswer(fact, answer));

    const rowsChecked = [];
    const rowCount = result?.trace?.rowCount;
    if (rowCount != null && (contract.requiredSource || rowCount > 0)) {
      const sourceLabel = result?.trace?.dataSource ? String(result.trace.dataSource) : "loaded rows";
      rowsChecked.push(`I checked ${formatNumber(rowCount)} ${sourceLabel}${result?.trace?.period ? ` for ${result.trace.period}` : ""}.`);
    }
    if (result?.trace?.note && !/certified cache hit/i.test(String(result.trace.note))) {
      const note = formatTraceNoteForAnswer(result.trace.note);
      if (note) rowsChecked.push(note);
    }

    return {
      answer,
      content,
      contractId: contract.id,
      definition,
      facts,
      rowsChecked,
      warnings: []
    };
  }

  function formatStructuredToolResult(structured) {
    const answer = cleanReadableSentence(structured.answer);
    const facts = structured.facts
      .map((fact) => String(fact ?? "").trim())
      .filter(Boolean)
      .map((fact) => cleanReadableSentence(fact).replace(/\.+$/, ""))
      .map((fact) => `- ${fact}.`);

    return [
      answer,
      facts.length ? "" : null,
      ...facts
    ].filter(Boolean).join("\n");
  }

  function buildReadableAnswerText(takeaway, result, content = "", contract) {
    return formatStructuredToolResult(buildStructuredToolResult({ contract, content, result, takeaway }));
  }

  return Object.freeze({
    buildReadableAnswerText,
    buildStructuredToolResult,
    formatStructuredToolResult
  });
}

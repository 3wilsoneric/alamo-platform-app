import { parseRequestedMonthBuckets } from "./period-utils.mjs";
import { inferIncidentCountGrain } from "./metric-definitions.mjs";
import { isSliceDiscoveryIntent } from "./analysis-slice-catalog.mjs";

/** @type {ReadonlyArray<readonly [string, RegExp]>} */
const FIELD_PATTERNS = [
  ["resident", /\b(resident|client)(?:\s+name)?\b|\bname\b/],
  ["date", /\b(date|dated|when)\b/],
  ["type", /\b(type|incident type)\b/],
  ["description", /\b(descriptions?|narratives?)\b/],
  ["reason", /\b(reasons?|why|note|notes)\b/],
  ["community", /\b(community|facility)\b/],
  ["unit", /\b(unit|room)\b/]
];

function normalize(value) {
  return String(value ?? "").toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9'\s/-]/g, " ").replace(/\s+/g, " ").trim();
}

function isAdmissionIntent(text) {
  return /\b(admissions?|admitted|admits?|admit|intakes?|move[\s-]?ins?|move[\s-]?in|new residents?|new clients?)\b/.test(text);
}

function isResidentFlowIntent(text) {
  const intakeLanguage = /\b(admissions?|admitted|admits?|admit|intakes?|move[\s-]?ins?|move[\s-]?in|new residents?|new clients?)\b/.test(text);
  const dischargeLanguage = /\b(dischar(?:ge|ged|ges|ging)?|dischare|move[\s-]?outs?|move[\s-]?out|exits?|terminations?)\b/.test(text);
  const flowLanguage = /\b(flow|movement|throughput|turnover|week by week|weekly|by week)\b/.test(text);
  return (intakeLanguage && dischargeLanguage) || (flowLanguage && (intakeLanguage || dischargeLanguage));
}

function isCensusQualityIntent(text) {
  return /\b(census data quality|census quality|census audit|countability|counting fake|fake patients?|fake residents?|test patients?|test residents?|placeholder patients?|placeholder residents?|excluded patients?|excluded residents?|bad census)\b/.test(text) ||
    /\bnon[\s-]?countable\b/.test(text);
}

function isResidentCountabilityAuditIntent(text) {
  return /\b(resident countability|countability audit|fake patients?|fake residents?|test patients?|test residents?|placeholder patients?|placeholder residents?|excluded patients?|excluded residents?)\b/.test(text) ||
    /\bnon[\s-]?countable\b/.test(text);
}

function isWeeklyCensusIntent(text) {
  return /\b(weekly census|census by week|week by week census|weekly headcount|weekly residents?|weekly clients?)\b/.test(text);
}

function isMonthlyResidentFlowIntent(text) {
  return /\b(monthly|by month|month by month)\b/.test(text) &&
    /\b(admissions?|admitted|admits?|admit|intakes?|move[\s-]?ins?|move[\s-]?in|dischar(?:ge|ged|ges|ging)?|dischare|move[\s-]?outs?|move[\s-]?out|resident flow|throughput|turnover)\b/.test(text);
}

function isRosterBrowseIntent(text) {
  if (/\b(incident|incidents|awol|elopement|medication|medications|meds|emar|mar|refusal|refusals|documentation|doc gap|note gap)\b/.test(text)) {
    return false;
  }
  if (/\b(profile|who is|tell me about|pull up|demographic|demographics|age mix|age distribution|diagnosis mix|clinical mix|los mix|length of stay)\b/.test(text)) {
    return false;
  }
  if (/\b(how many|count|total|number of)\b/.test(text) && /\b(month|monthly|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december|20\d{2})\b/.test(text)) {
    return false;
  }
  if (/\b(change|changes|changed|movement|delta|deltas|month over month)\b/.test(text)) return false;
  return /\b(census search|search census|resident search|search residents|search clients|resident roster|client roster|resident directory|client directory|full roster|complete roster|current roster|everyone on census|who is on census)\b/.test(text) ||
    /\b(list|show|give me|pull|display|browse|find|search)\b.*\b(residents?|clients?|people|persons|roster)\b/.test(text) ||
    /\b(residents?|clients?|people|persons)\b.*\b(list|roster|directory|search|slice|filter|browse)\b/.test(text);
}

function isIncidentResidentDriverIntent(text) {
  if (/\b(category|categories|type|types)\b/.test(text) && /\b(community|communities|facility|facilities)\b/.test(text)) {
    return false;
  }
  return /\b(incident|incidents|awol|elopement)\b/.test(text) &&
    (
      /\b(driv(?:e|es|ing|er|ers)|account(?:s|ed)? for|top residents?|top clients?|most frequent|repeat residents?|repeat clients?|high frequency|highest volume)\b/.test(text) ||
      /\b(who|which|what)\b.*\b(resident|residents|client|clients|person|people)\b.*\b(most|highest|top)\b/.test(text) ||
      /\b(who|which|what)\b.*\b(most|highest|top)\b.*\b(incident|incidents|awol|elopement)\b/.test(text) ||
      /\b(resident|residents|client|clients|person|people)\b.*\b(most|highest|top)\b.*\b(incident|incidents|awol|elopement)\b/.test(text)
    );
}

function isResidentDriverFollowUpIntent(text) {
  return text === "who" ||
    /\b(who|which|what)\b.*\b(resident|residents|client|clients|person|people)\b.*\b(most|highest|top)\b/.test(text) ||
    /\b(who|which|what)\b.*\b(most|highest|top)\b.*\b(resident|residents|client|clients|person|people)\b/.test(text);
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function findFacility(text, facilities = []) {
  return [...facilities]
    .flatMap((facility) => {
      const name = String(facility.community_name ?? facility.communityName ?? facility.name ?? "");
      const aliases = [name];
      if (/san pablo/i.test(name)) aliases.push("san pablo", "pablo");
      if (/santa clarita/i.test(name)) aliases.push("santa clarita", "clarita");
      if (/wallace/i.test(name)) aliases.push("jc wallace", "wallace");
      if (/turlock/i.test(name)) aliases.push("turlock");
      if (/victoria/i.test(name)) aliases.push("victoria's house", "victorias house", "victoria house", "victoria");
      return aliases.map((alias) => ({ facility, alias: normalize(alias) }));
    })
    .filter(({ alias }) => alias && text.includes(alias))
    .sort((left, right) => right.alias.length - left.alias.length)[0]?.facility ?? null;
}

function findResidentName(text, residents = []) {
  return [...residents]
    .map((resident) => ({
      resident,
      name: String(resident.resident_name ?? resident.client_name ?? `${resident.first_name ?? ""} ${resident.last_name ?? ""}`).trim(),
      id: String(resident.res_number ?? resident.resident_id ?? resident.client_id ?? "").trim()
    }))
    .filter(({ name, id }) => (name && text.includes(normalize(name))) || (id && text.includes(normalize(id))))
    .sort((left, right) => right.name.length - left.name.length)[0]?.name ?? null;
}

function parseMetric(text) {
  if (isCensusQualityIntent(text) || isWeeklyCensusIntent(text)) return "census";
  if (/\bcompare\b/.test(text) && !/\b(trends?|history|historical|over time|time series|movement|mover|movers)\b/.test(text) && /\bcommunities|community\b/.test(text) && /\b(census|occupancy|headcount|incident|incidents|los|length of stay|average los)\b/.test(text)) return "community";
  if (/\b(incident|incidents|awol|elopement|fall|police|sentinel)\b/.test(text)) return "incidents";
  if (/\b(medication refusal|medical emergency|substance use|aggressive behavior|mental health crisis)\b/.test(text) && /\b(breakdown|break down|category|categories|count|counts|how many|by community|by facility)\b/.test(text)) return "incidents";
  if (/\b(category|categories)\b/.test(text) && /\b(change|changed|changes|compare|comparison|vs|versus|top|leading|largest)\b/.test(text)) return "incidents";
  if (isRosterBrowseIntent(text)) return "residents";
  if (/\b(how many|count|total|number of)\b/.test(text) && /\b(residents?|clients?|people)\b/.test(text) && /\b(at|in|for)\b/.test(text) && /\b(20\d{2}|last month|prior month|previous month|current month|this month|january|jan|frebruary|febuary|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|novemeber|november|nov|december|dec)\b/.test(text)) return "census";
  if (/\b(resident|residents)\b/.test(text) && /\b(added|add|gain|gained|most|movement|mover|change|changes|changed)\b/.test(text) && !/\bprofile\b/.test(text)) return "census";
  if (/\b(census|occupancy|headcount|population|resident[- ]count)\b/.test(text)) return "census";
  if (isAdmissionIntent(text) || isResidentFlowIntent(text)) return "residents";
  if (/\b(services? provided|service archive|scheduled service|billable service|service units|provided to clients)\b/.test(text)) return "services";
  if (/\b(assessment|assessments|assessment type|assessment status|assessment score)\b/.test(text)) return "assessments";
  if (/\b(progress notes?|care notes?|resident notes?|documentation notes?|notes? history)\b/.test(text)) return "notes";
  if (/\b(medication|medications|meds|emar|mar|refusal|refusals|refused|not given|missed|held|late|prn|compliance)\b/.test(text)) return "medications";
  if (/\b(documentation|doc gap|note gap|last note)\b/.test(text)) return "documentation";
  if (/\b(diagnosis|diagnoses|clinical mix)\b/.test(text)) return "diagnoses";
  if (/\b(length of stay|los|tenure)\b/.test(text)) return "length_of_stay";
  if (/\b(age|ages|demographic|demographics|oldest|younger|older)\b/.test(text)) return "resident_demographics";
  if (/\b(resident|residents|client|clients|roster)\b/.test(text)) return "residents";
  return null;
}

function parseMetricGrain(text, metric) {
  if (metric !== "incidents") return null;
  return inferIncidentCountGrain(text);
}

function parseCategory(text, categories = []) {
  if (/\b(awol|elopement)\b/.test(text)) return "AWOL/Elopement";
  return [...categories]
    .filter(Boolean)
    .map(String)
    .sort((left, right) => right.length - left.length)
    .find((category) => {
      const normalizedCategory = normalize(category);
      if (normalizedCategory === "other" && /\b(each|one|another) other\b/.test(text)) return false;
      return text.includes(normalizedCategory);
    }) ?? null;
}

export function deriveAnalysisPatch(content, options = {}) {
  const text = normalize(content);
  const facility = findFacility(text, options.facilities ?? []);
  const residentName = findResidentName(text, options.residents ?? []);
  const periods = parseRequestedMonthBuckets(content, options.availableMonths ?? []);
  const residentDriverFollowUpIntent = isResidentDriverFollowUpIntent(text);
  const referential = residentDriverFollowUpIntent ||
    /\b(?:do|run|repeat|show|export|download)\s+(?:that|it|this|those)\b|\bgive me\s+(?:that|it|this|those)\b|\b(?:its|their|his|her|those)\b|\b(?:same|same thing|the same|same analysis|that again|now|instead)\b/.test(text);
  const rawMetric = parseMetric(text);
  const metric = referential && rawMetric === "residents" && (
      residentDriverFollowUpIntent ||
      /\b(rows?|date|dated|when|type|incident type|descriptions?|narratives?|resident name|client name)\b/.test(text)
    )
    ? null
    : rawMetric;
  const metricGrain = parseMetricGrain(text, metric);
  const category = parseCategory(text, options.categories ?? []);
  const fields = FIELD_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(([field]) => field);
  const rosterBrowseIntent = metric === "residents" && isRosterBrowseIntent(text);
  const residentFlowIntent = metric === "residents" && isResidentFlowIntent(text);
  const admissionIntent = metric === "residents" && !residentFlowIntent && isAdmissionIntent(text);
  const censusQualityIntent = metric === "census" && isCensusQualityIntent(text);
  const countabilityAuditIntent = metric === "census" && isResidentCountabilityAuditIntent(text);
  const broadCommunityReset = Boolean(facility) &&
    /\b(how is|how are|how was|how has|has been|how's|what happened|what's happened|what is happening|what's going on|give me the read|read on|looked|look|performance|overview|profile|topline|snapshot|current state|operating picture)\b/.test(text) &&
    !/\b(incident|incidents|census|occupancy|resident|residents|medication|medications|documentation|diagnosis|los|length of stay)\b/.test(text);
  const communityOperatingPrompt = /\b(how did|how was|how has|how is|how's|what changed|what happened|what's happened|what is happening|what's going on|give me the read|read on|doing|status|operating picture|monthly picture)\b/.test(text);
  const historicalCommunityPrompt = Boolean(periods.length) &&
    /\b(how|was|been|doing|happened|happening|going on|read|look|looked|performance|picture|detail|details|overview|profile|history|historical)\b/.test(text);
  const broadCommunityHistoryIntent = Boolean(facility) &&
    !metric &&
    (communityOperatingPrompt || historicalCommunityPrompt) &&
    !/\b(how many|count|total|number of|list|every|all|rows?|export|download|csv)\b/.test(text);
  const standaloneCurrentStateIntent = /\b(profile|overview|topline|snapshot|current state|operating snapshot|operating picture|portfolio picture|community compare|rank communities)\b/.test(text);
  const explicitScopeOnly = !metric &&
    !standaloneCurrentStateIntent &&
    Boolean(periods.length || facility || category || /\b(just totals?|details? only|by community|by category|by month)\b/.test(text));
  const presentation = /\b(heatmap|heat map|matrix)\b/.test(text)
    ? "heatmap"
    : /\b(multi-series|multi series|line chart|trend chart)\b/.test(text)
      ? "multi_series"
      : /\b(table|exact rows|data rows|show rows)\b/.test(text)
        ? "table"
        : null;
  const incidentSearchDetailMode = metric === "incidents" &&
    /\b(search|find)\b/.test(text) &&
    /\b(ever|all|history|detail|details|rows?|resident|residents|client|clients|name|names|date|description|narrative|awol|elopement|refusal|refusals|medical emergency|aggressive behavior|substance use|fall)\b/.test(text);
  const explicitDetailMode = (rosterBrowseIntent || admissionIntent || countabilityAuditIntent || /\b(list|every|row|rows|detail|details|narrative|narratives|description|descriptions)\b/.test(text) || incidentSearchDetailMode || (metric === "incidents" && /\ball\b/.test(text)) || presentation === "table") && Boolean(metric || /\b(rows|clients?)\b/.test(text));
  const explicitTrendMode = /\b(trends?|history|historical|over time|time series|monthly)\b/.test(text);
  const riskIntent = /\b(risk|watch|watchlist|watch list|at risk|who needs attention)\b/.test(text) && /\b(resident|residents|client|clients)\b/.test(text);
  const incidentResidentDriverIntent = isIncidentResidentDriverIntent(text) || residentDriverFollowUpIntent;
  const historicalCensusDropIntent = /\b(drop|drops|decline|declines|decrease|decreases|fell|down)\b/.test(text) && /\b(census|occupancy|headcount|population|resident count)\b/.test(text) && /\b(over the last|history|historical|month over month|monthly|past year|last year|any community)\b/.test(text);
  const censusMovementIntent = !historicalCensusDropIntent && (/\b(movement|mover|movers|change|delta|month over month|mom|decrease this month|drop this month|down this month)\b/.test(text) || /\b(added|gained|lost)\b.*\b(residents?|clients?|people)\b/.test(text)) && /\b(census|occupancy|headcount|population|resident count|residents?|clients?|people)\b/.test(text);
  const communityCompareIntent = !explicitTrendMode && !censusMovementIntent && /\b(compare|rank)\b/.test(text) && /\bcommunities|community\b/.test(text) && /\b(census|occupancy|headcount|incident|incidents|los|length of stay|average los)\b/.test(text);
  const countIntent = /\b(how many|count|total|number of)\b/.test(text);
  const aggregateCountIntent = Boolean(metricGrain) && countIntent && periods.length <= 1;
  const censusCountIntent = metric === "census" && /\b(how many|count|total|number of)\b/.test(text) && /\b(residents?|clients?|people|census|occupancy|headcount|population)\b/.test(text);
  const mode = explicitDetailMode && !riskIntent
      ? "detail"
    : censusMovementIntent
      ? "aggregate"
    : /\b(just totals?|totals? only|count only|aggregate)\b/.test(text) || aggregateCountIntent || censusCountIntent
      ? "aggregate"
    : explicitTrendMode
        ? "trend"
        : /\b(compare|comparison|versus|\bvs\b)\b/.test(text)
          ? "comparison"
          : periods.length >= 2 && metric
            ? "comparison"
          : /\b(profile|who is)\b/.test(text)
            ? "profile"
            : null;
  const grouping = /\b(?:by|of|across) (?:each |all )?(community|communities|facility|facilities)\b|\beach (?:community|facility)\b|\bwhich (?:community|facility)\b/.test(text)
    ? "community"
    : /\bby categor(?:y|ies)\b|\b(?:what|which) categories? (?:changed|change|differed)|\bcategories? (?:changed|change|comparison)\b/.test(text)
      ? "category"
      : /\bby month\b|\bmonthly\b/.test(text)
        ? "month"
        : /\bby resident\b|\bby client\b/.test(text)
        ? "resident"
        : null;
  const portfolioCommunityGroupingIntent = grouping === "community" &&
    !facility &&
    /\b(which|each|all|across|by|among)\s+(?:community|communities|facility|facilities)\b|\b(?:community|facility)\s+(?:added|gained|lost|changed|moved|ranked)\b/.test(text);
  const calculation = /\b(per 100|incident rates?|incidents? per resident|rates? per resident|rate change)\b/.test(text)
    ? "rate"
    : censusQualityIntent
      ? "data_quality"
    : (metric === "incidents" || (referential && !metric)) && incidentResidentDriverIntent
      ? "resident_drivers"
    : communityCompareIntent
      ? "community_compare"
    : residentFlowIntent
      ? "resident_flow"
    : admissionIntent
      ? "admissions"
    : historicalCensusDropIntent
      ? "drops"
    : censusMovementIntent
      ? "movement"
    : riskIntent
      ? "risk"
    : /\b(top|largest|leading)\b/.test(text) && /\bcategory\b/.test(text)
      ? "top_category"
      : /\b(drop|decline|decrease|fell|down)\b/.test(text) && metric === "census"
        ? "drops"
        : null;

  return {
    patch: {
      ...(metric ? { metric } : {}),
      ...(metricGrain ? { metricGrain } : {}),
      ...(category ? { category } : {}),
      ...(/\b(all|any) (?:incident )?categor(?:y|ies)\b|\ball incidents\b/.test(text) ? { category: null } : {}),
      ...(mode ? { mode } : {}),
      ...(periods.length ? { periods } : {}),
      ...(grouping ? { grouping } : {}),
      ...(mode === "aggregate" ? { fields: [] } : fields.length ? { fields: unique(fields) } : {}),
      ...(/\b(export|download|csv|spreadsheet)\b/.test(text) ? { export: true } : {}),
      ...(facility ? {
        facilityId: facility.facility_id ?? facility.facilityId ?? null,
        communityName: facility.community_name ?? facility.communityName ?? facility.name ?? null
      } : {}),
      ...(/\b(portfolio|all communities|all facilities)\b/.test(text) || portfolioCommunityGroupingIntent ? { facilityId: null, communityName: null } : {}),
      ...(residentName ? { residentName } : {}),
      ...(calculation ? { calculation } : {}),
      ...(presentation ? { presentation } : {}),
      sourcePrompt: String(content ?? "").trim()
    },
    inherit: !broadCommunityReset && !broadCommunityHistoryIntent && (referential || explicitScopeOnly || Boolean(presentation && !metric)),
    reset: broadCommunityReset || broadCommunityHistoryIntent,
    referential
  };
}

export function selectToolForFrame(frame, fallbackTool = null) {
  if (frame.export) return "export_csv";
  const sourcePrompt = frame.sourcePrompt ?? "";
  const normalizedPrompt = normalize(sourcePrompt);
  const periods = Array.isArray(frame.periods) ? frame.periods : [];
  const fields = Array.isArray(frame.fields) ? frame.fields : [];
  const explicitlyNamesFrameCategory = Boolean(frame.category) && normalize(frame.category)
    .split(/[\s/-]+/)
    .filter((token) => token.length >= 3)
    .some((token) => new RegExp(`\\b${token}\\b`).test(normalizedPrompt));
  const rateComparisonPrompt = frame.calculation === "rate" &&
    (
      frame.mode === "comparison" ||
      periods.length >= 2 ||
      /\b(compare|comparison|between|from|to|vs|versus|change|delta|increase|decrease|largest|most|moved|movement)\b/i.test(sourcePrompt)
    );
  const communityOperatingHistoryPrompt = frame.facilityId &&
    (
      (
        /\b(census|occupancy|headcount|population|resident count)\b/i.test(sourcePrompt) &&
        /\b(incident|incidents|awol|elopement)\b/i.test(sourcePrompt)
      ) ||
      /\b(full operating picture|full picture|overall|key operating numbers|monthly picture|what was going on|how did .* do overall|how was .* overall)\b/i.test(sourcePrompt)
    ) &&
    !/\b(how many|count|total|number of|list|every|all|rows?|export|download|csv)\b/i.test(sourcePrompt);
  if (communityOperatingHistoryPrompt) return "community_history";
  if (frame.metric === "census" && (frame.calculation === "data_quality" || isCensusQualityIntent(normalizedPrompt) || isWeeklyCensusIntent(normalizedPrompt))) return "slice_discovery";
  if (frame.metric === "residents" && frame.calculation === "resident_flow" && isMonthlyResidentFlowIntent(normalizedPrompt)) return "slice_discovery";
  if (["census", "incidents"].includes(frame.metric) && ["heatmap", "multi_series"].includes(frame.presentation)) return "community_time_series";
  if (frame.metric === "incidents" && frame.mode === "trend" && frame.grouping === "community") return "community_time_series";
  if (frame.metric === "census" && frame.mode === "trend" && frame.grouping === "community") return "community_time_series";
  if (frame.metric === "census" && frame.mode === "trend" && frame.grouping === "month" && periods.length > 2) return "slice_metric";
  if (isSliceDiscoveryIntent(sourcePrompt) && ["incidents", "census", "medications", "residents", "documentation", "services", "assessments", "notes"].includes(frame.metric)) return "slice_discovery";
  if (["services", "assessments", "notes"].includes(frame.metric)) return "slice_discovery";
  if (
    periods.length > 2 &&
    ["incidents", "census", "medications", "documentation", "services", "assessments", "notes"].includes(frame.metric) &&
    (frame.mode === "comparison" || frame.grouping || fields.length || /detail|breakdown|by categor|by community|by resident|by month/i.test(sourcePrompt))
  ) return "slice_discovery";
  const broadCommunityHistoryPrompt = frame.facilityId &&
    !frame.metric &&
    (
      /\b(how did|how was|how has|how is|how's|what changed|what happened|what's happened|what is happening|what's going on|give me the read|read on|doing|status|operating picture|monthly picture)\b/i.test(sourcePrompt) ||
      (periods.length > 0 && /\b(how|was|been|doing|happened|happening|going on|read|look|looked|performance|picture|detail|details|overview|profile|history|historical)\b/i.test(sourcePrompt))
    ) &&
    !/\b(how many|count|total|number of|list|every|all|rows?|export|download|csv)\b/i.test(sourcePrompt);
  if (!frame.metric && frame.facilityId && (periods.length || broadCommunityHistoryPrompt)) return "community_history";
  const medicationExceptionDetailIntent = /\b(exception|exceptions|not given|missed|held|late|prn)\b/i.test(sourcePrompt) ||
    (/\b(refusal|refusals|refused|medication|medications|meds|emar|mar)\b/i.test(sourcePrompt) &&
      /\b(detail|details|list|every|all|rows?|who|resident|residents|client|clients|reason|reasons|recent|last 90)\b/i.test(sourcePrompt) &&
      !/\b(compliance|scheduled)\b/i.test(sourcePrompt));
  const medicationWatchIntent = /\b(medication|medications|meds|emar|mar|refusal|refusals|not given|prn)\b/i.test(sourcePrompt) &&
    /\b(watch|watchlist|watch list|attention|risk|problem|problems|issue|issues|top residents?|top clients?|drivers?|who needs|highest|most)\b/i.test(sourcePrompt) &&
    !/\b(which medication|what medication|what medications|top refused medications|top refused meds|by medication)\b/i.test(sourcePrompt);
  const medicationOrderIntent = /\b(current|active)\b/i.test(sourcePrompt) &&
    /\b(medication|medications|meds|orders?)\b/i.test(sourcePrompt) &&
    !frame.residentName;
  if (frame.metric === "medications" && medicationOrderIntent) return "medication_orders_current";
  if (frame.metric === "medications" && medicationWatchIntent) return "medication_watch";
  if (frame.metric === "medications" && frame.mode === "detail" && medicationExceptionDetailIntent) return "medication_exception_detail";
  if (frame.metric === "residents" && frame.calculation === "risk") return "resident_risk_summary";
  if (frame.metric === "residents" && frame.calculation === "resident_flow") return "resident_flow_weekly";
  if (frame.metric === "residents" && frame.calculation === "admissions") return "detail_list";
  if (
    frame.metric === "residents" &&
    (
      /\b(?:resident|client)\s+roster\s+(?:detail|details)\b/i.test(sourcePrompt) ||
      /\b(?:resident|residents|client|clients|roster)\s+(?:rows?|records?)\b/i.test(sourcePrompt) ||
      /\b(?:export|download|csv)\b/i.test(sourcePrompt)
    )
  ) return "detail_list";
  if (frame.metric === "residents") return frame.mode === "profile" || frame.residentName ? "resident_lookup" : "resident_search";
  if (frame.mode === "detail" && frame.metric !== "incidents") return "detail_list";
  if (frame.calculation === "community_compare") return "community_compare";
  if (frame.metric === "incidents") {
    if (frame.residentName) return "resident_incident_history";
    if (frame.mode === "detail") return "incident_detail_list";
    if (frame.calculation === "resident_drivers") return "incident_resident_drivers";
    if (frame.mode === "aggregate" && frame.category && frame.grouping === "community") return "slice_metric";
    if (frame.mode === "aggregate" && frame.category) return "incident_breakdown";
    if (rateComparisonPrompt) return "incident_rate_change";
    if (frame.calculation === "rate") return "incident_rate";
    if (frame.calculation === "top_category" && frame.grouping === "community") return "top_incident_category_by_community";
    if (frame.mode === "comparison" && /\b(category|categories|breakdown|break down)\b/i.test(frame.sourcePrompt ?? "")) return "incident_category_comparison";
    if (frame.mode === "comparison" && frame.category && explicitlyNamesFrameCategory && /\b(compare|comparison|between|versus|vs|from\b.*\bto)\b/i.test(frame.sourcePrompt ?? "")) return "incident_category_comparison";
    if (frame.mode === "comparison" && frame.category) return "slice_metric";
    if (frame.mode === "comparison" && frame.grouping === "category") return "incident_category_comparison";
    if (frame.mode === "comparison") return "compare_periods";
    if (frame.mode === "trend" && frame.grouping === "community") return "community_time_series";
    if (frame.grouping === "community") return "slice_metric";
    if (frame.mode === "trend" || frame.grouping === "month" || (frame.category && frame.grouping === "community")) return "slice_metric";
    return "incident_breakdown";
  }
  if (frame.metric === "census") {
    if (frame.calculation === "movement") return "census_movement";
    if (frame.calculation === "drops") return "census_drop_history";
    if (frame.mode === "comparison") return "compare_periods";
    if (frame.mode === "trend" && frame.grouping === "community") return "community_time_series";
    if (frame.grouping === "month" && periods.length > 2) return "slice_metric";
    if (frame.grouping === "community" && periods.length <= 1) return "census_movement";
    return "census_trend";
  }
  if (frame.metric === "medications") {
    const prompt = frame.sourcePrompt ?? "";
    if (/\b(current|active)\b/i.test(prompt) && /\b(medication|medications|meds|orders?)\b/i.test(prompt) && !frame.residentName) {
      return "medication_orders_current";
    }
    if (frame.residentName && frame.mode === "profile") return "resident_lookup";
    if (medicationExceptionDetailIntent || /\b(exception|exceptions|not given|missed|held|late|prn)\b/i.test(prompt)) {
      return "medication_exception_detail";
    }
    if (
      frame.mode === "profile" &&
      /\b(profile|picture|overview|summary|how is|how are|how's|doing with medications|doing with meds)\b/i.test(prompt) &&
      !/\b(refusal|refusals|refused|not given|missed|held|late|prn|exception|exceptions|detail|details|list|rows?|compliance trend|compliance by|scheduled by|given by)\b/i.test(prompt)
    ) {
      return "medication_profile";
    }
    if (frame.grouping === "community") {
      return /\b(refusal|refusals|refused|not given|missed)\b/i.test(prompt)
        ? "medication_refusals_by_community"
        : "medication_compliance";
    }
    if (frame.residentName && !/\b(refusal|refusals|refused|not given|missed|held|late|prn|compliance|scheduled)\b/i.test(prompt)) {
      return "resident_lookup";
    }
    if (
      /\b(profile|picture|overview|summary|how is|how are|how's|doing with medications|doing with meds)\b/i.test(prompt) &&
      !/\b(refusal|refusals|refused|not given|missed|held|late|prn|exception|exceptions|detail|details|list|rows?|compliance trend|compliance by|scheduled by|given by)\b/i.test(prompt)
    ) {
      return "medication_profile";
    }
    return /refusal/i.test(prompt) ? "medication_refusals_by_community" : "medication_compliance";
  }
  if (frame.metric === "documentation") return "documentation_gaps";
  if (frame.metric === "diagnoses") return "diagnosis_mix";
  if (frame.metric === "length_of_stay") return "length_of_stay_mix";
  if (frame.metric === "resident_demographics") return "resident_demographics";
  return fallbackTool;
}

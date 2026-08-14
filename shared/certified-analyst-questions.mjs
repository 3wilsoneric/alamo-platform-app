import { parseRequestedMonthBuckets } from "./period-utils.mjs";

const CERTIFIED_QUESTION_VERSION = "2026-07-18";

const COMMUNITY_VARIABLE = {
  id: "community",
  label: "Community",
  placeholder: "Choose community",
  options: [
    { label: "San Pablo", value: "San Pablo" },
    { label: "Santa Clarita", value: "Santa Clarita" },
    { label: "JC Wallace House", value: "JC Wallace House" },
    { label: "Turlock", value: "AHS Turlock OP LLC" },
    { label: "Victoria's House", value: "Victoria's House" }
  ]
};

const MONTH_OPTIONS = [
  { label: "January 2026", value: "January 2026" },
  { label: "February 2026", value: "February 2026" },
  { label: "March 2026", value: "March 2026" },
  { label: "April 2026", value: "April 2026" },
  { label: "May 2026", value: "May 2026" },
  { label: "June 2026", value: "June 2026" },
  { label: "July 2026", value: "July 2026" }
];

const MONTH_VARIABLE = {
  id: "month",
  label: "Month",
  placeholder: "Choose month",
  options: MONTH_OPTIONS
};

const START_MONTH_VARIABLE = {
  id: "startMonth",
  label: "Start month",
  placeholder: "Start month",
  options: MONTH_OPTIONS
};

const END_MONTH_VARIABLE = {
  id: "endMonth",
  label: "End month",
  placeholder: "End month",
  options: MONTH_OPTIONS
};

const INCIDENT_CATEGORY_VARIABLE = {
  id: "incidentCategory",
  label: "Incident category",
  placeholder: "Choose incident type",
  options: [
    { label: "AWOL / Elopement", value: "AWOL/Elopement" },
    { label: "Medication Refusal", value: "Medication Refusal" },
    { label: "Medical Emergency", value: "Medical Emergency" },
    { label: "Aggressive Behavior", value: "Aggressive Behavior" },
    { label: "Substance Use", value: "Substance Use" },
    { label: "Fall", value: "Fall" }
  ]
};

const MEDICATION_DETAIL_VARIABLE = {
  id: "medicationDetail",
  label: "Medication detail",
  placeholder: "Choose detail",
  options: [
    { label: "Medication refusals", value: "medication refusal detail" },
    { label: "Not-given administrations", value: "not-given medication detail" },
    { label: "Late administrations", value: "late medication administrations" },
    { label: "Held medications", value: "held medication detail" },
    { label: "PRN administrations", value: "PRN medication detail" }
  ]
};

function normalize(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9\s/-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function compactKey(value) {
  return normalize(value).replace(/\s+/g, "-") || "portfolio";
}

function formatPeriod(period) {
  return period || "latest";
}

function getScope(frame = {}, fallback = "portfolio") {
  return frame.communityName || frame.residentName || fallback;
}

function hasKnownFacility(text, context = {}) {
  return (context.facilities ?? []).some((facility) => {
    const name = String(facility.community_name ?? facility.communityName ?? facility.name ?? "");
    const aliases = [name];
    if (/san pablo/i.test(name)) aliases.push("san pablo");
    if (/santa clarita/i.test(name)) aliases.push("santa clarita");
    if (/wallace/i.test(name)) aliases.push("jc wallace", "wallace");
    if (/turlock/i.test(name)) aliases.push("turlock");
    if (/victoria/i.test(name)) aliases.push("victoria's house", "victorias house", "victoria");
    return aliases.some((alias) => {
      const normalizedAlias = normalize(alias);
      return normalizedAlias && text.includes(normalizedAlias);
    });
  });
}

function hasKnownResident(text, context = {}) {
  return (context.residents ?? []).some((resident) => {
    const name = String(resident.resident_name ?? resident.client_name ?? `${resident.first_name ?? ""} ${resident.last_name ?? ""}`).trim();
    const normalizedName = normalize(name);
    return normalizedName && text.includes(normalizedName);
  });
}

function hasChangeLanguage(text) {
  return /\b(what changed|what s changed|whats changed|what is different|what was different|what s different|whats different|what moved|what s new|whats new|any change|anything change|changed|changes|updates?)\b/.test(text);
}

function isDataSliceCatalogLanguage(text) {
  return /\b(what data can you use|what data is available to use|what data do you use|what data do you have to use|what can you use|available analytical slices|data slices|tool context|tool context manifest|manifest)\b/.test(text);
}

export const CERTIFIED_ANALYST_QUESTIONS = [
  {
    id: "incident-unique-people-count",
    title: "Incident unique people count",
    description: "Count unique residents involved in an incident category for a period.",
    preferredTool: "incident_breakdown",
    answerStyle: "direct-count-with-grain-definition",
    cacheFamily: "incidents:unique-people-count",
    variables: [INCIDENT_CATEGORY_VARIABLE, MONTH_VARIABLE],
    examples: ["How many residents had {incidentCategory} incidents in {month}?", "How many clients had {incidentCategory} incidents in {month}?", "How many people had {incidentCategory} incidents in {month}?", "What was the unique resident count for {incidentCategory} incidents in {month}?", "How many clients went through {incidentCategory} incidents in {month}?"],
    match: (text) => /\b(how many|count|total|number of)\b/.test(text) &&
      /\b(people|person|residents?|clients?)\b/.test(text) &&
      /\b(awol|elopement|incident|incidents|fall|refusal|medical emergency|aggressive behavior|substance use)\b/.test(text) &&
      !/\b(list|every|all|detail|details|rows?|description|descriptions|names?|who)\b/.test(text)
  },
  {
    id: "incident-event-count",
    title: "Incident event count",
    description: "Count incident rows/events for a category, community, and period.",
    preferredTool: "incident_breakdown",
    answerStyle: "direct-count-with-grain-definition",
    cacheFamily: "incidents:event-count",
    variables: [COMMUNITY_VARIABLE, INCIDENT_CATEGORY_VARIABLE, MONTH_VARIABLE],
    examples: ["How many {incidentCategory} incidents were there in {month}?", "How many {incidentCategory} incidents did {community} have in {month}?", "How many {incidentCategory} events were there in {month}?", "What was the {incidentCategory} incident total for {community} in {month}?", "How many {incidentCategory} incident events were logged in {month}?"],
    match: (text) => /\b(how many|count|total|number of)\b/.test(text) &&
      /\b(incident|incidents|events?|rows?|awol|elopement|fall|refusal|medical emergency|aggressive behavior|substance use)\b/.test(text) &&
      !/\b(people|person|residents?|clients?)\b/.test(text) &&
      !/\b(list|every|all|detail|details|description|descriptions|names?|who)\b/.test(text)
  },
  {
    id: "census-point-count",
    title: "Census point count",
    description: "Answer a point-in-time resident/client census count for a community or portfolio month.",
    preferredTool: "census_trend",
    answerStyle: "direct-count-with-period-and-scope",
    cacheFamily: "census:point-count",
    variables: [COMMUNITY_VARIABLE, MONTH_VARIABLE],
    examples: ["How many clients were at {community} in {month}?", "How many residents were at {community} in {month}?", "What was {community}'s resident count in {month}?", "What was the census at {community} in {month}?", "What was {community}'s headcount in {month}?"],
    match: (text) => /\b(how many|count|total|number of|what was|what is|clients?|residents?)\b/.test(text) &&
      /\b(client|clients|resident|residents|census|population|headcount|occupancy)\b/.test(text) &&
      /\b(at|in|for)\b/.test(text) &&
      /\b(jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december|20\d{2})\b/.test(text) &&
      !/\b(incident|incidents|awol|elopement|medication|meds|emar|refusal|refusals)\b/.test(text)
  },
  {
    id: "community-month-status",
    title: "Community operating picture",
    description: "Monthly community operating detail with census, incidents, categories, and medication compliance.",
    preferredTool: "community_history",
    answerStyle: "community-month-brief",
    cacheFamily: "community:month-status",
    variables: [COMMUNITY_VARIABLE, MONTH_VARIABLE],
    examples: [
      "How is {community} doing?",
      "How is {community}?",
      "Show {community}'s census, incidents, and medication picture for {month}.",
      "How did {community} do overall in {month}? Include census and incidents.",
      "Show the last three months for {community}, including census and incidents."
    ],
    match: (text, context = {}) => {
      if (!hasKnownFacility(text, context)) return false;
      const broadStatus = /\b(how did|how was|how has|how is|how s|whats going on|what s going on|what was going on|what happened|operating picture|monthly picture|full operating picture|full picture|overall|key operating numbers|status)\b/.test(text);
      const broadBundle = /\b(census|occupancy|headcount|population|resident count)\b/.test(text) &&
        /\b(incident|incidents|awol|elopement)\b/.test(text);
      const singleMetricOnly = /\b(medication|medications|meds|emar|mar|refusal|refusals|compliance)\b/.test(text) &&
        !broadBundle &&
        !/\b(full operating picture|full picture|overall|key operating numbers)\b/.test(text);
      return (broadStatus || broadBundle) &&
        !singleMetricOnly &&
        !/\b(how many|count|total|number of|list|every|all|detail|details|rows?|export|download|csv)\b/.test(text);
    }
  },
  {
    id: "incident-freshness-troubleshoot",
    title: "Incident freshness troubleshoot",
    description: "Explain why today/latest incidents may not appear, using loaded detail date and snapshot time.",
    preferredTool: "data_availability",
    answerStyle: "freshness-diagnostic",
    cacheFamily: "data:incident-freshness",
    examples: ["Why are today's incidents not showing?", "Why is the Incident Center empty?", "Are incidents current today?", "Is the incident feed behind?", "Why does the Incident Center show zero today?"],
    match: (text) => /\b(incident|incidents)\b/.test(text) &&
      (
        /\b(today|yesterday|daily|weekly|this week|last day|fresh|freshness|show up|missing|not showing|not there|stale|updated|received|current today|load|loaded|available|behind|delayed|delay|synced|sync|last updated|come in|came in|new incidents?|source feed|incident feed|feed|empty|zero)\b/.test(text) ||
        /\b(are|is|how|why|when|did|do)\b.*\b(current|load|loaded|received|updated|behind|delayed|synced|available|empty|zero)\b/.test(text)
      ) &&
      !/\b(latest incident date|what periods|what data|data availability|data is loaded|data loaded|rows loaded|coverage window)\b/.test(text) &&
      !/\b(list|every|all|detail|details|rows?|description|descriptions|names?|who)\b/.test(text)
  },
  {
    id: "incident-current-snapshot",
    title: "Current incident snapshot",
    description: "Current incident volume, top categories, and frequent residents.",
    preferredTool: "incident_breakdown",
    answerStyle: "direct-summary-plus-ranked-breakdown",
    cacheFamily: "incidents:snapshot",
    examples: [
      "Show the current incident snapshot for this month.",
      "Summarize current incident volume for this month.",
      "Show this month's incident picture across the portfolio.",
      "Show the latest incident snapshot.",
      "Give me the current incident summary."
    ],
    match: (text, context = {}) => /\bincidents?\b/.test(text) &&
      (context.analysisFrame?.periods?.length ?? 0) <= 1 &&
      !/\b(compare|comparison|rank|ranking|which community|communities|vs|versus|list|every|all|detail|rates?|per 100|trends?|history|by month|by category|by community|by facility|involved|names?|who)\b/.test(text)
  },
  {
    id: "incident-detail-list",
    title: "Incident detail list",
    description: "Exact incident rows with resident, date, category, and description.",
    preferredTool: "incident_detail_list",
    answerStyle: "exact-row-list",
    cacheFamily: "incidents:detail-list",
    variables: [COMMUNITY_VARIABLE, INCIDENT_CATEGORY_VARIABLE, MONTH_VARIABLE, START_MONTH_VARIABLE, END_MONTH_VARIABLE],
    examples: ["Can you list every {incidentCategory} incident from {startMonth} through {endMonth}?", "Can you show {community} incident detail for {month}?", "Can you show {incidentCategory} incident descriptions for {month}?", "Who was involved in {incidentCategory} incidents in {month}?", "Can you show all {incidentCategory} incidents with names and descriptions for {month}?"],
    match: (text) => /\b(incident|incidents|awol|elopement)\b/.test(text) &&
      (/\b(list|every|all|detail|details|rows|description|descriptions|involved|names?)\b/.test(text) ||
        /\bwho\s+(was|were|is|are)\s+(involved|named|listed)\b/.test(text))
  },
  {
    id: "incident-row-export",
    title: "Export exact incident detail",
    description: "Export the same filtered incident detail used in the answer.",
    preferredTool: "export_csv",
    answerStyle: "csv-export",
    cacheFamily: "incidents:export",
    variables: [COMMUNITY_VARIABLE, INCIDENT_CATEGORY_VARIABLE, MONTH_VARIABLE],
    examples: ["Can you export this incident detail to CSV?", "Can you download {community} incident detail for {month}?", "Can you export {incidentCategory} incident detail to CSV?", "Can you create a CSV for {incidentCategory} incidents in {month}?"],
    match: (text) => /\b(export|download|csv|spreadsheet)\b/.test(text) && /\b(incident|incidents|awol|elopement|refusal|rows?)\b/.test(text)
  },
  {
    id: "generic-detail-list",
    title: "Exact data detail list",
    description: "Exact loaded detail for census, residents, medications, refusals, or documentation.",
    preferredTool: "detail_list",
    answerStyle: "exact-row-list",
    cacheFamily: "data:detail-list",
    variables: [MONTH_VARIABLE],
    examples: ["Can you list all census records for {month}?", "Can you show every medication compliance record?", "Can you list the documentation gap detail?", "Can you show the resident roster detail?", "Can you show every census detail record?"],
    match: (text) => /\b(list|every|detail|rows?)\b/.test(text) &&
      /\b(census|occupancy|residents?|roster|medication|meds|emar|compliance|refusals?|documentation|doc gap|note gap)\b/.test(text) &&
      !/\b(incident|incidents|awol|elopement|risk|watchlist|watch list|attention|needs attention)\b/.test(text) &&
      !/\b(dischar(?:ge|ged|ges|ging)?|dischare|move[\s-]?outs?|move[\s-]?out|exits?|terminations?)\b/.test(text)
  },
  {
    id: "resident-flow-weekly",
    title: "Weekly resident flow",
    description: "Week-by-week intake/admission and discharge/move-out breakdown by community.",
    preferredTool: "resident_flow_weekly",
    answerStyle: "weekly-flow-table-with-data-limit",
    cacheFamily: "residents:weekly-flow",
    variables: [COMMUNITY_VARIABLE],
    examples: ["What was weekly intake and discharge by community?", "Can you show a week-by-week breakdown of admissions and discharges?", "Can you show move-ins and move-outs by week?", "Can you show weekly intake and discharge for {community}?", "How many admissions and discharges happened each week at {community}?"],
    match: (text) => {
      const intakeLanguage = /\b(admissions?|admitted|admits?|admit|intakes?|move[\s-]?ins?|move[\s-]?in|new residents?|new clients?)\b/.test(text);
      const dischargeLanguage = /\b(dischar(?:ge|ged|ges|ging)?|dischare|move[\s-]?outs?|move[\s-]?out|exits?|terminations?)\b/.test(text);
      const flowLanguage = /\b(flow|movement|throughput|turnover|week by week|weekly|by week)\b/.test(text);
      return (intakeLanguage && dischargeLanguage) || (flowLanguage && (intakeLanguage || dischargeLanguage));
    }
  },
  {
    id: "data-availability",
    title: "Loaded data availability",
    description: "Show actual row counts and date coverage available to deterministic tools.",
    preferredTool: "data_availability",
    answerStyle: "availability-table",
    cacheFamily: "data:availability",
    examples: ["Can you show data availability?", "What is the latest incident date loaded?", "How current is the data?", "What census periods are loaded?", "What documentation data is available?"],
    match: (text) => !isDataSliceCatalogLanguage(text) && (
      /\b(data availability|data freshness|latest loaded|latest incident date|how current|how fresh|what periods are loaded|what data periods are available|available data periods|coverage window)\b/.test(text) ||
      /\b(snapshot|platform|data|incident|incidents|resident|residents|client|clients|roster|census|documentation|medication|meds)\b.*\b(stale|fresh|refresh|refreshed|last refresh|last updated|loaded|available|coverage)\b/.test(text) ||
      /\b(when|what time)\b.*\b(platform|snapshot|data|incident|incidents)\b.*\b(refresh|refreshed|updated|loaded)\b/.test(text) ||
      /\b(do we have|can you answer|is there|are there)\b.*\b(incident|incidents|census|resident|residents|client|clients|roster|documentation|medication|meds)\b.*\b(data|rows?|detail|coverage|loaded|available)\b/.test(text) ||
      /\bwhat\b.*\b(census|resident|residents|client|clients|roster|documentation|doc gap|doc gaps|medication|meds|compliance|refusal|refusals)\b.*\b(data|rows?|periods?|coverage)\b.*\b(loaded|available)\b/.test(text) ||
      /\b(census|resident|residents|client|clients|roster|documentation|doc gap|doc gaps|medication|meds|compliance|refusal|refusals)\b.*\b(data|rows?|periods?|coverage)\b.*\b(loaded|available)\b/.test(text)
    )
  },
  {
    id: "module-catalog",
    title: "Module catalog",
    description: "Show available deterministic platform surfaces and analytical modules.",
    preferredTool: "module_catalog",
    answerStyle: "catalog-table",
    cacheFamily: "catalog:modules",
    examples: ["What modules can I open?", "Can you show available modules?", "Can you list modules?", "What is in the module registry?"],
    match: (text) => /\b(available modules|module catalog|module registry|what modules|list modules|show modules)\b/.test(text)
  },
  {
    id: "module-surface",
    title: "Platform module surface",
    description: "Open a registered platform surface inside the thread.",
    preferredTool: "surface_module",
    answerStyle: "surface-open",
    cacheFamily: "catalog:surface",
    variables: [COMMUNITY_VARIABLE],
    examples: [
      "Can you open the Incident Center module?",
      "Can you show me the Resident Search module?",
      "Can you show the {community} census module?",
      "Can you show the {community} incidents module?",
      "Can you open the Communities Overview?"
    ],
    match: (text) => (
      /\b(incident center|command center|glossary|communities overview|data dictionary)\b/.test(text) ||
      /\b(show|open|surface|bring up|take me to|launch)\b.*\b(definitions|data dictionary)\b/.test(text) ||
      /\b(open|surface|bring up|take me to|launch)\b.*\b(community trend|community trends)\b/.test(text) ||
      /\b(resident search|search census|resident directory)\b/.test(text) && !/\b(for|named|called|matching)\b/.test(text) ||
      /\b(open|show|surface|bring up|take me to|launch|get|give me)\b/.test(text) &&
        /\b(module|screen|page|view|workspace|center|glossary)\b/.test(text)
    ) &&
      !/\b(available modules|module catalog|module registry|what modules|list modules|show modules)\b/.test(text) &&
      !(/\b(incident|incidents|incident center)\b/.test(text) && /\b(why|empty|zero|missing|not showing|showing up|behind|delayed|delay|synced|sync|current today|load|loaded|received|updated|today)\b/.test(text))
  },
  {
    id: "incident-category-breakdown",
    title: "Incident category breakdown",
    description: "Incident counts by category for a community or portfolio period.",
    preferredTool: "incident_breakdown",
    answerStyle: "direct-summary-plus-ranked-breakdown",
    cacheFamily: "incidents:category-breakdown",
    variables: [COMMUNITY_VARIABLE, MONTH_VARIABLE],
    examples: ["What are {community} incidents by category for {month}?", "What is the incident category breakdown for {community} in {month}?", "Can you break down {community} incident categories for {month}?", "What were {community} incident categories in {month}?", "What are the incident categories for {community} in {month}?"],
    match: (text) => /\b(incident|incidents|awol|elopement|fall|police|substance|medical emergency|medication refusal)\b/.test(text) && /\b(category|categories|breakdown|break down|type|types)\b/.test(text)
  },
  {
    id: "incident-top-category-by-community",
    title: "Top incident category by community",
    description: "For each community and period, show the leading incident category.",
    preferredTool: "top_incident_category_by_community",
    answerStyle: "community-top-category-table",
    cacheFamily: "incidents:top-category-by-community",
    variables: [MONTH_VARIABLE, START_MONTH_VARIABLE, END_MONTH_VARIABLE],
    examples: ["What is the top incident category for each community?", "What was the top incident category for each community from {startMonth} through {endMonth}?", "What is the leading incident category by community in {month}?", "What is the largest incident category for each community in {month}?"],
    match: (text) => /\b(top|leading|largest)\b/.test(text) && /\b(incident|incidents)\b/.test(text) && /\b(category|categories)\b/.test(text) && /\b(each community|by community|communities|community)\b/.test(text)
  },
  {
    id: "incident-category-by-community",
    title: "Incident category by community",
    description: "Break an incident category out by community for a period.",
    preferredTool: "slice_metric",
    answerStyle: "community-ranked-slice",
    cacheFamily: "incidents:category-by-community",
    variables: [INCIDENT_CATEGORY_VARIABLE, MONTH_VARIABLE],
    examples: ["What are {incidentCategory} incidents by community in {month}?", "What was the {month} breakdown of {incidentCategory} incidents by community?", "What are {incidentCategory} incidents by facility in {month}?", "What was the {incidentCategory} incident breakdown by facility in {month}?"],
    match: (text) => /\b(awol|elopement|medication refusal|medical emergency|substance|fall|category|categories)\b/.test(text) && /\b(incident|incidents)\b/.test(text) && /\b(by community|by facility|community breakdown|facility breakdown)\b/.test(text)
  },
  {
    id: "incident-period-comparison",
    title: "Incident period comparison",
    description: "Compare incident volume or categories across two periods.",
    preferredTool: "incident_category_comparison",
    answerStyle: "comparison-with-deltas",
    cacheFamily: "incidents:period-comparison",
    variables: [COMMUNITY_VARIABLE, INCIDENT_CATEGORY_VARIABLE, START_MONTH_VARIABLE, END_MONTH_VARIABLE],
    examples: [
      "Compare {community} incident categories from {startMonth} to {endMonth}.",
      "Compare portfolio incident categories between {startMonth} and {endMonth}.",
      "Show which incident categories changed the most from {startMonth} to {endMonth}.",
      "Compare {incidentCategory} incidents between {startMonth} and {endMonth}.",
      "Show the incident category delta from {startMonth} to {endMonth}."
    ],
    match: (text, context = {}) => (
      /\b(incident|incidents|awol|elopement)\b/.test(text) ||
      /\b(category|categories)\b/.test(text)
    ) && /\b(compare|comparison|vs|versus|change|changed|changes|delta)\b/.test(text) &&
      ((context.analysisFrame?.periods?.length ?? 0) >= 2 || parseRequestedMonthBuckets(text).length >= 2)
  },
  {
    id: "incident-rate",
    title: "Incident rate by community",
    description: "Normalize incident volume by census using rate per 100 residents.",
    preferredTool: "incident_rate",
    answerStyle: "rate-table",
    cacheFamily: "incidents:rate",
    examples: ["What is the incident rate by community?", "Which community has the highest incident rate per 100?", "What are the normalized incident rates?", "What are incidents per resident by community?"],
    match: (text) => /\b(incident|incidents)\b/.test(text) && /\b(rates?|per 100|per resident|normalized)\b/.test(text)
  },
  {
    id: "incident-rate-change",
    title: "Incident rate change",
    description: "Compare incident rate per 100 residents between periods by community.",
    preferredTool: "incident_rate_change",
    answerStyle: "rate-change-table",
    cacheFamily: "incidents:rate-change",
    variables: [START_MONTH_VARIABLE, END_MONTH_VARIABLE],
    examples: ["Which community had the biggest incident rate change from {startMonth} to {endMonth}?", "How do incident rates compare by community?", "What was the incident rate delta from {startMonth} to {endMonth}?", "Which facility had the biggest incident rate change?"],
    match: (text) => /\b(incident|incidents)\b/.test(text) && /\b(rates?|per 100|per resident|normalized)\b/.test(text) && /\b(compare|change|delta|from|to|between|vs|versus|increase|decrease|largest|biggest|most)\b/.test(text)
  },
  {
    id: "incident-resident-drivers",
    title: "Top resident incident drivers",
    description: "Rank residents contributing the most incident rows in a slice.",
    preferredTool: "incident_resident_drivers",
    answerStyle: "resident-ranked-slice",
    cacheFamily: "incidents:resident-drivers",
    variables: [COMMUNITY_VARIABLE, INCIDENT_CATEGORY_VARIABLE, MONTH_VARIABLE],
    examples: [
      "Which residents had the most incidents in {month}?",
      "Who had the most incidents at {community} in {month}?",
      "Which residents had the most {incidentCategory} incidents in {month}?",
      "Show the top residents for {community} incidents in {month}.",
      "Which clients accounted for the most incidents at {community} in {month}?"
    ],
    match: (text) => /\b(incident|incidents|awol|elopement)\b/.test(text) &&
      (
        /\b(driver|drivers|driving|top|rank|ranked|highest|most)\b/.test(text) &&
        /\b(resident|residents|client|clients)\b/.test(text) ||
        /\b(who|which|what)\b.*\b(most|highest|top)\b/.test(text)
      ) &&
      !/\b(rate|rates|per 100|per resident)\b/.test(text)
  },
  {
    id: "community-time-series",
    title: "Community trends over time",
    description: "Compare monthly census or incident patterns across communities.",
    preferredTool: "community_time_series",
    answerStyle: "multi-series-trend",
    cacheFamily: "communities:time-series",
    examples: [
      "Compare monthly census trends across all communities.",
      "Show incident trends by community over time.",
      "Show an incident heatmap across communities over time.",
      "Show the census time series by facility.",
      "Compare census and incident trends across communities month by month."
    ],
    match: (text) => /\b(census|occupancy|population|incident|incidents)\b/.test(text) &&
      /\b(trends?|history|historical|over time|time series|heatmap|heat map|matrix)\b/.test(text) &&
      /\b(across|by|each|all)\s+(community|communities|facility|facilities)\b/.test(text)
  },
  {
    id: "census-trend",
    title: "Census trend",
    description: "Monthly census trend for the portfolio or a community.",
    preferredTool: "census_trend",
    answerStyle: "trend-plus-latest-point",
    cacheFamily: "census:trend",
    variables: [COMMUNITY_VARIABLE],
    examples: ["Can you show the {community} census trend?", "What is {community}'s census history?", "What is {community}'s occupancy history?", "Can you show the monthly census for {community}?", "Can you show {community}'s monthly census trend?"],
    match: (text) => /\b(census|occupancy|headcount|population|resident count)\b/.test(text) &&
      /\b(trends?|history|over time|monthly)\b/.test(text) &&
      !(/\b(monthly|by month)\b/.test(text) && /\b(through|from)\b/.test(text))
  },
  {
    id: "census-movement",
    title: "Census movement",
    description: "Month-over-month census movement by community.",
    preferredTool: "census_movement",
    answerStyle: "movement-table",
    cacheFamily: "census:movement",
    variables: [COMMUNITY_VARIABLE],
    examples: [
      "Show this month's census movement by community.",
      "Which communities changed the most in census this month?",
      "Show the census movement for {community}.",
      "Show resident-count changes by community.",
      "Show the month-over-month census deltas."
    ],
    match: (text) => (
      /\b(census|occupancy|headcount|population|resident count)\b/.test(text) ||
      /\b(resident|residents)\b/.test(text)
    ) && /\b(movement|movers|change|changed|changes|deltas?|month over month|mom|up|down|drop|decline|increase|increased|decrease|decreased|added|add|gain|gained)\b/.test(text)
  },
  {
    id: "census-drop-history",
    title: "Census drop history",
    description: "Find communities with month-over-month census drops over the loaded history.",
    preferredTool: "census_drop_history",
    answerStyle: "drop-history",
    cacheFamily: "census:drops",
    examples: ["Has any community had a drop in census?", "Which communities had month-over-month census declines?", "Where did census decrease over time?", "Which communities had resident count drops month over month?"],
    match: (text) => /\b(census|occupancy|headcount|population|resident count)\b/.test(text) && /\b(drops?|dropped|declines?|decreases?|down|fell|lower)\b/.test(text) && !/\b(this month|current month|latest month|today|now)\b/.test(text)
  },
  {
    id: "resident-current-medications",
    title: "Resident medication summary",
    description: "Current medication counts, 30-day MAR compliance, exceptions, and the latest MAR record for a selected resident.",
    preferredTool: "resident_lookup",
    answerStyle: "profile-card",
    cacheFamily: "residents:current-medications",
    displayPrompt: "Review a resident's medication summary.",
    runPrompt: "Can you show me the Resident Search module?",
    examples: [
      "Show Shannon Romero's current medications.",
      "What active medications does Tuesday Woo have?",
      "Show the current medication orders for Shannon Romero.",
      "Which PRN medications are active for Tuesday Woo?"
    ],
    match: (text, context = {}) => hasKnownResident(text, context) &&
      /\b(medication|medications|meds|order|orders|dose|dosage|route|schedule|scheduled|prn|psychotropic|narcotic)\b/.test(text) &&
      !/\b(incident|incidents|awol|elopement|history|exception|exceptions|refusal|refusals|refused|not given|late|held)\b/.test(text)
  },
  {
    id: "resident-profile",
    title: "Resident profile",
    description: "Resident profile card with current roster and matched incident context.",
    preferredTool: "resident_lookup",
    answerStyle: "profile-card",
    cacheFamily: "residents:profile",
    displayPrompt: "Search for any resident profile.",
    runPrompt: "Can you show me the Resident Search module?",
    examples: [
      "Show Shannon Romero's resident profile.",
      "Find John Smith and show the resident profile if there is an exact match.",
      "Show Shannon Romero from the current resident roster.",
      "Show the profile card for Shannon Romero."
    ],
    match: (text, context = {}) => {
      const knownResident = hasKnownResident(text, context);
      const communityOnlyProfile = hasKnownFacility(text, context) && !knownResident;
      return (
        /\b(profile|who is)\b/.test(text) ||
        /\b(lookup|find|show)\b.*\b(resident|client)\b/.test(text) && knownResident ||
        knownResident && /\b(pull up|open|get|give me|show me|tell me about|look up|lookup)\b/.test(text)
      ) &&
        !communityOnlyProfile &&
        !/\b(community profile|portfolio profile|community overview|portfolio overview|risk|watchlist|watch list|needs attention|incident|incidents|awol|elopement|history|list|every|all|detail|details|rows?)\b/.test(text);
    }
  },
  {
    id: "resident-change-summary",
    title: "Resident change summary",
    description: "Current resident profile when an operator asks what changed for a known resident.",
    preferredTool: "resident_lookup",
    answerStyle: "profile-card",
    cacheFamily: "residents:change-summary",
    displayPrompt: "Search a resident and review recent changes.",
    runPrompt: "Can you show me the Resident Search module?",
    examples: [
      "Show what changed for Shannon Romero in the resident profile.",
      "Show what changed for Tuesday Woo in the resident profile.",
      "Check whether anything changed for Shannon Romero in the profile.",
      "Show what's different for Tuesday Woo in the resident profile."
    ],
    match: (text, context = {}) => hasChangeLanguage(text) &&
      hasKnownResident(text, context) &&
      !/\b(incident|incidents|awol|elopement|history|list|every|all|detail|details|rows?)\b/.test(text)
  },
  {
    id: "resident-incident-history",
    title: "Resident incident history",
    description: "Resident-specific incident history from loaded incident detail.",
    preferredTool: "resident_incident_history",
    answerStyle: "resident-history",
    cacheFamily: "residents:incident-history",
    displayPrompt: "Search a resident and review incident history.",
    runPrompt: "Can you show me the Resident Search module?",
    examples: ["Can you show Shannon Romero's incident history?", "What incidents does Tuesday Woo have?", "What is Shannon Romero's incident history?", "What is Tuesday Woo's incident history?"],
    match: (text, context = {}) => (
      Boolean(context.analysisFrame?.residentName) ||
      /\bincident history\b/.test(text) ||
      /\bwhat incidents does\b/.test(text)
    ) && /\b(incident|incidents|awol|elopement|history)\b/.test(text)
  },
  {
    id: "resident-search",
    title: "Resident search",
    description: "Search current residents by name, community, unit, diagnosis, or LOS.",
    preferredTool: "resident_search",
    answerStyle: "resident-search-results",
    cacheFamily: "residents:search",
    displayPrompt: "Search the resident roster.",
    runPrompt: "Can you show me the Resident Search module?",
    examples: [
      "Search the resident roster for John.",
      "Find current residents named Smith.",
      "Search current residents for Romero.",
      "Find clients named Shannon in the roster."
    ],
    match: (text, context = {}) => /\b(search|find|lookup)\b/.test(text) &&
      /\b(resident|residents|client|clients|census|roster)\b/.test(text) &&
      !/\b(profile|who is)\b/.test(text) &&
      !hasKnownResident(text, context)
  },
  {
    id: "resident-risk-summary",
    title: "Resident watch summary",
    description: "Resident-level watchlist based on available incident, LOS, and documentation signals.",
    preferredTool: "resident_risk_summary",
    answerStyle: "resident-ranked-watchlist",
    cacheFamily: "residents:watch-summary",
    examples: ["Which residents need attention?", "Can you show the resident watchlist?", "Which clients need attention?", "Can you show the resident risk list?"],
    match: (text) => /\b(resident|residents|client|clients|who)\b/.test(text) &&
      /\b(watch|watchlist|attention|risk|needs attention|showing up|driving|highest|most)\b/.test(text) &&
      !(/\b(incident|incidents|awol|elopement)\b/.test(text) && /\b(may|january|jan|february|feb|march|mar|april|apr|june|jun|july|jul|august|aug|september|sep|october|oct|november|nov|december|dec|20\d{2}|last month|current month|this month)\b/.test(text))
  },
  {
    id: "diagnosis-mix",
    title: "Diagnosis mix",
    description: "Diagnosis composition for the portfolio or a selected community.",
    preferredTool: "diagnosis_mix",
    answerStyle: "composition-summary",
    cacheFamily: "residents:diagnosis-mix",
    variables: [COMMUNITY_VARIABLE],
    examples: ["What is the diagnosis mix by community?", "What is {community}'s diagnosis mix?", "What diagnoses are represented at {community}?", "What is the clinical mix by community?", "Which diagnoses are most common at {community}?"],
    match: (text) => /\b(diagnosis|diagnoses|clinical mix|condition|conditions)\b/.test(text)
  },
  {
    id: "length-of-stay",
    title: "Length of stay",
    description: "Resident tenure and length-of-stay distribution.",
    preferredTool: "length_of_stay_mix",
    answerStyle: "resident-tenure-summary",
    cacheFamily: "residents:length-of-stay",
    variables: [COMMUNITY_VARIABLE],
    examples: [
      "What is length of stay by community?",
      "What is {community}'s length of stay mix?",
      "Who has the longest length of stay at {community}?",
      "What is the resident tenure mix at {community}?",
      "Who are the longest stay residents?"
    ],
    match: (text) => /\b(los|length of stay|longest stay|tenure)\b/.test(text) &&
      !(/\b(compare|comparison|rank)\b/.test(text) && /\b(community|communities|facility|facilities)\b/.test(text) && /\b(census|incident|incidents)\b/.test(text))
  },
  {
    id: "community-topline",
    title: "Current community profile",
    description: "Current community roster, census, LOS, diagnoses, and medication topline.",
    preferredTool: "community_profile",
    answerStyle: "summary-card",
    cacheFamily: "community:topline",
    variables: [COMMUNITY_VARIABLE],
    examples: [
      "Show the current community profile for {community}.",
      "Show {community}'s current community snapshot.",
      "Show the current state of {community}.",
      "Show the current community snapshot for {community}.",
      "Tell me about {community} using the current loaded profile."
    ],
    match: (text, context = {}) => (
      /\b(current profile|current roster summary|current state|current community snapshot|current snapshot|current topline|topline card)\b/.test(text) ||
      (/\b(profile|topline|snapshot)\b/.test(text) && /\b(current|today|right now)\b/.test(text)) ||
      (hasKnownFacility(text, context) && /\b(current profile|current roster|current state|current snapshot|current topline|topline card|tell me about|overview)\b/.test(text))
    )
  },
  {
    id: "community-change-summary",
    title: "Community change summary",
    description: "Period-aware community operating read when an operator asks broadly what changed at a community.",
    preferredTool: "community_history",
    answerStyle: "community-month-brief",
    cacheFamily: "community:change-summary",
    variables: [COMMUNITY_VARIABLE, MONTH_VARIABLE],
    examples: [
      "Show what changed at {community} in {month}, including census and incidents.",
      "Show the main updates for {community} in {month}.",
      "Show what was different at {community} in {month} compared with the prior month.",
      "Summarize {community}'s month-over-month changes for {month}.",
      "Show what changed in the community profile for {community} in {month}."
    ],
    match: (text, context = {}) => {
      const mentionsCensus = /\b(census|occupancy|headcount|population|resident count)\b/.test(text);
      const mentionsIncidents = /\b(incident|incidents|awol|elopement)\b/.test(text);
      const singleMetricChange = (mentionsCensus !== mentionsIncidents) ||
        /\b(medication|medications|meds|emar|refusal|refusals|documentation|doc gap|diagnosis|diagnoses|los|length of stay|rate|rates|per 100)\b/.test(text);
      return hasChangeLanguage(text) &&
        hasKnownFacility(text, context) &&
        !singleMetricChange &&
        !/\b(list|every|all|detail|details|rows?|export|download|csv)\b/.test(text);
    }
  },
  {
    id: "community-comparison",
    title: "Community comparison",
    description: "Compare communities across available census, incident, resident, and operating measures.",
    preferredTool: "community_compare",
    answerStyle: "community-comparison-table",
    cacheFamily: "community:comparison",
    examples: ["Can you compare communities?", "Can you rank communities by incidents and census?", "Which community looks different?", "Can you rank facilities by incidents?", "Can you compare community census and incidents?"],
    match: (text) => /\b(compare|comparison|rank|ranking|which community|communities)\b/.test(text) &&
      /\b(community|communities|facility|facilities|census|incident|incidents|resident|residents)\b/.test(text)
  },
  {
    id: "medication-current-orders",
    title: "Current medication orders",
    description: "Current active medication orders, resident coverage, medication flags, and exact order rows for the portfolio or a community.",
    preferredTool: "medication_orders_current",
    answerStyle: "medication-order-table",
    cacheFamily: "medications:current-orders",
    variables: [COMMUNITY_VARIABLE],
    examples: [
      "Show current medication orders for {community}.",
      "Which active medications are ordered at {community}?",
      "Show the current medication-order picture across the portfolio.",
      "List active PRN, psychotropic, and narcotic medication orders for {community}."
    ],
    match: (text, context = {}) => !hasKnownResident(text, context) &&
      /\b(current|active)\b/.test(text) &&
      (
        /\borders?\b/.test(text) ||
        /\bactive\b.*\b(medication|medications|meds)\b/.test(text) ||
        /\b(medication|medications|meds)\b.*\bactive\b/.test(text)
      )
  },
  {
    id: "medication-exception-detail",
    title: "Medication exception detail",
    description: "Exact MAR exception detail for refusals, not-given administrations, late administrations, held meds, and PRN-related detail.",
    preferredTool: "medication_exception_detail",
    answerStyle: "medication-exception-detail-rows",
    cacheFamily: "medications:exceptions",
    variables: [MEDICATION_DETAIL_VARIABLE, COMMUNITY_VARIABLE],
    examples: [
      "Show {medicationDetail} for {community} from the last 90 days.",
      "Can you list PRN medication exceptions?",
      "Which medication administrations were late?",
      "Can you show not-given medication detail?"
    ],
    match: (text) => /\b(medication|medications|meds|emar|mar|refusal|refusals|refused|not given|missed|held|late|prn)\b/.test(text) &&
      /\b(exception|exceptions|detail|details|list|every|all|rows?|who|resident|residents|client|clients|reason|reasons|result|results|effectiveness|follow up|recent|last 90|not given|missed|held|late|administration|administrations)\b/.test(text) &&
      !(/\b(watch|watchlist|watch list|attention|risk|problem|problems|issue|issues|top residents?|top clients?|drivers?|who needs|highest|most)\b/.test(text) &&
        !/\b(which medication|what medication|what medications|top refused medications|top refused meds|by medication)\b/.test(text)) &&
      !(/\b(count|how many|number of|total)\b/.test(text) && /\b(residents?|clients?|people)\b/.test(text) && /\bmedication refusal\b/.test(text)) &&
      !(/\b(compliance|scheduled)\b/.test(text) && !/\b(exception|exceptions|not given|missed|held|late|prn|refusal|refusals|refused)\b/.test(text)) &&
      !(/\b(by community|by facility|breakdown)\b/.test(text) && /\b(refusal|refusals|refused|not given)\b/.test(text)) &&
      !(/\b(top|largest|most|breakdown|by community|which medication|what medication|what medications)\b/.test(text) && /\b(refusal|refusals|refused)\b/.test(text))
  },
  {
    id: "medication-refusal-detail",
    title: "Medication refusal detail",
    description: "Medication refusal counts by community, resident, or medication.",
    preferredTool: "medication_refusals_by_community",
    answerStyle: "medication-refusal-summary",
    cacheFamily: "medications:refusals",
    variables: [COMMUNITY_VARIABLE, MONTH_VARIABLE],
    examples: [
      "Which medications were refused most at {community} in {month}?",
      "Show medication refusals by community.",
      "Break down refused medications by community.",
      "Show which medications have refusal counts."
    ],
    match: (text) => /\b(refusal|refusals|refused|not given|top refused)\b/.test(text) && /\b(medication|medications|meds|emar|refusal|refusals|refused)\b/.test(text)
  },
  {
    id: "medication-watch",
    title: "Medication watch",
    description: "Resident-level MAR watchlist ranked by refusals, not-given administrations, low compliance, and PRN activity.",
    preferredTool: "medication_watch",
    answerStyle: "medication-watch-summary",
    cacheFamily: "medications:watch",
    variables: [COMMUNITY_VARIABLE],
    examples: [
      "Show the resident medication watchlist for {community}.",
      "Show which residents are on the medication watchlist.",
      "Show the top residents for medication refusals.",
      "Show the resident MAR watchlist."
    ],
    match: (text) => /\b(medication|medications|meds|emar|mar|refusal|refusals|not given|prn)\b/.test(text) &&
      (/\b(watch|watchlist|watch list|attention|risk|problem|problems|issue|issues|top residents?|top clients?|drivers?|who needs)\b/.test(text) ||
        /\b(residents?|clients?|people)\b.*\b(highest|most)\b/.test(text)) &&
      !/\b(which medication|what medication|what medications|top refused medications|top refused meds|by medication)\b/.test(text)
  },
  {
    id: "medication-profile",
    title: "Medication profile",
    description: "Medication compliance, refusals, and documentation signals for a community or portfolio.",
    preferredTool: "medication_profile",
    answerStyle: "medication-operating-summary",
    cacheFamily: "medications:profile",
    variables: [COMMUNITY_VARIABLE],
    examples: [
      "Show {community}'s medication profile.",
      "Show the medication profile by community.",
      "Show the current medication picture across the portfolio.",
      "Show how {community} is doing with medications."
    ],
    match: (text) => /\b(medication|medications|meds|emar)\b/.test(text) &&
      /\b(profile|picture|overview|how are|how is|doing|summary)\b/.test(text)
  },
  {
    id: "medication-compliance",
    title: "Medication compliance",
    description: "Medication compliance by community and month.",
    preferredTool: "medication_compliance",
    answerStyle: "compliance-summary",
    cacheFamily: "medications:compliance",
    examples: ["What is medication compliance this month?", "What is eMAR compliance by community?", "What is scheduled medication compliance?", "How was medication compliance by community this month?"],
    match: (text) => /\b(compliance|given|scheduled|emar)\b/.test(text) && /\b(medication|meds|emar|compliance|given|scheduled)\b/.test(text)
  },
  {
    id: "medication-compliance-history",
    title: "Medication compliance history",
    description: "Monthly medication compliance history for a community across a selected period.",
    preferredTool: "medication_compliance",
    answerStyle: "compliance-trend-summary",
    cacheFamily: "medications:compliance-history",
    variables: [COMMUNITY_VARIABLE, START_MONTH_VARIABLE, END_MONTH_VARIABLE],
    examples: [
      "How did medication compliance change at {community} from {startMonth} through {endMonth}?",
      "Show the medication compliance trend for {community} from {startMonth} through {endMonth}.",
      "Compare monthly medication compliance at {community} from {startMonth} through {endMonth}.",
      "Show {community}'s medication compliance history from {startMonth} through {endMonth}.",
      "How consistent was medication compliance at {community} from {startMonth} through {endMonth}?"
    ],
    match: (text, context = {}) => /\b(compliance|given|scheduled|emar)\b/.test(text) &&
      /\b(change|changed|trend|history|compare|comparison|consistent|from|through|between|over time)\b/.test(text) &&
      (parseRequestedMonthBuckets(text).length > 1 || Boolean(context.analysisFrame?.periods?.length > 1))
  },
  {
    id: "data-slice-catalog",
    title: "Available data slices",
    description: "Show the analytical slices currently loaded for the analyst.",
    preferredTool: "tool_context_catalog",
    answerStyle: "catalog-table",
    cacheFamily: "catalog:slices",
    examples: ["What data can you use?", "Can you show available analytical slices?", "What data is available to use?", "What data can the analyst use?"],
    match: (text) => isDataSliceCatalogLanguage(text) ||
      /\b(available data|analytical slices|what data)\b/.test(text)
  },
  {
    id: "operating-snapshot",
    title: "Operating snapshot",
    description: "Portfolio or community current-state operating topline.",
    preferredTool: "operating_snapshot",
    answerStyle: "operating-summary",
    cacheFamily: "operations:snapshot",
    examples: [
      "Show the current portfolio operating snapshot.",
      "Show the portfolio operating snapshot.",
      "Show the current operating picture across all communities.",
      "Show the current portfolio picture.",
      "Show today's operating snapshot."
    ],
    match: (text) => /\b(operating snapshot|operationally|where are we|portfolio snapshot|portfolio picture|current operating picture)\b/.test(text)
  }
];

export function getCertifiedQuestionRoutes() {
  return CERTIFIED_ANALYST_QUESTIONS.flatMap((question) => {
    const prompts = [question.displayPrompt, ...(question.examples ?? [])]
      .map((prompt) => String(prompt ?? "").trim())
      .filter(Boolean)
      .filter((prompt, index, values) => (
        values.findIndex((value) => value.toLowerCase() === prompt.toLowerCase()) === index
      ));
    const routePrompts = prompts.length ? prompts : [question.title];

    return routePrompts.map((prompt, variantIndex) => {
      const usesDisplayRunPrompt = Boolean(
        question.displayPrompt &&
        prompt === question.displayPrompt &&
        question.runPrompt
      );
      return Object.freeze({
        id: `${question.id}:${variantIndex}`,
        familyId: question.id,
        variantIndex,
        prompt,
        runPrompt: usesDisplayRunPrompt ? question.runPrompt : prompt,
        expectedTool: usesDisplayRunPrompt ? "surface_module" : question.preferredTool,
        question
      });
    });
  });
}

export const CERTIFIED_QUESTION_MENU = Object.freeze([
  { familyId: "community-month-status", variantIndex: 0, category: "Communities" },
  { familyId: "operating-snapshot", variantIndex: 0, category: "Operating" },
  { familyId: "census-point-count", variantIndex: 0, category: "Census" },
  { familyId: "census-trend", variantIndex: 0, category: "Census" },
  { familyId: "community-change-summary", variantIndex: 0, category: "Communities" },
  { familyId: "community-comparison", variantIndex: 0, category: "Communities" },
  { familyId: "incident-current-snapshot", variantIndex: 0, category: "Incidents" },
  { familyId: "incident-category-breakdown", variantIndex: 0, category: "Incidents" },
  { familyId: "resident-search", variantIndex: 0, category: "Residents" },
  { familyId: "medication-profile", variantIndex: 0, category: "Medications" },
  { familyId: "census-movement", variantIndex: 0, category: "Census" },
  { familyId: "community-time-series", variantIndex: 0, category: "Communities" },
  { familyId: "census-drop-history", variantIndex: 0, category: "Census" },
  { familyId: "medication-compliance", variantIndex: 0, category: "Medications" },
  { familyId: "incident-event-count", variantIndex: 1, category: "Incidents" },
  { familyId: "incident-unique-people-count", variantIndex: 0, category: "Incidents" },
  { familyId: "incident-detail-list", variantIndex: 0, category: "Incidents" },
  { familyId: "incident-rate", variantIndex: 0, category: "Incidents" },
  { familyId: "incident-resident-drivers", variantIndex: 1, category: "Incidents" },
  { familyId: "incident-period-comparison", variantIndex: 0, category: "Incidents" },
  { familyId: "incident-category-by-community", variantIndex: 0, category: "Incidents" },
  { familyId: "incident-top-category-by-community", variantIndex: 2, category: "Incidents" },
  { familyId: "incident-rate-change", variantIndex: 0, category: "Incidents" },
  { familyId: "diagnosis-mix", variantIndex: 0, category: "Residents" },
  { familyId: "length-of-stay", variantIndex: 0, category: "Residents" },
  { familyId: "resident-current-medications", variantIndex: 0, category: "Medications" },
  { familyId: "medication-compliance-history", variantIndex: 0, category: "Medications" },
  { familyId: "medication-current-orders", variantIndex: 0, category: "Medications" },
  { familyId: "medication-refusal-detail", variantIndex: 0, category: "Medications" },
  { familyId: "medication-exception-detail", variantIndex: 0, category: "Medications" },
  { familyId: "medication-watch", variantIndex: 0, category: "Medications" }
].map((entry) => Object.freeze(entry)));

export function getCertifiedQuestionMenuRoutes() {
  const routesById = new Map(getCertifiedQuestionRoutes().map((route) => [route.id, route]));
  return CERTIFIED_QUESTION_MENU.map((entry, menuRank) => {
    const routeId = `${entry.familyId}:${entry.variantIndex}`;
    const route = routesById.get(routeId);
    if (!route) {
      throw new Error(`Certified question menu route is not registered: ${routeId}`);
    }
    return Object.freeze({
      ...route,
      menuCategory: entry.category,
      menuRank
    });
  });
}

export function getCertifiedQuestionRouteById(routeId) {
  const normalizedRouteId = String(routeId ?? "").trim();
  if (!normalizedRouteId) return null;
  return getCertifiedQuestionRoutes().find((route) => route.id === normalizedRouteId) ?? null;
}

export function matchCertifiedQuestion(content, context = {}) {
  const text = normalize(content);
  if (!text) return null;

  const priorityById = {
    "incident-row-export": 100,
    "module-catalog": 100,
    "module-surface": 100,
    "data-availability": 99,
    "incident-freshness-troubleshoot": 99,
    "generic-detail-list": 96,
    "incident-detail-list": 95,
    "incident-unique-people-count": 94,
    "incident-event-count": 93,
    "incident-rate-change": 92,
    "incident-period-comparison": 90,
    "resident-change-summary": 85,
    "incident-top-category-by-community": 89,
    "incident-category-by-community": 88,
    "incident-resident-drivers": 87,
    "resident-incident-history": 86,
    "resident-search": 84,
    "resident-current-medications": 86,
    "resident-risk-summary": 83,
    "community-change-summary": 92,
    "community-month-status": 91,
    "census-drop-history": 82,
    "diagnosis-mix": 82,
    "length-of-stay": 82,
    "medication-exception-detail": 97,
    "medication-current-orders": 98,
    "medication-watch": 84,
    "medication-compliance-history": 83,
    "medication-refusal-detail": 81,
    "medication-compliance": 80,
    "medication-profile": 79,
    "incident-category-breakdown": 76,
    "incident-current-snapshot": 75,
    "incident-rate": 74,
    "community-time-series": 94,
    "census-point-count": 73,
    "census-trend": 72,
    "census-movement": 70,
    "resident-profile": 68,
    "community-comparison": 67,
    "community-topline": 66,
    "operating-snapshot": 69,
    "data-slice-catalog": 64
  };
  const matches = CERTIFIED_ANALYST_QUESTIONS
    .filter((question) => question.match(text, context))
    .map((question, index) => ({
      ...question,
      matchIndex: index,
      priority: priorityById[question.id] ?? 50,
      confidence: index === 0 ? 0.92 : 0.82
    }))
    .sort((left, right) => right.priority - left.priority || left.matchIndex - right.matchIndex);

  return matches[0] ?? null;
}

export function makeCertifiedQuestionMeta(question, frame = {}) {
  if (!question) return null;
  const scope = compactKey(frame.communityName || frame.residentName || "portfolio");
  const periods = (frame.periods?.length ? frame.periods : ["latest"]).map(formatPeriod).join(",");
  const category = compactKey(frame.category || "all-categories");
  const metric = compactKey(frame.metric || "all-metrics");
  const metricGrain = compactKey(frame.metricGrain || "all-grains");
  const mode = compactKey(frame.mode || "default-mode");
  const grouping = compactKey(frame.grouping || "no-grouping");
  const fields = (frame.fields?.length ? [...frame.fields].sort() : ["all-fields"])
    .map(compactKey)
    .join(",");
  const presentation = compactKey(frame.presentation || "default-presentation");

  return {
    version: CERTIFIED_QUESTION_VERSION,
    id: question.id,
    title: question.title,
    description: question.description,
    preferredTool: question.preferredTool,
    answerStyle: question.answerStyle,
    cacheKey: `${question.cacheFamily}:${scope}:${periods}:${category}:${metric}:${metricGrain}:${mode}:${grouping}:${fields}:${presentation}`,
    confidence: question.confidence ?? 0.9
  };
}

function toolAction(label, prompt, certifiedFamilyId = null) {
  const certifiedQuestion = certifiedFamilyId
    ? CERTIFIED_ANALYST_QUESTIONS.find((question) => question.id === certifiedFamilyId)
    : null;
  const certifiedRoute = certifiedQuestion
    ? getCertifiedQuestionMenuRoutes().find((route) => (
        route.familyId === certifiedQuestion.id &&
        route.expectedTool === certifiedQuestion.preferredTool
      ))
    : null;
  return {
    label,
    kind: "tool",
    tool: "run_analysis",
    prompt,
    ...(certifiedRoute ? { certifiedQuestionRouteId: certifiedRoute.id } : {})
  };
}

function previousMonthBucket(period) {
  const match = String(period ?? "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const absoluteMonth = Number(match[1]) * 12 + Number(match[2]) - 2;
  const year = Math.floor(absoluteMonth / 12);
  const month = (absoluteMonth % 12) + 1;
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function buildCertifiedFollowUps(result = {}, frame = {}, content = "") {
  const tool = result.tool;
  const scope = getScope(frame);
  const category = frame.category || (/\bawol|elopement\b/i.test(content) ? "AWOL/Elopement" : null);
  const latestPeriod = frame.periods?.at(-1) || result.trace?.period || "latest";
  const priorPeriod = previousMonthBucket(latestPeriod);
  const comparisonPeriods = priorPeriod ? `${priorPeriod} with ${latestPeriod}` : `${latestPeriod} with the prior month`;
  const priorPromptScope = scope === "portfolio" ? "portfolio" : scope;
  const categoryPhrase = category ? `${category} ` : "";

  if (tool === "incident_breakdown") {
    return [
      toolAction("Compare with prior month", `compare ${priorPromptScope} ${categoryPhrase}incidents for ${comparisonPeriods} by category`, "incident-period-comparison"),
      toolAction("List exact incident rows", `list every ${priorPromptScope} ${categoryPhrase}incident for ${latestPeriod} including resident, date, type, description`, "incident-detail-list"),
      toolAction("Show incident rate", `show ${priorPromptScope} incident rate per 100 residents for ${latestPeriod}`, "incident-rate")
    ];
  }

  if (tool === "slice_metric") {
    return [
      toolAction("Show exact rows", `list every ${priorPromptScope} ${categoryPhrase || ""}incident for ${latestPeriod} including resident, date, type, description`, "incident-detail-list"),
      toolAction("Compare prior month", `compare ${priorPromptScope} ${categoryPhrase || ""}incidents for ${comparisonPeriods}`, "incident-period-comparison"),
      toolAction("Export this slice", `export ${priorPromptScope} ${categoryPhrase || ""}incidents for ${latestPeriod} to csv`, "incident-row-export")
    ];
  }

  if (tool === "incident_category_comparison" || tool === "compare_periods" || tool === "incident_rate_change") {
    return [
      toolAction("List rows behind this", `list every ${priorPromptScope} ${categoryPhrase}incident for ${frame.periods?.join(" through ") || latestPeriod} including resident, date, type, description`, "incident-detail-list"),
      toolAction("Show rate view", `show ${priorPromptScope} incident rate change for ${frame.periods?.join(" vs ") || latestPeriod}`, "incident-rate-change"),
      toolAction("Export exact rows", `export ${priorPromptScope} ${categoryPhrase}incidents for ${frame.periods?.join(" through ") || latestPeriod} to csv`, "incident-row-export")
    ];
  }

  if (tool === "incident_detail_list") {
    return [
      toolAction("Summarize categories", `summarize ${priorPromptScope} ${categoryPhrase}incidents for ${frame.periods?.join(" through ") || latestPeriod} by category`, "incident-category-breakdown"),
      toolAction("Group by resident", `rank residents in ${priorPromptScope} ${categoryPhrase}incidents for ${frame.periods?.join(" through ") || latestPeriod}`, "incident-resident-drivers"),
      toolAction("Export these rows", `export ${priorPromptScope} ${categoryPhrase}incidents for ${frame.periods?.join(" through ") || latestPeriod} to csv`, "incident-row-export")
    ];
  }

  if (tool === "incident_rate") {
    return [
      toolAction("Compare rate change", `compare incident rates by community for ${comparisonPeriods}`, "incident-rate-change"),
      toolAction("Show incident counts", `show incidents by community for ${latestPeriod}`),
      toolAction("Open highest-rate community", `show ${result.visual?.rows?.[0]?.label ?? "the highest-rate community"} community profile`, "community-topline")
    ];
  }

  if (tool === "incident_resident_drivers") {
    const topResident = result.visual?.rows?.[0]?.label;
    return [
      ...(topResident ? [toolAction("Open top resident", `show ${topResident} resident profile`, "resident-profile")] : []),
      toolAction("Show exact incidents", `list every ${priorPromptScope} ${categoryPhrase}incident for ${latestPeriod} including resident, date, type, description`, "incident-detail-list")
    ];
  }

  if (tool === "detail_list") {
    return [
      toolAction("Export these exact rows", `export ${content}`),
      toolAction("Show data availability", "show loaded data availability", "data-availability")
    ];
  }

  if (tool === "resident_flow_weekly") {
    return [
      toolAction("Show resident admit rows", `list resident admissions for ${frame.periods?.join(" through ") || latestPeriod}`, "generic-detail-list"),
      toolAction("Show data availability", "show loaded data availability", "data-availability")
    ];
  }

  if (tool === "data_availability") {
    return [
      toolAction("Show available analytical slices", "show available analytical slices", "data-slice-catalog"),
      toolAction("List latest incident rows", "list every incident row for the latest loaded month including resident date type and description", "incident-detail-list")
    ];
  }

  if (tool === "tool_context_catalog") {
    return [
      toolAction("Show data availability", "show loaded data availability", "data-availability"),
      toolAction("Open module catalog", "show available modules", "module-catalog")
    ];
  }

  if (tool === "census_trend") {
    return [
      toolAction("Show movement by community", `show census movement by community for ${latestPeriod}`, "census-movement"),
      toolAction("Check for drops", "has any community had a month over month census drop over the loaded history", "census-drop-history"),
      toolAction("Compare with incidents", `compare ${priorPromptScope} census and incidents for ${latestPeriod}`, "community-comparison")
    ];
  }

  if (tool === "census_movement" || tool === "census_drop_history") {
    return [
      toolAction("Open trend view", `show ${priorPromptScope} census trend`, "census-trend"),
      toolAction("Compare incidents too", `show ${priorPromptScope} incidents for ${latestPeriod}`, "incident-current-snapshot"),
      toolAction("Export census series", `export ${priorPromptScope} census series to csv`)
    ];
  }

  if (tool === "resident_lookup" || tool === "resident_incident_history") {
    return [
      toolAction("Show incident history", `show ${scope} incident history`, "resident-incident-history"),
      toolAction("Show community context", `show ${scope} community profile`),
      toolAction("Export resident rows", `export ${scope} resident profile to csv`)
    ];
  }

  if (tool === "resident_search") {
    return [];
  }

  if (tool === "resident_risk_summary" || tool === "diagnosis_mix" || tool === "length_of_stay_mix") {
    return [
      toolAction("Show resident profiles", `search residents in ${priorPromptScope}`, "resident-search"),
      toolAction("Show incident drivers", `rank residents driving incidents in ${priorPromptScope}`, "incident-resident-drivers"),
      toolAction("Export resident rows", `export ${priorPromptScope} resident rows to csv`)
    ];
  }

  if (tool === "medication_profile") {
    return [
      toolAction("Show resident medication watchlist", `show the resident medication watchlist for ${priorPromptScope}`, "medication-watch")
    ];
  }

  if (tool === "medication_compliance") {
    return [
      toolAction("Show most-refused medications", `show which medications were refused most at ${priorPromptScope} in ${latestPeriod}`, "medication-refusal-detail")
    ];
  }

  if (tool === "medication_refusals_by_community") {
    return [
      toolAction("Show exact refusal records", `show medication refusal detail for ${priorPromptScope} from the last 90 days`, "medication-exception-detail")
    ];
  }

  if (tool === "medication_exception_detail") {
    return [
      toolAction("Show resident medication watchlist", `show the resident medication watchlist for ${priorPromptScope}`, "medication-watch")
    ];
  }

  if (tool === "medication_watch") {
    return [
      toolAction("Show exact refusal records", `show medication refusal detail for ${priorPromptScope} from the last 90 days`, "medication-exception-detail")
    ];
  }

  if (tool === "community_compare") {
    return [
      toolAction("Show census movement", "show census movement by community", "census-movement"),
      toolAction("Show incident rates", `show incident rate by community for ${latestPeriod}`, "incident-rate"),
      toolAction("Show resident watchlist", "which residents need attention", "resident-risk-summary")
    ];
  }

  if (tool === "community_profile") {
    return [
      toolAction("Show census trend", `show ${scope} census trend`, "census-trend"),
      toolAction("Show incident categories", `show ${scope} incident category breakdown`, "incident-category-breakdown"),
      toolAction("List current residents", `show ${scope} resident roster`, "resident-search")
    ];
  }

  return [];
}

export function buildCertifiedCacheRequests({ facilities = [], months = [] } = {}) {
  const latestMonth = months.at(-1) ?? "latest";
  const priorMonth = months.at(-2) ?? latestMonth;
  const matchContext = { facilities, availableMonths: months };
  const corePrompts = [
    "incidents",
    "show census movement by community",
    "has any community had a drop in census over the loaded history",
    "show incident rate by community",
    `compare portfolio incidents for ${priorMonth} vs ${latestMonth} by category`,
    "which residents are driving incidents",
    "which residents need attention",
    "medication refusals by community",
    "how are meds looking",
    "diagnosis mix by community",
    "length of stay by community",
    "compare communities",
    "show available analytical slices"
  ];
  const facilityPrompts = facilities.flatMap((facility) => {
    const name = facility.community_name ?? facility.communityName ?? facility.name;
    if (!name) return [];
    return [
      `show ${name} census trend`,
      `show ${name} incident category breakdown`,
      `show ${name} incident rate`,
      `show ${name} diagnosis mix`,
      `show ${name} length of stay`,
      `show ${name} medication profile`,
      `how is ${name}`
    ];
  });

  return [...corePrompts, ...facilityPrompts].map((prompt) => ({
    prompt,
    matchedQuestion: matchCertifiedQuestion(prompt, matchContext)
  }));
}

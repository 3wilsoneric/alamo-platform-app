import { resolvePlatformModuleRequest } from "../../shared/platform-module-registry.mjs";
import { isSliceDiscoveryIntent } from "../../shared/analysis-slice-catalog.mjs";
import { hasDateRangeIntent, isAdmissionIntent } from "./generic-detail-list.mjs";

export function createToolDetection({
  normalizeText,
  findFacility,
  findResident,
  getRequestedMonthBuckets,
  isDataAvailabilityIntent,
  isIncidentFreshnessIntent,
  isVisualIntent,
  resolveSurfaceModule
}) {
  function isResidentFlowIntent(content) {
    const text = normalizeText(content);
    const intakeLanguage = /\b(admissions?|admitted|admits?|admit|intakes?|move[\s-]?ins?|move[\s-]?in|new residents?|new clients?)\b/.test(text);
    const dischargeLanguage = /\b(dischar(?:ge|ged|ges|ging)?|dischare|move[\s-]?outs?|move[\s-]?out|exits?|terminations?)\b/.test(text);
    const flowLanguage = /\b(flow|movement|throughput|turnover|week by week|weekly|by week)\b/.test(text);
    return (intakeLanguage && dischargeLanguage) || (flowLanguage && (intakeLanguage || dischargeLanguage));
  }

  function isResidentRosterSearchIntent(content) {
    const text = normalizeText(content);
    if (/\b(incident|incidents|awol|elopement|medication|medications|meds|emar|mar|refusal|refusals|documentation|doc gap|note gap)\b/.test(text)) {
      return false;
    }
    if (/\b(profile|who is|tell me about|pull up|demographic|demographics|age mix|age distribution|diagnosis mix|clinical mix|los mix|length of stay)\b/.test(text)) {
      return false;
    }
    if (/\b(how many|count|total|number of)\b/.test(text) && /\b(month|monthly|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december|20\d{2})\b/.test(text)) {
      return false;
    }
    return /\b(census search|search census|resident search|search residents|search clients|resident roster|client roster|resident directory|client directory|full roster|complete roster|current roster|everyone on census|who is on census)\b/.test(text) ||
      /\b(list|show|give me|pull|display|browse|find|search)\b.*\b(residents?|clients?|people|persons|roster)\b/.test(text) ||
      /\b(residents?|clients?|people|persons)\b.*\b(list|roster|directory|search|slice|filter|browse)\b/.test(text);
  }

  function detectTool(content, communities) {
    const text = normalizeText(content);
    const facility = findFacility(content, communities);
    const incidentResidentDriverIntent = /\b(incident|incidents|awol|elopement|refusal|refusals|medical emergency|aggressive behavior|substance use|fall)\b/.test(text) && (
      /\b(driv(?:e|es|ing|er|ers)|account(?:s|ed)? for|top residents?|top clients?|most frequent|repeat residents?|repeat clients?|high frequency|highest volume)\b/.test(text) ||
      /\b(who|which|what)\b.*\b(resident|residents|client|clients|person|people)\b.*\b(most|highest|top)\b/.test(text) ||
      /\b(who|which|what)\b.*\b(most|highest|top)\b.*\b(incident|incidents|awol|elopement)\b/.test(text) ||
      /\b(resident|residents|client|clients|person|people)\b.*\b(most|highest|top)\b.*\b(incident|incidents|awol|elopement)\b/.test(text)
    );
    const residentProfileIntent = /\b(resident|client)\b/.test(text) && /\b(profile|lookup|who is|show|find)\b/.test(text);
    const explicitSurfaceLanguage = /\b(module|screen|page|view|open|surface|bring up|take me|incident center|glossary|command center|data dictionary|definitions)\b/.test(text);
    const residentSearchSurfacePhrase = /\b(show|open|surface|bring up|launch)\b.*\b(resident search|resident directory)\b/.test(text) &&
      !/\b(named|matching|with|list|all|every|full roster|complete roster|census search|search census)\b/.test(text);
    const bareResidentSurfaceIntent = /^(resident search|search residents|search census|census search|resident directory|find a resident|find resident)$/.test(text);
    const moduleSurfaceIntent = explicitSurfaceLanguage || residentSearchSurfacePhrase || bareResidentSurfaceIntent;
    const medicationTextIntent = /\b(medication|medications|meds|emar|mar|refusal|refusals|refused|not given|missed|held|late|prn)\b/.test(text);
    const explicitMedicationComplianceIntent = /\b(compliance|scheduled)\b/.test(text) || (/\bgiven\b/.test(text) && !/\bnot given\b/.test(text));
    const medicationWatchIntent = medicationTextIntent &&
      /\b(watch|watchlist|watch list|attention|risk|problem|problems|issue|issues|top residents?|top clients?|drivers?|who needs|highest|most)\b/.test(text) &&
      !/\b(which medication|what medication|what medications|top refused medications|top refused meds|by medication)\b/.test(text);
    const medicationOrderIntent = /\b(current|active)\b/.test(text) &&
      /\b(medication|medications|meds|orders?)\b/.test(text) &&
      !/\b(resident|client)\s+(profile|lookup)\b/.test(text);
    const medicationDetailIntent = medicationTextIntent && !explicitMedicationComplianceIntent && (
      /\b(exception|exceptions|detail|details|list|every|all|rows?|who|resident|residents|client|clients|reason|reasons|recent|last 90|not given|missed|held|late|prn)\b/.test(text) ||
      (/\b(refusal|refusals|refused)\b/.test(text) && !/\b(top|largest|most|by community|breakdown|which medication|what medication|what medications)\b/.test(text))
    );
    const availableOperatingMonths = [...new Set([
      ...(communities.census ?? []).map((row) => row.month_bucket),
      ...(communities.incidents ?? []).map((row) => row.month_bucket)
    ].filter(Boolean))].sort();
    const requestedOperatingMonths = getRequestedMonthBuckets(content, availableOperatingMonths);
    const requestedIncidentMonths = getRequestedMonthBuckets(content, [...new Set((communities.incidents ?? []).map((row) => row.month_bucket).filter(Boolean))].sort());
    const admissionDetailIntent = isAdmissionIntent(content) &&
      (hasDateRangeIntent(content) || /\b(list|show|give me|pull|how many|count|total|details?|rows?)\b/.test(text));
    const incidentCategoryCountIntent = /\b(how many|count|total|number of)\b/.test(text) &&
      /\b(awol|elopement|sentinel|police|injury|fall|refusal|refusals|medical emergency|aggressive behavior|substance use)\b/.test(text);
    const broadCommunityStatusIntent = Boolean(facility) &&
      /\b(how did|how was|how has|how is|how s|whats going on|what s going on|what changed|what happened|doing|read on|operating picture|monthly picture|status)\b/.test(text);
    const broadCommunityHistoryIntent = Boolean(facility) &&
      (requestedOperatingMonths.length > 0 || broadCommunityStatusIntent) &&
      (
        broadCommunityStatusIntent ||
        /\b(how|was|been|doing|happened|happening|going on|read|look|looked|performance|picture|profile|overview|topline|snapshot|detail|details|history|historical|last|past|prior|previous|months?|quarter|ytd)\b/.test(text)
      ) &&
      !/\b(how many|count|total|number of|trends?|census|occupancy|headcount|population|resident count|incident category|categories|breakdown|awol|elopement|search|find|resident profile|client profile|who is)\b/.test(text);
    if (isBarePersonNameIntent(content)) return "resident_lookup";
    if (isResidentFlowIntent(content)) return "resident_flow_weekly";
    if (admissionDetailIntent) return "detail_list";
    if (/\b(services? provided|service archive|scheduled service|billable service|service units|provided to clients)\b/.test(text)) return "slice_discovery";
    if (/\b(assessment|assessments|assessment type|assessment status|assessment score)\b/.test(text)) return "slice_discovery";
    if (/\b(progress notes?|care notes?|resident notes?|documentation notes?|notes? history)\b/.test(text)) return "slice_discovery";
    if (broadCommunityHistoryIntent) return "community_history";
    const incidentDetailIntent = /\b(incident|incidents|awol|elopement|sentinel|police|injury)\b/.test(text) && (
      /\b(detail|details|description|descriptions|narrative|narratives|who)\b/.test(text) ||
      (/\b(search|find)\b/.test(text) && /\b(ever|all|history|detail|details|rows?|resident|residents|client|clients|name|names|date|description|narrative|awol|elopement|refusal|refusals|medical emergency|aggressive behavior|substance use|fall)\b/.test(text)) ||
      (/\b(awol|elopement)\b/.test(text) && /\b(resident|residents|client|clients|name|names)\b/.test(text)) ||
      (/\b(list|all|every)\b/.test(text) && /\b(awol|elopement|resident|residents|client|clients|name|date|description|narrative)\b/.test(text))
    );
    if (isExportIntent(content)) return "export_csv";
    if (/\b(available modules|module catalog|module registry|what modules)\b/.test(text)) return "module_catalog";
    if (isIncidentFreshnessIntent(text)) return "data_availability";
    if (isDataAvailabilityIntent(text)) return "data_availability";
    if (moduleSurfaceIntent && resolveSurfaceModule(content, communities)) return "surface_module";
    if (/\b(available data|data slices|analytical slices|tool context|manifest|fields|what data|data can you use)\b/.test(text)) return "tool_context_catalog";
    if (isSliceDiscoveryIntent(content) && /\b(incident|incidents|census|occupancy|population|resident|residents|client|clients|medication|medications|meds|emar|mar|refusal|refusals|not given|missed|held|late|prn)\b/.test(text)) return "slice_discovery";
    if (/\b(trends?|history|historical|over time|time series|trajectory|heatmap|heat map|matrix)\b/.test(text) && /\b(across|by|each|all)\s+(community|communities|facility|facilities)\b/.test(text) && /\b(census|occupancy|population|incident|incidents)\b/.test(text)) return "community_time_series";
    if (/\b(incident|incidents)\b/.test(text) && /\b(rate|per 100|per resident)\b/.test(text) && /\b(compare|comparison|between|versus| vs |change|increase|decrease|largest|most)\b/.test(text)) return "incident_rate_change";
    if (incidentResidentDriverIntent) return "incident_resident_drivers";
    if (incidentDetailIntent) return "incident_detail_list";
    if (incidentCategoryCountIntent) return /\b(by community|by facility|each community|each facility)\b/.test(text)
      ? "slice_metric"
      : "incident_breakdown";
    if (/\b(incident|incidents)\b/.test(text) && /\b(medication refusal|med refusal|refusal|refusals|refused meds?)\b/.test(text)) return "incident_breakdown";
    if (/\b(top|largest|leading|main)\b/.test(text) && /\b(category|categories|type|types)\b/.test(text) && /\b(each community|each facility|by community|by facility|communities|facilities)\b/.test(text) && /\b(incident|incidents)\b/.test(text)) return "top_incident_category_by_community";
    if (/\b(compare|comparison|versus| vs |change|changed|changes)\b/.test(text) && /\b(incident|incidents|category|categories)\b/.test(text) && /\b(category|categories|type|types|breakdown)\b/.test(text)) return "incident_category_comparison";
    if (requestedIncidentMonths.length >= 2 && /\b(incident|incidents)\b/.test(text) && /\b(category|categories|type|types|breakdown|break down)\b/.test(text)) return "incident_category_comparison";
    if (/\b(rate|rates|per 100|per resident|incident rate)\b/.test(text) && /\b(incident|incidents)\b/.test(text)) {
      return /\b(compare|comparison|between|versus| vs |change|increase|decrease|largest|most|prior month)\b/.test(text)
        ? "incident_rate_change"
        : "incident_rate";
    }
    if (/\b(compare|comparison|versus| vs |between)\b/.test(text) && /\b(month|monthly|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|september|oct|october|nov|november|dec|december|20\d{2})\b/.test(text)) return "compare_periods";
    if (/\b(incident|incidents)\b/.test(text) && /\b(category|categories|type|types|breakdown|break down)\b/.test(text) && !/\b(by community|communities|facility|facilities)\b/.test(text)) return "incident_breakdown";
    if (/\b(slice|dice|break out|breakdown|break down|group by|by community|by category|by month|monthly|rank|top)\b/.test(text) && /\b(incident|incidents|census|occupancy|population|medication|compliance|refusal|documentation|doc gap|age|los|length of stay)\b/.test(text)) return "slice_metric";
    if (/\b(operating snapshot|snapshot|current state|where are we|overview|portfolio picture|operationally|operating picture)\b/.test(text)) return "operating_snapshot";
    if (/\b(compare|comparison|versus| vs |rank communities|community compare)\b/.test(text)) return "community_compare";
    if (/\b(risk|at risk|watchlist|watch list|who needs attention)\b/.test(text) && /\b(resident|residents|client|clients)\b/.test(text)) return "resident_risk_summary";
    if (/\b(documentation|doc gap|note gap|last note|care note)\b/.test(text)) return "documentation_gaps";
    if (/\b(diagnosis|diagnoses|clinical mix|condition|conditions)\b/.test(text)) return "diagnosis_mix";
    if (/\b(age|ages|demographic|demographics|oldest|younger|older)\b/.test(text)) return "resident_demographics";
    if (/\b(los|length of stay|longest stay|tenure)\b/.test(text)) return "length_of_stay_mix";
    if (residentProfileIntent) return "resident_lookup";
    if (isResidentRosterSearchIntent(content)) return "resident_search";
    if (/\b(search|find|lookup)\b/.test(text) && /\b(resident|residents|client|clients)\b/.test(text)) return "resident_search";
    if (medicationOrderIntent) return "medication_orders_current";
    if (medicationWatchIntent) return "medication_watch";
    if (medicationDetailIntent) return "medication_exception_detail";
    if (/\b(compliance|given|scheduled)\b/.test(text) && /\b(medication|meds|emar)\b/.test(text)) return "medication_compliance";
    if (/\b(drop|decline|decrease|down|fell|lower)\b/.test(text) && /\b(census|occupancy|headcount|population|resident count)\b/.test(text)) return "census_drop_history";
    if (findResident(content, communities) && /\b(incident|incidents|history|category|categories|awol|elopement|injury|police|sentinel)\b/.test(text)) return "resident_incident_history";
    if (/\b(current|latest|this month|month)\b/.test(text) && /\b(incident|incidents)\b/.test(text) && /\b(category|categories|type|types|breakdown|break down)\b/.test(text) && !incidentDetailIntent) return "incident_breakdown";
    if (/\b(detail|details|list|every|rows?)\b/.test(text) && /\b(census|occupancy|residents?|roster|medication|meds|emar|compliance|refusals?|documentation|doc gap|note gap)\b/.test(text) && !isResidentRosterSearchIntent(content)) return "detail_list";
    if (/\b(detail|details|list|all|every|who|resident|residents|client|clients)\b/.test(text) && /\b(incident|incidents|awol|elopement|sentinel|police|injury)\b/.test(text)) return "incident_detail_list";
    if (requestedIncidentMonths.length >= 2 && /\b(incident|incidents|awol|elopement|sentinel|police|injury)\b/.test(text)) return "compare_periods";
    if (/\b(refusal|refusals|refused|not given)\b/.test(text) && /\b(community|communities|by community|breakdown|which|top)\b/.test(text)) return "medication_refusals_by_community";
    if (medicationOrderIntent) return "medication_orders_current";
    if (medicationWatchIntent) return "medication_watch";
    if (medicationDetailIntent) return "medication_exception_detail";
    if (/\b(movement|mover|movers|change|delta|month over month|mom)\b/.test(text) && /\b(census|occupancy|headcount|population|resident count)\b/.test(text)) return "census_movement";
    if (/\b(trends?|history|historical|over time|time series|trajectory)\b/.test(text) && /\b(census|occupancy|headcount|population|resident count)\b/.test(text)) return "census_trend";
    if (isVisualIntent(content) && /\b(medication|meds|compliance|refusal|refused|not given)\b/.test(text)) return "ad_hoc_medication_chart";
    if (isVisualIntent(content) && /\b(census|occupancy|headcount|population|resident count)\b/.test(text)) return "ad_hoc_census_chart";
    if (isVisualIntent(content) && /\b(resident|residents|client|clients|los|length of stay)\b/.test(text)) return "ad_hoc_resident_list";
    if (isVisualIntent(content) && /\b(incident|incidents|awol|elopement|sentinel|police|injury|category|categories)\b/.test(text)) return "ad_hoc_incident_chart";
    if (findResident(content, communities) || /\b(resident lookup|find resident|show resident|who is|client lookup)\b/.test(text)) return "resident_lookup";
    if (medicationOrderIntent) return "medication_orders_current";
    if (medicationWatchIntent) return "medication_watch";
    if (/\b(medication|meds|emar|compliance|refusal|refused|not given|documentation|doc gap|note gap)\b/.test(text)) return "medication_profile";
    if (/\b(top|largest|leading|main)\b/.test(text) && /\b(category|categories|type|types)\b/.test(text) && /\b(each community|each facility|by community|by facility|communities|facilities)\b/.test(text) && /\b(incident|incidents)\b/.test(text)) return "top_incident_category_by_community";
    if (/\b(incident|incidents|awol|elopement|sentinel|police|injury|category|categories)\b/.test(text)) return "incident_breakdown";
    if (isResidentRosterSearchIntent(content)) return "resident_search";
    if (/\b(census|occupancy|headcount|population|resident count|movement|mover|trends?)\b/.test(text)) return "census_trend";
    const registeredAnalysisModule = resolvePlatformModuleRequest(content, { kind: "analysis" });
    if (registeredAnalysisModule?.tool) return registeredAnalysisModule.tool;
    if (facility || /\b(profile|overview|operating picture|community)\b/.test(text)) return "community_profile";
    return "community_profile";
  }

  function isExportIntent(content) {
    return /\b(export|download|csv|spreadsheet)\b/i.test(content);
  }

  function isBarePersonNameIntent(content) {
    const text = normalizeText(content);
    if (!/^[a-z][a-z'-]+(?:\s+[a-z][a-z'-]+){1,2}$/.test(text)) return false;
    if (/\b(hello|hi|hey|there|thanks|thank|please|ok|okay|cool|good|morning|afternoon|evening)\b/.test(text)) return false;
    return !/\b(community|communities|incident|incidents|census|resident|residents|client|clients|profile|search|open|show|command|center|glossary|san|pablo|santa|clarita|wallace|turlock|victoria|house|portfolio|awol|medication|refusal|service|services|assessment|assessments|note|notes)\b/.test(text);
  }

  function isAnalysisIntent(content) {
    if (isBarePersonNameIntent(content)) return true;
    return /\b(analyze|analysis|compare|comparison|average|trends?|how many|has any|have any|did any|what is|what's|what data|show|show me|break down|breakdown|break out|slice|dice|group by|available data|data slices|analytical slices|tool context|manifest|which|top|rank|count|profile|overview|lookup|find|search|who|who is|drop|decline|decrease|down|fell|lower|census|incident|incidents|awol|elopement|resident|residents|client|clients|community|communities|facility|facilities|category|categories|medication|medications|meds|emar|mar|refusal|refusals|refused|not given|missed|held|late|prn|diagnosis|diagnoses|los|length of stay|documentation|doc gap|note gap|service|services|services provided|assessment|assessments|note|notes|rate|per 100|risk|watchlist|snapshot|operationally|operating picture|chart|graph|plot|visual|visualize|module|command center|system health|admin screen|glossary)\b/i.test(content);
  }

  return {
    detectTool,
    isAnalysisIntent,
    isBarePersonNameIntent,
    isExportIntent,
    isResidentFlowIntent,
    isResidentRosterSearchIntent
  };
}

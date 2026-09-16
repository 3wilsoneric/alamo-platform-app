import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  KNOWLEDGE_CONTRACT_VERSION,
  normalizePlatformKnowledgeSearchInput
} from "../shared/knowledge-contracts.mjs";

const stateTargetingUrl = new URL("../src/features/fiftystate/data/stateTargetingData.ts", import.meta.url);
const nationalBedSupplyUrl = new URL("../src/features/fiftystate/data/research/stateBedSupply.json", import.meta.url);
const verifiedDemandUrl = new URL("../src/features/fiftystate/data/research/verifiedDemandStates.json", import.meta.url);
const buyerResearchUrl = new URL("../src/features/fiftystate/data/research/fiveStateBuyerSprint.json", import.meta.url);

const STOP_WORDS = new Set([
  "a", "about", "all", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does",
  "for", "from", "give", "has", "have", "in", "is", "it", "me", "of", "on", "or", "our",
  "show", "tell", "that", "the", "their", "there", "this", "to", "was", "were", "what", "when",
  "where", "which", "who", "with"
]);

function readJson(url) {
  return JSON.parse(readFileSync(url, "utf8"));
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function flattenText(value, output = []) {
  if (value == null) return output;
  if (["string", "number", "boolean"].includes(typeof value)) {
    output.push(String(value));
    return output;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => flattenText(entry, output));
    return output;
  }
  if (typeof value === "object") {
    Object.values(value).forEach((entry) => flattenText(entry, output));
  }
  return output;
}

function stableId(prefix, value) {
  const digest = createHash("sha256").update(String(value)).digest("hex").slice(0, 16);
  return `${prefix}-${digest}`;
}

function parseStateTargetingRows() {
  const source = readFileSync(stateTargetingUrl, "utf8");
  const marker = "const RAW_STATE_TARGETING_ROWS = ";
  const markerIndex = source.indexOf(marker);
  const start = source.indexOf("[", markerIndex + marker.length);
  const endMarker = "] as const;";
  const end = source.indexOf(endMarker, start);
  if (markerIndex < 0 || start < 0 || end < 0) {
    throw new Error("The maintained 50-state targeting dataset could not be located.");
  }
  const rows = JSON.parse(source.slice(start, end + 1));
  if (!Array.isArray(rows) || rows.length !== 50) {
    throw new Error(`Expected 50 maintained state-targeting records, found ${Array.isArray(rows) ? rows.length : 0}.`);
  }
  return rows;
}

function sourceReference({ id, label, url }) {
  const sourceUrl = String(url ?? "").trim();
  if (!sourceUrl.startsWith("https://")) return null;
  return Object.freeze({
    id: String(id ?? stableId("source", sourceUrl)),
    label: String(label ?? new URL(sourceUrl).hostname),
    url: sourceUrl
  });
}

function uniqueSources(sources) {
  const byUrl = new Map();
  for (const source of sources.filter(Boolean)) byUrl.set(source.url, source);
  return Object.freeze([...byUrl.values()]);
}

function makeRecord(record) {
  const sources = uniqueSources(record.sources ?? []);
  const searchText = normalizeText([
    record.title,
    record.summary,
    record.stateName,
    record.stateCode,
    record.region,
    record.organization,
    record.status,
    ...flattenText(record.facts),
    ...sources.flatMap((source) => [source.id, source.label, source.url])
  ].filter(Boolean).join(" "));
  return Object.freeze({
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    stateName: record.stateName ?? null,
    stateCode: record.stateCode ?? null,
    region: record.region ?? null,
    organization: record.organization ?? null,
    status: record.status ?? null,
    asOf: record.asOf ?? null,
    facts: Object.freeze(Array.isArray(record.facts) ? record.facts.map((fact) => Object.freeze({ ...fact })) : []),
    sources,
    searchText
  });
}

function demandFactRows(state, sourceById) {
  const rows = [
    {
      label: "Legal and involuntary-care pathway",
      value: [
        state.involuntary_or_conservatorship?.mechanism,
        state.involuntary_or_conservatorship?.volume == null
          ? state.involuntary_or_conservatorship?.volume_reason
          : `Reported volume: ${state.involuntary_or_conservatorship.volume}`,
        state.involuntary_or_conservatorship?.note
      ].filter(Boolean).join(". "),
      confidence: state.involuntary_or_conservatorship?.confidence,
      sourceId: state.involuntary_or_conservatorship?.source
    },
    {
      label: "State-hospital pressure",
      value: state.state_hospital_pressure?.fact ?? state.state_hospital_pressure?.reason,
      confidence: state.state_hospital_pressure?.confidence,
      sourceId: state.state_hospital_pressure?.source
    },
    {
      label: "Placement bottleneck",
      value: state.placement_bottleneck?.fact ?? state.placement_bottleneck?.reason,
      confidence: state.placement_bottleneck?.confidence,
      sourceId: state.placement_bottleneck?.source
    },
    {
      label: "Step-down visibility",
      value: state.step_down_registry?.exists ?? state.step_down_registry?.fact ?? state.step_down_registry?.reason,
      confidence: state.step_down_registry?.confidence,
      sourceId: state.step_down_registry?.source
    }
  ].filter((row) => row.value);

  return {
    facts: rows,
    sources: rows.map((row) => sourceById.get(row.sourceId)).filter(Boolean)
  };
}

function normalizeSourceUrls(value) {
  return (Array.isArray(value) ? value : [value])
    .map((entry) => String(entry ?? "").trim())
    .filter((entry) => entry.startsWith("https://"));
}

function targetBuyers(target) {
  return [
    ...(Array.isArray(target.buyers) ? target.buyers : []),
    ...(target.buyer ? [target.buyer] : [])
  ].map(String).filter(Boolean);
}

function targetOpportunities(target) {
  const procurement = target.procurement
    ? Array.isArray(target.procurement) ? target.procurement : [target.procurement]
    : [];
  const rows = procurement.map((entry) => ({
    title: entry.name ?? `Procurement in ${target.county_or_region}`,
    identifier: entry.identifier ?? null,
    status: entry.status ?? "not_publicly_located",
    detail: entry
  }));
  if (target.procurement_and_funding) {
    rows.push({
      title: `Funding and procurement in ${target.county_or_region}`,
      identifier: null,
      status: target.procurement_and_funding.recent_rfp_status ?? "not_publicly_located",
      detail: target.procurement_and_funding
    });
  }
  if (target.recent_precedent) {
    rows.push({
      title: `${target.recent_precedent.provider}: ${target.recent_precedent.service}`,
      identifier: null,
      status: "recent_precedent",
      detail: target.recent_precedent
    });
  }
  return rows;
}

function buildCatalog() {
  const targetingRows = parseStateTargetingRows();
  const nationalBeds = readJson(nationalBedSupplyUrl);
  const verifiedDemand = readJson(verifiedDemandUrl);
  const buyerResearch = readJson(buyerResearchUrl);
  const bedByCode = new Map(nationalBeds.states.filter((state) => state.abbr !== "DC").map((state) => [state.abbr, state]));
  const targetingByState = new Map(targetingRows.map((state) => [state.stateName, state]));
  const codeByState = new Map(targetingRows.map((state) => [state.stateName, state.stateCode]));
  const demandSourceById = new Map((verifiedDemand.sources ?? []).map((source) => [
    source.id,
    sourceReference({ id: source.id, label: source.id, url: source.url })
  ]));
  demandSourceById.set(
    "Beckers-beds (full TAC 2023 table)",
    sourceReference({ id: "national-state-bed-supply", label: nationalBeds.source.name, url: nationalBeds.source.url })
  );
  const nationalSource = sourceReference({
    id: "national-state-bed-supply",
    label: nationalBeds.source.name,
    url: nationalBeds.source.url
  });
  const records = [];

  for (const state of targetingRows) {
    const bed = bedByCode.get(state.stateCode);
    const bedFact = bed
      ? `${bed.state_psych_beds_per_100k} state-operated psychiatric beds per 100,000 (${nationalBeds.as_of})`
      : "No national bed-supply baseline loaded";
    records.push(makeRecord({
      id: `state-${state.stateCode.toLowerCase()}`,
      kind: "state_profile",
      title: `${state.stateName} behavioral-health market profile`,
      summary: `${state.primaryTarget}. ${state.decisionConcentration}`,
      stateName: state.stateName,
      stateCode: state.stateCode,
      organization: state.stateAuthority,
      asOf: nationalBeds.as_of,
      facts: [
        { label: "Governance", value: state.governanceBucket },
        { label: "State authority", value: state.stateAuthority },
        { label: "Primary target", value: state.primaryTarget },
        { label: "Target universe", value: state.targetUniverse },
        { label: "Research focus", value: state.researchPitch },
        { label: "Bed supply", value: bedFact }
      ],
      sources: nationalSource ? [nationalSource] : []
    }));
  }

  for (const state of verifiedDemand.states ?? []) {
    const { facts, sources } = demandFactRows(state, demandSourceById);
    const targeting = targetingByState.get(state.state);
    records.push(makeRecord({
      id: `demand-${state.abbr.toLowerCase()}`,
      kind: "demand_evidence",
      title: `${state.state} verified demand evidence`,
      summary: state.why_ranked_here,
      stateName: state.state,
      stateCode: state.abbr,
      organization: targeting?.stateAuthority,
      asOf: verifiedDemand.as_of,
      facts: [
        { label: "Research priority", value: state.rank },
        { label: "State-operated bed supply", value: state.state_psych_beds_per_100k?.value },
        ...facts
      ],
      sources: [
        demandSourceById.get(state.state_psych_beds_per_100k?.source),
        ...sources
      ]
    }));
  }

  const buyerTargetLookup = [];
  for (const [stateName, state] of Object.entries(buyerResearch.states ?? {})) {
    const stateCode = codeByState.get(stateName) ?? null;
    const sourceUrls = normalizeSourceUrls(buyerResearch.sources?.[stateName]);
    const sources = sourceUrls.map((url, index) => sourceReference({
      id: `buyer-${String(stateCode ?? stateName).toLowerCase()}-${index + 1}`,
      label: new URL(url).hostname,
      url
    }));

    for (const target of state.priority_targets ?? []) {
      const buyers = targetBuyers(target);
      const leaders = (target.leadership ?? []).map((leader) => `${leader.name} — ${leader.title}`);
      const opportunities = targetOpportunities(target);
      const targetId = stableId("buyer-target", `${stateName}:${target.county_or_region}`);
      buyerTargetLookup.push({ stateName, stateCode, region: target.county_or_region, targetId, sources });
      records.push(makeRecord({
        id: targetId,
        kind: "buyer_target",
        title: `${target.county_or_region} buyer route`,
        summary: target.alamo_pitch,
        stateName,
        stateCode,
        region: target.county_or_region,
        organization: buyers.join("; ") || null,
        asOf: buyerResearch.verified_as_of,
        facts: [
          { label: "Buyers", value: buyers.join("; ") },
          { label: "Buyer role", value: target.buyer_role ?? target.buyer_logic ?? null },
          { label: "Leadership", value: leaders.join("; ") },
          { label: "Demand", value: flattenText(target.demand).join("; ") },
          { label: "Opportunity status", value: opportunities.map((entry) => entry.status).join("; ") },
          { label: "Barriers", value: flattenText(target.barriers).join("; ") }
        ],
        sources
      }));

      for (const opportunity of opportunities) {
        records.push(makeRecord({
          id: stableId("opportunity", `${targetId}:${opportunity.title}:${opportunity.identifier ?? ""}`),
          kind: "opportunity",
          title: opportunity.title,
          summary: [opportunity.identifier, target.alamo_pitch].filter(Boolean).join(". "),
          stateName,
          stateCode,
          region: target.county_or_region,
          organization: buyers.join("; ") || null,
          status: opportunity.status,
          asOf: buyerResearch.verified_as_of,
          facts: [{ label: "Public opportunity record", value: flattenText(opportunity.detail).join("; ") }],
          sources
        }));
      }
    }
  }

  for (const opportunity of buyerResearch.executive_conclusion?.live_opportunity_watch ?? []) {
    const lookup = buyerTargetLookup.find((target) => {
      const normalizedTarget = normalizeText(opportunity.target);
      return normalizeText(target.region).includes(normalizedTarget) || normalizedTarget.includes(normalizeText(target.region));
    });
    records.push(makeRecord({
      id: stableId("opportunity-watch", `${opportunity.target}:${opportunity.opportunity}`),
      kind: "opportunity",
      title: opportunity.opportunity,
      summary: `${opportunity.target}. ${opportunity.fit}`,
      stateName: lookup?.stateName ?? null,
      stateCode: lookup?.stateCode ?? null,
      region: opportunity.target,
      status: opportunity.status,
      asOf: buyerResearch.verified_as_of,
      facts: [{ label: "Timing", value: opportunity.deadline ?? opportunity.window ?? null }],
      sources: lookup?.sources ?? []
    }));
  }

  const uniqueRecords = new Map(records.map((record) => [record.id, record]));
  if (uniqueRecords.size !== records.length) throw new Error("Platform knowledge catalog contains duplicate record identifiers.");
  return Object.freeze([...uniqueRecords.values()]);
}

const catalog = buildCatalog();
const stateAliases = new Map();
for (const record of catalog.filter((entry) => entry.kind === "state_profile")) {
  stateAliases.set(normalizeText(record.stateName), record.stateCode);
  stateAliases.set(normalizeText(record.stateCode), record.stateCode);
}

function queryTokens(query) {
  return [...new Set(normalizeText(query).split(" ").filter((token) => token.length >= 2 && !STOP_WORDS.has(token)))];
}

function normalizedStateCode(value) {
  const normalized = normalizeText(value);
  return normalized ? stateAliases.get(normalized) ?? null : null;
}

function scoreRecord(record, normalizedQuery, tokens) {
  if (!normalizedQuery && !tokens.length) return 1;
  const title = normalizeText(record.title);
  const summary = normalizeText(record.summary);
  let score = 0;
  if (title === normalizedQuery) score += 120;
  else if (title.includes(normalizedQuery)) score += 70;
  if (summary.includes(normalizedQuery)) score += 35;
  if (normalizeText(record.stateName) === normalizedQuery || normalizeText(record.stateCode) === normalizedQuery) score += 90;
  if (normalizeText(record.region).includes(normalizedQuery)) score += 55;
  if (normalizeText(record.organization).includes(normalizedQuery)) score += 45;
  if (normalizeText(record.status) === normalizedQuery) score += 30;

  let matchedTokens = 0;
  for (const token of tokens) {
    if (!record.searchText.includes(token)) continue;
    matchedTokens += 1;
    if (title.includes(token)) score += 14;
    else if (normalizeText(record.stateName).includes(token) || normalizeText(record.stateCode) === token) score += 12;
    else if (normalizeText(record.region).includes(token) || normalizeText(record.organization).includes(token)) score += 9;
    else score += 3;
  }
  if (tokens.length && matchedTokens === tokens.length) score += 30;
  else if (tokens.length && matchedTokens / tokens.length >= 0.5) score += 8;
  return score;
}

function publicRecord(record, score) {
  return {
    id: record.id,
    kind: record.kind,
    title: record.title,
    summary: record.summary,
    stateName: record.stateName,
    stateCode: record.stateCode,
    region: record.region,
    organization: record.organization,
    status: record.status,
    asOf: record.asOf,
    score,
    facts: record.facts,
    sources: record.sources
  };
}

export function getPlatformKnowledgeCoverage() {
  const count = (kind) => catalog.filter((record) => record.kind === kind).length;
  return Object.freeze({
    states: count("state_profile"),
    verifiedDemandStates: count("demand_evidence"),
    buyerTargets: count("buyer_target"),
    opportunities: count("opportunity"),
    totalRecords: catalog.length
  });
}

export function searchPlatformKnowledge(input = {}) {
  const filters = normalizePlatformKnowledgeSearchInput(input);
  const normalizedQuery = normalizeText(filters.query);
  const tokens = queryTokens(filters.query);
  const stateCode = normalizedStateCode(filters.state);
  const requestedStatus = normalizeText(filters.status);
  const requestedKinds = new Set(filters.kinds);
  const ranked = catalog
    .filter((record) => !stateCode || record.stateCode === stateCode)
    .filter((record) => !requestedStatus || normalizeText(record.status) === requestedStatus)
    .filter((record) => !requestedKinds.size || requestedKinds.has(record.kind))
    .map((record) => ({ record, score: scoreRecord(record, normalizedQuery, tokens) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.record.title.localeCompare(right.record.title));

  return {
    version: KNOWLEDGE_CONTRACT_VERSION,
    source: "maintained-platform-research",
    query: filters.query,
    filters: {
      state: stateCode,
      status: filters.status,
      kinds: filters.kinds
    },
    total: ranked.length,
    results: ranked.slice(0, filters.limit).map(({ record, score }) => publicRecord(record, score)),
    coverage: getPlatformKnowledgeCoverage()
  };
}

export function getPlatformKnowledgeRecord(recordId) {
  const record = catalog.find((entry) => entry.id === String(recordId ?? "").trim());
  return record ? publicRecord(record, 0) : null;
}

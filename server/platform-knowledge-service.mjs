import {
  KNOWLEDGE_CONTRACT_VERSION,
  normalizePlatformKnowledgeSearchInput
} from "../shared/knowledge-contracts.mjs";
import {
  getPlatformKnowledgeCoverage,
  getPlatformKnowledgeRecord,
  searchPlatformKnowledge
} from "./platform-knowledge-catalog.mjs";
import { getDefaultPlatformKnowledgeStore } from "./platform-knowledge-store.mjs";

function mergeCoverage(seed, local) {
  return {
    seed,
    local,
    totalSearchableRecords:
      seed.totalRecords + local.sources + local.documents + local.approvedAssertions + local.publishedNotes
  };
}

export async function getPlatformKnowledgeBaseOverview() {
  const store = getDefaultPlatformKnowledgeStore();
  return {
    version: KNOWLEDGE_CONTRACT_VERSION,
    name: "Alamo Platform knowledge base",
    currentReadModel: "repository-seed-plus-local-file-store",
    localWriteModel: "single-process-serialized-atomic-writes",
    productionPersistence: "azure-target-not-yet-enabled",
    archiveModel: "content-addressed-immutable-artifacts",
    canonicalBoundary: "approved assertions only",
    coverage: mergeCoverage(getPlatformKnowledgeCoverage(), await store.getSummary())
  };
}

export async function searchPlatformKnowledgeBase(input = {}, options = {}) {
  const filters = normalizePlatformKnowledgeSearchInput(input);
  const expandedInput = { ...filters, limit: 25 };
  const seed = searchPlatformKnowledge(expandedInput);
  const local = await getDefaultPlatformKnowledgeStore().search(expandedInput, options);
  const ranked = [...seed.results, ...local.results]
    .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0) || left.title.localeCompare(right.title));
  return {
    version: KNOWLEDGE_CONTRACT_VERSION,
    source: "alamo-platform-knowledge-base",
    query: filters.query,
    filters: {
      state: filters.state,
      status: filters.status,
      kinds: filters.kinds
    },
    total: seed.total + local.total,
    results: ranked.slice(0, filters.limit),
    coverage: mergeCoverage(seed.coverage, local.coverage)
  };
}

export async function getPlatformKnowledgeBaseRecord(recordId, options = {}) {
  return getPlatformKnowledgeRecord(recordId) ?? getDefaultPlatformKnowledgeStore().getRecord(recordId, options);
}

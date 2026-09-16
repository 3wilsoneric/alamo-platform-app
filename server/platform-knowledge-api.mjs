import { KNOWLEDGE_CONTRACT_VERSION } from "../shared/knowledge-contracts.mjs";
import { createHttpError } from "./http-errors.mjs";
import {
  getPlatformKnowledgeBaseOverview,
  getPlatformKnowledgeBaseRecord,
  searchPlatformKnowledgeBase
} from "./platform-knowledge-service.mjs";

export async function getPlatformKnowledgeOverview() {
  return getPlatformKnowledgeBaseOverview();
}

export async function getPlatformKnowledgeSearchResponse(requestUrl) {
  const search = await searchPlatformKnowledgeBase({
    q: requestUrl.searchParams.get("q") ?? "",
    state: requestUrl.searchParams.get("state"),
    status: requestUrl.searchParams.get("status"),
    kind: requestUrl.searchParams.getAll("kind"),
    limit: requestUrl.searchParams.get("limit")
  });

  if (
    !search.query &&
    !search.filters.state &&
    !search.filters.status &&
    !search.filters.kinds.length
  ) {
    throw createHttpError(
      400,
      "platform_knowledge_search_empty",
      "Knowledge search requires q, state, status, or kind."
    );
  }

  return search;
}

export async function getPlatformKnowledgeRecordResponse(requestUrl) {
  const recordId = String(requestUrl.searchParams.get("id") ?? "").trim();
  if (!recordId) {
    throw createHttpError(
      400,
      "platform_knowledge_record_id_missing",
      "Knowledge record lookup requires id."
    );
  }

  const record = await getPlatformKnowledgeBaseRecord(recordId);
  if (!record) {
    throw createHttpError(
      404,
      "platform_knowledge_record_not_found",
      "Knowledge record was not found."
    );
  }
  return {
    version: KNOWLEDGE_CONTRACT_VERSION,
    source: "alamo-platform-knowledge-base",
    record
  };
}

import { createHttpError } from "./http-errors.mjs";

const PLATFORM_KNOWLEDGE_OWNER_OBJECT_IDS = new Set([
  "f73371d5-d2b4-48b4-a32b-1edc7c88869f"
]);

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function hiddenNotFound() {
  return createHttpError(404, "not_found", "Not found.");
}

export function assertPlatformKnowledgeOwner(authContext, options = {}) {
  if (authContext?.authenticated === false && authContext?.mode === "explicit-development-bypass") {
    return;
  }

  const ownerObjectId = normalize(options.ownerObjectId ?? process.env.PLATFORM_KNOWLEDGE_OWNER_OBJECT_ID);
  const ownerEmail = normalize(options.ownerEmail ?? process.env.PLATFORM_KNOWLEDGE_OWNER_EMAIL);
  if (!ownerObjectId && !ownerEmail && PLATFORM_KNOWLEDGE_OWNER_OBJECT_IDS.size === 0) {
    throw hiddenNotFound();
  }

  const claims = authContext?.claims ?? {};
  const objectId = normalize(claims.oid);
  const emails = [claims.preferred_username, claims.email, claims.upn]
    .map(normalize)
    .filter(Boolean);
  const objectIdMatches = Boolean(
    objectId && (
      PLATFORM_KNOWLEDGE_OWNER_OBJECT_IDS.has(objectId) ||
      (ownerObjectId && objectId === ownerObjectId)
    )
  );
  const emailMatches = Boolean(ownerEmail && emails.includes(ownerEmail));
  if (!objectIdMatches && !emailMatches) throw hiddenNotFound();
}

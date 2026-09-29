import { createHttpError } from "./http-errors.mjs";
import { hasPlatformOwnerAccess } from "../shared/platform-owner-access.mjs";

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
  const claims = authContext?.claims ?? {};
  const objectId = normalize(claims.oid);
  const emails = [claims.preferred_username, claims.email, claims.upn]
    .map(normalize)
    .filter(Boolean);
  const objectIdMatches = Boolean(
    hasPlatformOwnerAccess(claims) ||
    (ownerObjectId && objectId === ownerObjectId)
  );
  const emailMatches = Boolean(ownerEmail && emails.includes(ownerEmail));
  if (!objectIdMatches && !emailMatches) throw hiddenNotFound();
}

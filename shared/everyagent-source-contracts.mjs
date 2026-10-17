export const AGENT_SOURCE_PATH = "/api/platform/agent-source/v1";
export const AGENT_SOURCE_MAX_BYTES = 2_200_000;
const uuid = value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);
const invalid = () => { throw new Error("Invalid agent source request."); };

export function validateAgentSourceRequest(value) {
  if (!value || value.version !== 1 || !["read", "authorize"].includes(value.operation) ||
      !uuid(value.subjectId) || !["licensing", "admissions-watch"].includes(value.skillId) ||
      Object.keys(value).some(key => !["version", "operation", "subjectId", "skillId", "communityIds"].includes(key)) ||
      !Array.isArray(value.communityIds) || value.communityIds.length > 20 ||
      !value.communityIds.every(id => typeof id === "string" && /^\d{1,12}$/.test(id)) ||
      new Set(value.communityIds).size !== value.communityIds.length ||
      (value.skillId === "licensing" ? !value.communityIds.length : value.communityIds.length !== 0)) invalid();
  return { version: 1, operation: value.operation, subjectId: value.subjectId, skillId: value.skillId, communityIds: [...value.communityIds].sort() };
}

export function validateAgentSourceGrant(value) {
  if (!value || value.application !== "platform" || typeof value.id !== "string" || !/^[a-z0-9-]{1,80}$/.test(value.id) ||
      typeof value.revision !== "string" || !/^[a-f0-9]{64}$/.test(value.revision) ||
      typeof value.expiresAt !== "string" || value.expiresAt.length > 40 || !Number.isFinite(Date.parse(value.expiresAt))) invalid();
  return { application: "platform", id: value.id, revision: value.revision, expiresAt: value.expiresAt };
}

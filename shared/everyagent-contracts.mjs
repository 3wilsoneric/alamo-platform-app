export const EVERYAGENT_VERSION = 1;

// Only personal monitoring settings and review receipts can be mutated here.
// Application commands and outbound communications are not exposed.
export function validateEveryAgentCommand(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a valid EveryAgent action.");
  if (value.action === "review" && Object.keys(value).every(key => ["action", "workId"].includes(key)) &&
      typeof value.workId === "string" && /^[a-f0-9]{32}$/.test(value.workId)) return { action: "review", workId: value.workId };
  if (value.action === "configure" && Object.keys(value).every(key => ["action", "skillId", "paused", "communityIds", "expectedVersion"].includes(key)) &&
      typeof value.skillId === "string" && value.skillId.length < 80 && typeof value.paused === "boolean" &&
      Number.isInteger(value.expectedVersion) && value.expectedVersion >= 0 &&
      Array.isArray(value.communityIds) && value.communityIds.length <= 20 &&
      value.communityIds.every(id => typeof id === "string" && /^\d{1,12}$/.test(id)) &&
      new Set(value.communityIds).size === value.communityIds.length) {
    return { action: "configure", skillId: value.skillId, paused: value.paused,
      communityIds: value.communityIds, expectedVersion: value.expectedVersion };
  }
  throw new Error("Choose a valid EveryAgent action.");
}

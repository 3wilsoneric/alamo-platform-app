export const AGENT_CONVERSATIONS_PATH = "/api/agent/v1/conversations";
export const conversationId = value => typeof value === "string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(value);

export function validateConversationCommand(value) {
  const invalid = () => { throw new Error("Invalid conversation command."); };
  if (!value || !["create", "send", "cancel"].includes(value.action)) invalid();
  const fields = value.action === "create" ? ["action", "requestId", "skillIds", "workId"] : value.action === "send"
    ? ["action", "requestId", "conversationId", "text", "expectedVersion"] : ["action", "conversationId", "turnId"];
  if (Object.keys(value).some(key => !fields.includes(key))) invalid();
  if (value.action === "create") {
    if (!conversationId(value.requestId) || !Array.isArray(value.skillIds) || !value.skillIds.length || value.skillIds.length > 2 ||
        new Set(value.skillIds).size !== value.skillIds.length || value.skillIds.some(id => !["licensing", "admissions-watch"].includes(id)) ||
        (value.workId !== undefined && (typeof value.workId !== "string" || !/^[\w-]{1,200}$/.test(value.workId)))) invalid();
    return { action: value.action, requestId: value.requestId, skillIds: [...value.skillIds].sort(), workId: value.workId ?? null };
  }
  if (!conversationId(value.conversationId)) invalid();
  if (value.action === "cancel") {
    if (!conversationId(value.turnId)) invalid();
    return { action: value.action, conversationId: value.conversationId, turnId: value.turnId };
  }
  if (!conversationId(value.requestId) || typeof value.text !== "string" || !value.text.trim() || value.text.length > 4000 ||
      !Number.isSafeInteger(value.expectedVersion) || value.expectedVersion < 0) invalid();
  return { action: value.action, requestId: value.requestId, conversationId: value.conversationId, text: value.text.trim(), expectedVersion: value.expectedVersion };
}

export function createConversationClient(requestJson) {
  return {
    list: (signal) => requestJson(AGENT_CONVERSATIONS_PATH, { signal, cache: "no-store" }),
    read: (id, signal) => requestJson(`${AGENT_CONVERSATIONS_PATH}?id=${encodeURIComponent(id)}`, { signal, cache: "no-store" }),
    command: input => requestJson(AGENT_CONVERSATIONS_PATH, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) })
  };
}

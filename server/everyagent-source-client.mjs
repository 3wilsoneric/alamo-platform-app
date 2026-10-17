import { AGENT_SOURCE_PATH, AGENT_SOURCE_MAX_BYTES, validateAgentSourceGrant, validateAgentSourceRequest } from "../shared/everyagent-source-contracts.mjs";
import { validateEveryAgentWorkflowResult } from "./everyagent-workflow-validation.mjs";

async function boundedJson(response) {
  if (!response.ok || !/^application\/json\b/i.test(response.headers.get("content-type") ?? "") ||
      Number(response.headers.get("content-length")) > AGENT_SOURCE_MAX_BYTES) {
    await response.body?.cancel(); throw new Error("Source connector response was unavailable.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Source connector returned no response.");
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      length += value.byteLength;
      if (length > AGENT_SOURCE_MAX_BYTES) throw new Error("Source connector response was too large.");
      chunks.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export function createEveryAgentSourceClient({ origin, getToken, fetchImpl = fetch, now = () => Date.now() }) {
  const base = new URL(origin);
  if (base.protocol !== "https:" || base.origin !== origin || base.hostname.includes("*") || typeof getToken !== "function") throw new Error("Configure an exact HTTPS source origin and token provider.");
  async function request(assignment, operation) {
    const input = validateAgentSourceRequest({ version: 1, operation, subjectId: assignment.userId, skillId: assignment.skillId, communityIds: assignment.communityIds });
    try {
      const token = await getToken();
      if (!token || typeof token.token !== "string" || !token.token || token.token.length > 16_000 ||
          !Number.isFinite(token.expiresOnTimestamp) || token.expiresOnTimestamp <= now()) throw new Error("Expired token.");
      const response = await fetchImpl(new URL(AGENT_SOURCE_PATH, base), { method: "POST", redirect: "error", cache: "no-store",
        signal: AbortSignal.timeout(10_000), headers: { Authorization: `Bearer ${token.token}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
      const envelope = await boundedJson(response);
      if (JSON.stringify(validateAgentSourceRequest(Object.fromEntries(Object.keys(input).map(key => [key, envelope[key]])))) !== JSON.stringify(input)) throw new Error("Mismatched source response.");
      const grant = validateAgentSourceGrant(envelope.grant);
      if (Date.parse(grant.expiresAt) <= now()) throw new Error("Expired source grant.");
      return { grant, result: operation === "read" ? validateEveryAgentWorkflowResult(envelope.result, assignment) : null };
    } catch { throw new Error("Source access could not be verified. Previous results are retained."); }
  }
  async function authorize(assignment, expected = /** @type {ReturnType<typeof validateAgentSourceGrant> | null} */ (null)) {
    const { grant } = await request(assignment, "authorize");
    if (expected && (expected.id !== grant.id || expected.revision !== grant.revision)) throw new Error("Source access changed during this run.");
    return grant;
  }
  const read = async assignment => { const { grant, result } = await request(assignment, "read"); return { ...result, sourceGrant: grant }; };
  return { authorize, adapters: { licensing: read, "admissions-watch": read } };
}

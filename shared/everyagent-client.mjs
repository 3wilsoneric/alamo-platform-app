export const EVERYAGENT_API_PATH = "/api/agent/v1/work";

// Authentication, response bounds and token audience are owned by the host's
// transport. No ambient Platform token or browser state is assumed here.
export function createEveryAgentClient({ requestJson, endpoint = EVERYAGENT_API_PATH }) {
  if (typeof requestJson !== "function") throw new Error("An authenticated agent transport is required.");
  return {
    read(signal) { return requestJson(endpoint, { signal, cache: "no-store" }); },
    command(command) { return requestJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) }); }
  };
}

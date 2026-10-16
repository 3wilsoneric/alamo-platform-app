import { fetchWithApiAuth, readBoundedJsonResponse } from "../../shared/api/authenticatedFetch";
import type { EveryAgentCommand, EveryAgentOverview } from "../../../shared/everyagent-contracts.mjs";

export function readEveryAgent(signal: AbortSignal) {
  return request({ signal, cache: "no-store" });
}
export function updateEveryAgent(command: EveryAgentCommand) {
  return request({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command) });
}
function request(init: RequestInit) {
  return fetchWithApiAuth("/api/platform/everyagent", init, { consume: async response => {
    if (!response.ok) throw new Error(response.status === 409 ? "These settings changed. Refresh before saving again." : "EveryAgent could not complete this request. Try again.");
    return readBoundedJsonResponse<EveryAgentOverview>(response, 8 * 1024 * 1024);
  } });
}

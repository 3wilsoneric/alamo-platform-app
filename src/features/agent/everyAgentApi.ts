import { fetchWithApiAuth, readBoundedJsonResponse } from "../../shared/api/authenticatedFetch";
import type { EveryAgentCommand, EveryAgentOverview } from "../../../shared/everyagent-contracts.mjs";
import { createEveryAgentClient } from "../../../shared/everyagent-client.mjs";

// Keep the current host facade until the independent service is deployed.
const client = createEveryAgentClient({ endpoint: "/api/platform/everyagent", requestJson: request });

export function readEveryAgent(signal: AbortSignal) {
  return client.read(signal);
}
export function updateEveryAgent(command: EveryAgentCommand) {
  return client.command(command);
}
function request(endpoint: string, init: RequestInit) {
  return fetchWithApiAuth(endpoint, init, { consume: async response => {
    if (!response.ok) throw new Error(response.status === 409 ? "These settings changed. Refresh before saving again." : "This request could not be completed. Try again.");
    return readBoundedJsonResponse<EveryAgentOverview>(response, 8 * 1024 * 1024);
  } });
}

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
    const overview = await readBoundedJsonResponse<EveryAgentOverview>(response, 8 * 1024 * 1024);
    // This transport belongs to Platform. Keep its own evidence navigation
    // local while the independent API supplies portable links to other hosts.
    const local = (href: string) => href.startsWith("https://www.alamoplatform.com/")
      ? href.slice("https://www.alamoplatform.com".length) : href;
    return { ...overview, skills: overview.skills.map(skill => ({ ...skill, href: local(skill.href) })),
      work: overview.work.map(item => ({ ...item, evidence: item.evidence.map(evidence => ({ ...evidence, href: local(evidence.href) })) })) };
  } });
}

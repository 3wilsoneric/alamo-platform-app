import type { EveryAgentCommand, EveryAgentOverview } from "./everyagent-contracts.mjs";
export const EVERYAGENT_API_PATH: string;
export function createEveryAgentClient(options: {
  endpoint?: string;
  requestJson: (endpoint: string, init: RequestInit) => Promise<EveryAgentOverview>;
}): {
  read(signal?: AbortSignal): Promise<EveryAgentOverview>;
  command(command: EveryAgentCommand): Promise<EveryAgentOverview>;
};

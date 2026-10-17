export interface AgentBranding {
  readonly name: string;
  readonly mark: string;
  readonly variant: "alamo" | "wilson";
}
export function agentBrandingFor(claims: unknown): AgentBranding;

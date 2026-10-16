export interface EveryAgentSkill {
  id: string; version: number; title: string; application: string; applicationName: string;
  capability: string; responsibility: string; description: string; cadence: string;
  scope: string; communities: { id: string; name: string }[]; href: string; actions: string[];
}
export const EVERYAGENT_TENANT: string;
export const EVERYAGENT_USERS: readonly string[];
export const EVERYAGENT_SKILLS: readonly EveryAgentSkill[];
export function everyAgentSkillsFor(claims: unknown): EveryAgentSkill[];

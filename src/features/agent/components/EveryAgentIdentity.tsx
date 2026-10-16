import { useMsal } from "@azure/msal-react";
import type { EveryAgentOverview } from "../../../../shared/everyagent-contracts.mjs";

export function EveryAgentOrb({ small = false }: { small?: boolean }) {
  return <span className={`everyagent-orb${small ? " everyagent-orb--small" : ""}`} aria-hidden="true"><span /><span /><span /></span>;
}

export function useAgentGreeting() {
  const { accounts, instance } = useMsal();
  const account = instance.getActiveAccount() ?? accounts[0];
  const name = account?.idTokenClaims?.given_name ?? account?.name;
  return typeof name === "string" && name.trim() ? `Hello, ${name.trim()}.` : "Hello there.";
}

export function agentIntroduction(data: EveryAgentOverview | null) {
  if (!data) return "I’m your assistant across Alamo. Let me bring up the work I’m watching for you.";
  const names = data.skills.map(skill => skill.id === "admissions-watch" ? "Admissions" : skill.title);
  const skills = names.length > 1 ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names[0];
  return skills ? `I’m your assistant across Alamo. I bring you changes from ${skills}, with the sources ready to open. You decide what’s next.` : "I’m your assistant across Alamo. Your connected skills will appear here.";
}

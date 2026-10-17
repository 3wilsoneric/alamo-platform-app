import { LICENSING_COMMUNITIES } from "./licensing-communities.mjs";
import { hasLicensingAccess } from "./licensing-access.mjs";

import { hasEveryAgentAccess } from "./everyagent-identity.mjs";
export { EVERYAGENT_TENANT, EVERYAGENT_USERS } from "./everyagent-identity.mjs";

export const EVERYAGENT_SKILLS = Object.freeze([
  { id: "licensing", version: 1, title: "Licensing", application: "platform", applicationName: "Alamo Platform",
    capability: "licensing.published-reports.read", responsibility: "Watch state licensing reports",
    description: "Collect changes from the state-report library and keep source-linked reports ready to review.",
    cadence: "Library checked every 15 minutes · state collection Mon & Wed, 9 a.m. Pacific",
    scope: "community", communities: LICENSING_COMMUNITIES.map(({ facilityId, name }) => ({ id: facilityId, name })),
    href: "/analytics/agent?skill=licensing", actions: ["read", "summarize", "review"] },
  { id: "admissions-watch", version: 1, title: "Admissions watch", application: "pipeline", applicationName: "Pipeline",
    capability: "pipeline.admissions-summary.read", responsibility: "Watch admissions activity",
    description: "Watch published referral totals and follow-up counts from Pipeline. Open the admissions board for details.",
    cadence: "Published summary checked every 15 minutes", scope: "organization", communities: [],
    href: "/admissions", actions: ["read", "summarize", "review"] }
]);

export function everyAgentSkillsFor(claims) {
  if (!hasEveryAgentAccess(claims)) return [];
  // Application permissions constrain their own skills, never agent identity.
  return EVERYAGENT_SKILLS.filter(skill => skill.id !== "licensing" || hasLicensingAccess(claims));
}

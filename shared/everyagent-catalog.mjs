import { LICENSING_COMMUNITIES } from "./licensing-contracts.mjs";
import { hasLicensingAccess } from "./licensing-access.mjs";

export const EVERYAGENT_TENANT = "d72d9036-cff8-4f5f-a6fa-d698f621d420";
// Eric-only preview. Worker authorization is resolved from this same policy,
// never from stored browser tokens, email addresses, or client-supplied roles.
export const EVERYAGENT_USERS = Object.freeze([
  "f73371d5-d2b4-48b4-a32b-1edc7c88869f"
]);

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
  if (!hasLicensingAccess(claims) || !EVERYAGENT_USERS.includes(String(claims.oid).toLowerCase())) return [];
  return [...EVERYAGENT_SKILLS];
}

import { EVERYAGENT_TENANT, everyAgentSkillsFor } from "../shared/everyagent-catalog.mjs";
import { createHttpError } from "./http-errors.mjs";

const hidden = () => createHttpError(404, "not_found", "Not found.");
export const grantFor = userId => everyAgentSkillsFor({ tid: EVERYAGENT_TENANT, oid: userId });
export function everyAgentActor(auth) {
  if (auth?.authenticated !== true || auth.mode !== "entra-delegated" || !everyAgentSkillsFor(auth.claims).length) throw hidden();
  return String(auth.claims.oid).toLowerCase();
}
export function freshAssignment(userId, skill) {
  return { userId, skillId: skill.id, version: 0, paused: false, communityIds: skill.communities.map(c => c.id),
    lastChecked: null, sourceCheckedAt: null, nextCheck: null, connection: "not_checked", issue: null, cursor: null };
}
export function scopeAllows(item, assignment) {
  return item.communityIds.every(id => assignment.communityIds.includes(id));
}
export function allowedAssignment(assignment) {
  const skill = grantFor(assignment.userId).find(item => item.id === assignment.skillId);
  return Boolean(skill && (skill.scope !== "community" || assignment.communityIds.length) &&
    assignment.communityIds.every(id => skill.communities.some(c => c.id === id)));
}

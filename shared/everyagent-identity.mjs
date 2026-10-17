export const EVERYAGENT_TENANT = "d72d9036-cff8-4f5f-a6fa-d698f621d420";
export const EVERYAGENT_USERS = Object.freeze(["f73371d5-d2b4-48b4-a32b-1edc7c88869f"]);

// Pilot access is independent of any application role. Connectors still apply
// their own permission checks; adding an app must not activate more users.
export function hasEveryAgentAccess(claims) {
  return Boolean(claims && typeof claims === "object" &&
    typeof claims.tid === "string" && claims.tid.toLowerCase() === EVERYAGENT_TENANT &&
    typeof claims.oid === "string" && EVERYAGENT_USERS.includes(claims.oid.toLowerCase()));
}

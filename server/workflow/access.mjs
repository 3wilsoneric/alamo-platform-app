import { hasPlatformOwnerAccess } from "../../shared/platform-owner-access.mjs";
import { fail } from "./model.mjs";

export function workflowContext(auth, grantsJson) {
  if (auth?.authenticated !== true || auth.mode !== "entra-delegated" || !auth.claims?.scp) fail(401, "workflow_auth_required", "Verified delegated sign-in is required for Workflow.");
  // Keep the existing owner-only product gate, even if another identity has a grant.
  if (!hasPlatformOwnerAccess(auth.claims)) fail(404, "not_found", "Not found.");
  const { tid, oid } = auth.claims;
  const guid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
  if (typeof tid !== "string" || typeof oid !== "string" || !guid.test(tid) || !guid.test(oid)) fail(403, "workflow_identity_incomplete", "A tenant and object ID are required.");
  const allowed = ["read", "contribute", "review", "publish"];
  let permissions = allowed;
  if (grantsJson) {
    let grants;
    try { grants = JSON.parse(grantsJson); } catch { fail(503, "workflow_grants_invalid", "Workflow grants are not configured correctly."); }
    const assigned = grants?.[`${tid.toLowerCase()}:${oid.toLowerCase()}`];
    if (!Array.isArray(assigned) || assigned.some(value => !allowed.includes(value))) fail(403, "workflow_grant_missing", "This identity has no valid Workflow grant.");
    permissions = assigned;
  }
  return { scope: { tenantId: tid.toLowerCase(), workspace: "workflow" },
    actor: { id: `entra:${tid.toLowerCase()}:${oid.toLowerCase()}`, name: String(auth.claims.name || auth.claims.preferred_username || "Signed-in owner").slice(0, 160) }, permissions };
}

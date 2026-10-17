import { createRemoteJWKSet, jwtVerify } from "jose";
import { EVERYAGENT_TENANT } from "../shared/everyagent-identity.mjs";
import { HttpError, createHttpError } from "./http-error-contract.mjs";

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// Standalone service authentication has its own audience and registered
// clients. It never inherits Platform's development bypass or workspace roles.
export function createEveryAgentAuthorizer({ tenantId, audience, clientIds, scope = "access_as_user", keySet = null }) {
  if (tenantId !== EVERYAGENT_TENANT || typeof audience !== "string" || !audience.trim() ||
      !Array.isArray(clientIds) || !clientIds.length || !clientIds.every(id => typeof id === "string" && uuid.test(id)) ||
      typeof scope !== "string" || !/^[\w.-]+$/.test(scope)) throw new Error("Configure the agent tenant, audience, delegated scope and client allowlist.");
  const keys = keySet ?? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`));
  const allowedClients = new Set(clientIds.map(id => id.toLowerCase()));
  return async req => {
    const header = req.headers?.authorization;
    const token = typeof header === "string" && header.length < 16_384 ? /^Bearer\s+(\S+)$/i.exec(header)?.[1] : null;
    if (!token) throw createHttpError(401, "agent_auth_required", "Sign in is required.");
    try {
      const { payload } = await jwtVerify(token, keys, { issuer: `https://login.microsoftonline.com/${tenantId}/v2.0`, audience,
        algorithms: ["RS256"], requiredClaims: ["exp", "iat", "tid", "oid", "scp", "azp"] });
      if (payload.tid !== tenantId || typeof payload.oid !== "string" || !uuid.test(payload.oid) ||
          typeof payload.scp !== "string" || !payload.scp.split(/\s+/).includes(scope) ||
          typeof payload.azp !== "string" || !allowedClients.has(payload.azp.toLowerCase())) {
        throw createHttpError(403, "agent_permission_missing", "This client or sign-in does not have agent access.");
      }
      return { authenticated: true, mode: "entra-delegated", claims: payload };
    } catch (error) {
      if (error instanceof HttpError && error.statusCode === 403) throw error;
      throw createHttpError(401, "agent_token_invalid", "Your sign-in is invalid or expired.");
    }
  };
}

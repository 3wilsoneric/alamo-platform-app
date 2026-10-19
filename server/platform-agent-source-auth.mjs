import { createRemoteJWKSet, jwtVerify } from "jose";
import { EVERYAGENT_TENANT } from "../shared/everyagent-identity.mjs";
import { HttpError, createHttpError } from "./http-error-contract.mjs";

// A dedicated resource audience and workload role never substitute for a
// source-owned user/resource grant. Browser/delegated tokens are not accepted.
export function createPlatformAgentSourceAuthorizer({ audience, keySet = null }) {
  if (typeof audience !== "string" || !audience.trim()) throw new Error("Configure the Platform agent-source audience.");
  const issuer = `https://login.microsoftonline.com/${EVERYAGENT_TENANT}/v2.0`;
  const keys = keySet ?? createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${EVERYAGENT_TENANT}/discovery/v2.0/keys`));
  return async req => {
    const header = req.headers?.authorization;
    const token = typeof header === "string" && header.length < 16_384 ? /^Bearer\s+(\S+)$/i.exec(header)?.[1] : null;
    if (!token) throw createHttpError(401, "source_auth_required", "A workload identity is required.");
    try {
      const { payload } = await jwtVerify(token, keys, { audience, issuer, algorithms: ["RS256"],
        requiredClaims: ["exp", "iat", "tid", "oid", "azp", "roles", "ver"] });
      if (payload.ver !== "2.0" || payload.tid !== EVERYAGENT_TENANT || payload.scp !== undefined ||
          (payload.idtyp !== undefined && payload.idtyp !== "app") || typeof payload.oid !== "string" ||
          typeof payload.azp !== "string" || !Array.isArray(payload.roles) || !payload.roles.includes("AlamoAgent.Source.Read")) {
        throw createHttpError(403, "source_identity_denied", "This identity cannot use the source connector.");
      }
      return { tenantId: EVERYAGENT_TENANT, clientId: payload.azp.toLowerCase(), principalId: payload.oid.toLowerCase() };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw createHttpError(401, "source_token_invalid", "The workload token is invalid or expired.");
    }
  };
}

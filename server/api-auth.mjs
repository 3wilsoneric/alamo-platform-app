import { createRemoteJWKSet, jwtVerify } from "jose";
import { isProductionLikeRuntime } from "./runtime-environment.mjs";
import { createHttpError } from "./http-errors.mjs";
import { getAdmissionsAccess } from "../shared/admissions-access.mjs";

const jwksByTenant = new Map();

export function getAcceptedEntraIssuers(tenantId) {
  const normalizedTenantId = String(tenantId ?? "").trim();
  if (!normalizedTenantId) return [];

  return [
    `https://login.microsoftonline.com/${normalizedTenantId}/v2.0`,
    `https://sts.windows.net/${normalizedTenantId}/`
  ];
}

function readBoolean(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return null;
}

export function isApiAuthRequired() {
  if (isProductionLikeRuntime()) return true;
  const configured = readBoolean(process.env.API_AUTH_REQUIRED);
  if (configured !== null) return configured;
  return false;
}

function getApiAuthConfig(options = {}) {
  const tenantId = process.env.ENTRA_TENANT_ID?.trim();
  const clientId = process.env.ENTRA_CLIENT_ID?.trim();
  const audience = process.env.ENTRA_API_AUDIENCE?.trim() || (clientId ? `api://${clientId}` : "");
  const requiredScope = options.requiredScope === undefined
    ? process.env.ENTRA_API_SCOPE?.trim() || "access_as_user"
    : String(options.requiredScope ?? "").trim() || null;
  const requiredRole = options.requiredRole === undefined
    ? process.env.ENTRA_API_REQUIRED_ROLE?.trim() || null
    : String(options.requiredRole ?? "").trim() || null;
  const permissionMode = options.permissionMode === "scope-or-role" ? "scope-or-role" : "scope-and-role";

  if (!tenantId || !audience || (!requiredScope && !requiredRole)) {
    throw createHttpError(
      503,
      "api_auth_not_configured",
      "API authentication is not configured. Set ENTRA_TENANT_ID, ENTRA_CLIENT_ID or ENTRA_API_AUDIENCE, and an API scope or role."
    );
  }

  return {
    tenantId,
    audience,
    requiredScope,
    requiredRole,
    permissionMode,
    issuers: getAcceptedEntraIssuers(tenantId)
  };
}

function getTokenRoles(payload) {
  if (Array.isArray(payload?.roles)) {
    return payload.roles.map((role) => String(role).trim()).filter(Boolean);
  }
  return String(payload?.roles ?? "").split(/\s+/).filter(Boolean);
}

function getBearerToken(req) {
  const authorization = String(req?.headers?.authorization ?? req?.headers?.Authorization ?? "").trim();
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

function getTenantJwks(tenantId) {
  if (!jwksByTenant.has(tenantId)) {
    jwksByTenant.set(
      tenantId,
      createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`))
    );
  }
  return jwksByTenant.get(tenantId);
}

export function assertApiClaimsPermission(payload, policy) {
  const scopes = String(payload?.scp ?? "").split(/\s+/).filter(Boolean);
  const roles = getTokenRoles(payload);
  const hasScope = Boolean(policy.requiredScope && scopes.includes(policy.requiredScope));
  const hasRole = Boolean(policy.requiredRole && roles.includes(policy.requiredRole));

  if (policy.permissionMode === "scope-or-role") {
    if (!hasScope && !hasRole) {
      throw createHttpError(403, "api_permission_missing", "Your identity is not assigned to use this API.");
    }
    return;
  }

  if (policy.requiredScope && !hasScope) {
    throw createHttpError(403, "api_scope_missing", "Your sign-in does not include permission to use this API.");
  }
  if (policy.requiredRole && !hasRole) {
    throw createHttpError(403, "api_role_missing", "Your account is not assigned to use the Alamo Platform API.");
  }
}

export function assertApiClaimsWorkspaceAccess(payload) {
  if (getAdmissionsAccess(getTokenRoles(payload)).restrictedToAdmissions) {
    throw createHttpError(
      403,
      "api_admissions_only",
      "Your account is assigned to the Admissions workspace only."
    );
  }
}

export async function requireApiUser(req, options = {}) {
  if (!isApiAuthRequired()) {
    return { authenticated: false, mode: "explicit-development-bypass", claims: null };
  }

  const token = getBearerToken(req);
  if (!token) {
    throw createHttpError(401, "api_auth_required", "Sign in is required to use the Alamo Platform API.");
  }

  const config = getApiAuthConfig(options);

  try {
    const { payload } = await jwtVerify(token, getTenantJwks(config.tenantId), {
      audience: config.audience,
      issuer: config.issuers
    });
    assertApiClaimsPermission(payload, config);
    assertApiClaimsWorkspaceAccess(payload);
    return {
      authenticated: true,
      mode: payload.scp ? "entra-delegated" : "entra-service-principal",
      claims: payload
    };
  } catch (error) {
    if (error && typeof error === "object" && "statusCode" in error) throw error;
    throw createHttpError(401, "api_token_invalid", "Your sign-in token is invalid or expired. Sign in again and retry.");
  }
}

export function getApiSessionOwnerKey(authContext) {
  if (!authContext?.authenticated) return "development-bypass";

  const tenantId = String(authContext.claims?.tid ?? "").trim();
  const subject = String(authContext.claims?.oid ?? authContext.claims?.sub ?? "").trim();
  if (!tenantId || !subject) {
    throw createHttpError(403, "api_identity_incomplete", "Your sign-in does not include a usable platform identity.");
  }

  return `entra:${tenantId}:${subject}`;
}

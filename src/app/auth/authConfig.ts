import { LogLevel, PublicClientApplication, type Configuration, type RedirectRequest } from "@azure/msal-browser";
import { getSameOriginLoginRedirectUri } from "../../../shared/auth-redirect-contract.mjs";

const tenantId = import.meta.env.VITE_ENTRA_TENANT_ID?.trim();
const clientId = import.meta.env.VITE_ENTRA_CLIENT_ID?.trim();
const configuredApiScope = import.meta.env.VITE_ENTRA_API_SCOPE?.trim();
const redirectUri = getSameOriginLoginRedirectUri(window.location.origin);

const isLocalBrowser = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

// The bypass is deliberately restricted to loopback hosts. This lets the
// optimized preview bundle exercise the real production render path without
// creating a deployable authentication bypass.
export const isE2EAuthBypassEnabled =
  isLocalBrowser &&
  import.meta.env.VITE_E2E_AUTH_BYPASS?.trim().toLowerCase() === "true";

const configuredApiAuth = import.meta.env.VITE_API_AUTH_REQUIRED?.trim().toLowerCase();
export const apiAuthEnabled =
  !isE2EAuthBypassEnabled &&
  (import.meta.env.PROD || configuredApiAuth === "true");
export const apiScope = configuredApiScope || (clientId ? `api://${clientId}/access_as_user` : null);

export const isEntraAuthConfigured = isE2EAuthBypassEnabled || Boolean(tenantId && clientId);

const msalConfig: Configuration = {
  auth: {
    clientId: clientId || "00000000-0000-0000-0000-000000000000",
    authority: `https://login.microsoftonline.com/${tenantId || "common"}`,
    redirectUri,
    postLogoutRedirectUri: window.location.origin,
    navigateToLoginRequestUrl: false
  },
  cache: {
    cacheLocation: "sessionStorage",
    storeAuthStateInCookie: false
  },
  system: {
    loggerOptions: {
      loggerCallback: (_level, message, containsPii) => {
        if (!containsPii && import.meta.env.DEV) {
          console.debug(`[msal] ${message}`);
        }
      },
      piiLoggingEnabled: false,
      logLevel: LogLevel.Warning
    }
  }
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest: RedirectRequest = {
  scopes: ["openid", "profile", "email", ...(apiAuthEnabled && apiScope ? [apiScope] : [])]
};

export const authConfig = {
  tenantId,
  clientId,
  redirectUri,
  apiScope
};

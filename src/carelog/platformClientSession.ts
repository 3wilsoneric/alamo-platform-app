import { PublicClientApplication } from "@azure/msal-browser";

export function createPlatformClientSession(redirectPath: string, postLogoutRedirectUri?: string) {
  let session: Promise<{ client: PublicClientApplication; scope: string }> | null = null;
  return function platformClient() {
    session ??= (async () => {
      const response = await fetch("/poc/app/auth/config", { cache: "no-store", credentials: "omit" });
      if (!response.ok) throw new Error("Carelog sign-in configuration is unavailable.");
      const { platform } = await response.json() as { platform?: { tenantId: string; clientId: string; scope: string } };
      if (!platform?.tenantId || !platform.clientId || !platform.scope) throw new Error("Platform sign-in is unavailable.");
      const client = new PublicClientApplication({
        auth: {
          clientId: platform.clientId,
          authority: `https://login.microsoftonline.com/${platform.tenantId}`,
          redirectUri: `${location.origin}${redirectPath}`,
          ...(postLogoutRedirectUri ? { postLogoutRedirectUri } : {}),
          navigateToLoginRequestUrl: false
        },
        cache: { cacheLocation: "sessionStorage", storeAuthStateInCookie: false }
      });
      await client.initialize();
      const result = await client.handleRedirectPromise();
      if (result?.account) client.setActiveAccount(result.account);
      return { client, scope: platform.scope };
    })().catch((error) => { session = null; throw error; });
    return session;
  };
}

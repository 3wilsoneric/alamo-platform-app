import { PublicClientApplication } from "@azure/msal-browser";

let session: Promise<{ client: PublicClientApplication; scope: string }> | null = null;

function platformClient() {
  session ??= (async () => {
    const response = await fetch("/poc/app/auth/config", { cache: "no-store", credentials: "omit" });
    if (!response.ok) throw new Error("Carelog sign-in configuration is unavailable.");
    const { platform } = await response.json() as { platform?: { tenantId: string; clientId: string; scope: string } };
    if (!platform?.tenantId || !platform.clientId || !platform.scope) throw new Error("Platform sign-in is unavailable.");
    const client = new PublicClientApplication({
      auth: {
        clientId: platform.clientId,
        authority: `https://login.microsoftonline.com/${platform.tenantId}`,
        redirectUri: `${location.origin}/login-callback.html`,
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
}

export async function acquireExistingPlatformToken(): Promise<{ token: string; expires: number }> {
  const { client, scope } = await platformClient();
  const accounts = client.getAllAccounts();
  const account = client.getActiveAccount() ?? (accounts.length === 1 ? accounts[0] : null);
  if (!account) throw new Error("The Platform session is unavailable in its original tab.");
  const result = await client.acquireTokenSilent({ account, scopes: [scope] });
  if (!result.accessToken || !result.expiresOn) throw new Error("The Platform token is unavailable.");
  return { token: result.accessToken, expires: result.expiresOn.getTime() };
}

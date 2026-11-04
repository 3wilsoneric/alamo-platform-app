import { InteractionRequiredAuthError, PublicClientApplication } from "@azure/msal-browser";

// This runs in the Platform-owned Carelog phone shell. It sends the existing
// delegated Platform token only to that shell's same-origin Carelog iframe.
const frame = document.getElementById("app-screen") as HTMLIFrameElement | null;
const errorKey = "carelog.platform-signin-error";
let session: Promise<{ client: PublicClientApplication; scope: string }> | null = null;
let redirecting = false;

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
        redirectUri: `${location.origin}/poc/app/platform-login.html`,
        postLogoutRedirectUri: location.origin,
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

window.addEventListener("message", async (event) => {
  if (!frame || window.parent !== window || event.origin !== location.origin || event.source !== frame.contentWindow
    || event.data?.type !== "poc-platform-token-request" || typeof event.data.requestId !== "string"
    || !event.data.requestId || event.data.requestId.length > 64) return;
  const source = event.source as Window;
  const requestId = event.data.requestId;
  const reply = (payload: object) => {
    if (source === frame.contentWindow) source.postMessage({ type: "poc-platform-token", requestId, ...payload }, location.origin);
  };
  try {
    const { client, scope } = await platformClient();
    if (redirecting) return;
    const cancelled = sessionStorage.getItem(errorKey);
    sessionStorage.removeItem(errorKey);
    if (cancelled && event.data.interactive !== true) { reply({ error: "platform_sign_in_cancelled" }); return; }
    const accounts = client.getAllAccounts();
    const account = client.getActiveAccount() ?? (accounts.length === 1 ? accounts[0] : null);
    const selectAccount = event.data.interactive === true && event.data.selectAccount === true;
    try {
      if (!account || selectAccount) throw new InteractionRequiredAuthError("no_account");
      const result = await client.acquireTokenSilent({ account, scopes: [scope] });
      if (!result.accessToken || !result.expiresOn) throw new Error("No delegated session");
      reply({ token: result.accessToken, expires: result.expiresOn.getTime() });
    } catch (error) {
      if (!(error instanceof InteractionRequiredAuthError)) throw error;
      if (event.data.interactive !== true) { reply({ error: "platform_no_session" }); return; }
      redirecting = true;
      try {
        await client.loginRedirect({ scopes: [scope], ...(selectAccount ? { prompt: "select_account" } : account ? { account } : {}) });
      } catch (redirectError) { redirecting = false; throw redirectError; }
    }
  } catch {
    reply({ error: "platform_sign_in_required" });
  }
});

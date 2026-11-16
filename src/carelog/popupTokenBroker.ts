import { createPlatformClientSession } from "./platformClientSession";

const platformClient = createPlatformClientSession("/login-callback.html");

export async function acquireExistingPlatformToken(): Promise<{ token: string; expires: number }> {
  const { client, scope } = await platformClient();
  const accounts = client.getAllAccounts();
  const account = client.getActiveAccount() ?? (accounts.length === 1 ? accounts[0] : null);
  if (!account) throw new Error("The Platform session is unavailable in its original tab.");
  const result = await client.acquireTokenSilent({ account, scopes: [scope] });
  if (!result.accessToken || !result.expiresOn) throw new Error("The Platform token is unavailable.");
  return { token: result.accessToken, expires: result.expiresOn.getTime() };
}

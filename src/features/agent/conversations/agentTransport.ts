import type { IPublicClientApplication } from "@azure/msal-browser";
import { createConversationClient } from "../../../../shared/everyagent-conversations.mjs";
import type { EveryAgentOverview } from "../../../../shared/everyagent-contracts.mjs";
import { readBoundedJsonResponse } from "../../../shared/api/boundedResponse";

export const agentApiOrigin = import.meta.env.VITE_ALAMOAGENT_API_ORIGIN?.trim();
export const agentApiScope = import.meta.env.VITE_ALAMOAGENT_SCOPE?.trim();
export const agentChatConfigured = Boolean(agentApiOrigin && agentApiScope);
const loopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
export const localAgentPreview = loopback(window.location.hostname) && import.meta.env.VITE_E2E_AUTH_BYPASS === "true";

export function createAgentTransport(instance: IPublicClientApplication) {
  const origin = agentApiOrigin || window.location.origin;
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== "https:" && !(localAgentPreview && loopback(url.hostname)))) throw new Error("Invalid agent API origin.");
  async function requestJson<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    if (!endpoint.startsWith("/api/agent/v1/")) throw new Error("Invalid agent endpoint.");
    const headers = new Headers(init.headers);
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
    if (!localAgentPreview) {
      if (!account || !agentApiScope) throw new Error("Connect your agent sign-in to continue.");
      let timer: number | undefined;
      try {
        const token = await Promise.race([instance.acquireTokenSilent({ account, scopes: [agentApiScope] }),
          new Promise<never>((_resolve, reject) => { timer = window.setTimeout(() => reject(new Error("Sign-in timed out.")), 15_000); })]);
        if (!token.accessToken) throw new Error("Missing token.");
        headers.set("Authorization", `Bearer ${token.accessToken}`);
      } catch { throw new Error("Connect your agent sign-in to continue."); }
      finally { window.clearTimeout(timer); }
    }
    const response = await fetch(`${origin}${endpoint}`, { ...init, headers, credentials: "omit", redirect: "error",
      signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(110_000)]) : AbortSignal.timeout(110_000) });
    if (!response.ok) {
      const problem = await readBoundedJsonResponse<{ code?: string }>(response, 4096).catch(() => ({} as { code?: string }));
      const messages: Record<string, string> = {
        conversation_changed: "This chat changed. Refresh before sending again.",
        conversation_capacity: "The chat limit has been reached. Your existing conversations are saved.",
        conversation_budget: "The daily chat limit has been reached. Saved work is still available.",
        conversation_concurrency: "Two answers are already running. Wait or stop one before continuing.",
        conversation_model_unavailable: "Chat answers are not configured yet. Saved work remains available."
      };
      throw new Error(messages[problem.code ?? ""] ?? "Chat access could not be verified. Connect or refresh to try again.");
    }
    return readBoundedJsonResponse<T>(response, 8 * 1024 * 1024);
  }
  return { conversations: createConversationClient(requestJson), work: (signal?: AbortSignal) => requestJson<EveryAgentOverview>("/api/agent/v1/work", signal ? { signal } : {}),
    connect: async () => {
      if (!agentApiScope) return;
      const result = await instance.acquireTokenPopup({ scopes: [agentApiScope] });
      instance.setActiveAccount(result.account);
    } };
}
export type AgentTransport = ReturnType<typeof createAgentTransport>;

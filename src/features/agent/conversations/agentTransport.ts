import type { IPublicClientApplication } from "@azure/msal-browser";
import { createConversationClient } from "../../../../shared/everyagent-conversations.mjs";
import type { EveryAgentOverview } from "../../../../shared/everyagent-contracts.mjs";
import { readBoundedJsonResponse } from "../../../shared/api/boundedResponse";
import { AGENT_SIGNIN_MESSAGE, AgentRequestError, agentHttpError, agentNetworkError } from "./agentErrors";

export const agentApiOrigin = import.meta.env.VITE_ALAMOAGENT_API_ORIGIN?.trim();
export const agentApiScope = import.meta.env.VITE_ALAMOAGENT_SCOPE?.trim();
export const agentChatConfigured = Boolean(agentApiOrigin && agentApiScope);
const loopback = (hostname: string) => ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
export const localAgentPreview = loopback(window.location.hostname) && import.meta.env.VITE_E2E_AUTH_BYPASS === "true";

export function createAgentTransport(instance: IPublicClientApplication) {
  const origin = agentApiOrigin || window.location.origin;
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== "https:" && !(localAgentPreview && loopback(url.hostname)))) throw new Error("Invalid agent API origin.");
  async function authorize(init: RequestInit): Promise<Headers> {
    const headers = new Headers(init.headers);
    if (localAgentPreview) return headers;
    const account = instance.getActiveAccount() ?? instance.getAllAccounts()[0];
    if (!account || !agentApiScope) throw new AgentRequestError(AGENT_SIGNIN_MESSAGE, "signin");
    let timer: number | undefined, timedOut = false;
    try {
      const token = await Promise.race([instance.acquireTokenSilent({ account, scopes: [agentApiScope] }),
        new Promise<never>((_resolve, reject) => { timer = window.setTimeout(() => { timedOut = true; reject(new Error("Sign-in timed out.")); }, 15_000); })]);
      if (!token.accessToken) throw new Error("Missing token.");
      headers.set("Authorization", `Bearer ${token.accessToken}`);
      return headers;
    } catch (error) {
      // A token refresh that cannot reach the identity provider is an outage,
      // not a revoked sign-in; do not ask the user to reconnect for it.
      const code = String((error as { errorCode?: unknown })?.errorCode ?? "");
      if (timedOut || /network|request_failed|timed_out/.test(code)) throw agentNetworkError();
      throw new AgentRequestError(AGENT_SIGNIN_MESSAGE, "signin");
    }
    finally { window.clearTimeout(timer); }
  }
  /** Sends one authorized request. Caller aborts propagate unchanged; every
   * other transport failure becomes an "unavailable" error, never "access". */
  async function send(endpoint: string, init: RequestInit, timeoutMs: number | null): Promise<Response> {
    if (!endpoint.startsWith("/api/agent/v1/")) throw new Error("Invalid agent endpoint.");
    const headers = await authorize(init);
    const signals = [init.signal, timeoutMs ? AbortSignal.timeout(timeoutMs) : null].filter((value): value is AbortSignal => Boolean(value));
    let response: Response;
    try {
      response = await fetch(`${origin}${endpoint}`, { ...init, headers, credentials: "omit", redirect: "error",
        ...(signals.length ? { signal: signals.length === 1 ? signals[0]! : AbortSignal.any(signals) } : {}) });
    } catch (error) {
      if (init.signal?.aborted) throw error;
      throw agentNetworkError();
    }
    if (!response.ok) {
      const problem = await readBoundedJsonResponse<{ code?: string }>(response, 4096).catch(() => ({} as { code?: string }));
      throw agentHttpError(response.status, problem.code);
    }
    return response;
  }
  async function requestJson<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    const response = await send(endpoint, init, 110_000);
    try { return await readBoundedJsonResponse<T>(response, 8 * 1024 * 1024); }
    catch (error) {
      if (init.signal?.aborted) throw error;
      if (error instanceof TypeError || (error instanceof DOMException && ["TimeoutError", "AbortError", "NetworkError"].includes(error.name))) throw agentNetworkError();
      throw error;
    }
  }
  /** Opens a long-lived authorized stream (Server-Sent Events). EventSource
   * cannot send a bearer header, so this uses fetch. No total timeout: the
   * consumer owns idle detection and aborts through the signal. */
  const openStream = (endpoint: string, signal: AbortSignal) =>
    send(endpoint, { signal, cache: "no-store", headers: { Accept: "text/event-stream" } }, null);
  return { requestJson, openStream, conversations: createConversationClient(requestJson), work: (signal?: AbortSignal) => requestJson<EveryAgentOverview>("/api/agent/v1/work", signal ? { signal } : {}),
    process: <T,>(command: Record<string, unknown> | null, id?: string) => requestJson<T>(`/api/agent/v1/assessor-sandbox${id ? `?id=${encodeURIComponent(id)}` : ''}`, {
      method: command ? 'POST' : 'GET', cache: 'no-store', headers: { 'content-type': 'application/json' }, ...(command ? { body: JSON.stringify(command) } : {}),
    }),
    connect: async () => {
      if (!agentApiScope) return;
      const result = await instance.acquireTokenPopup({ scopes: [agentApiScope] });
      instance.setActiveAccount(result.account);
    } };
}
export type AgentTransport = ReturnType<typeof createAgentTransport>;

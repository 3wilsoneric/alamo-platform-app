import { InteractionRequiredAuthError } from "@azure/msal-browser";
import {
  apiAuthEnabled,
  apiScope,
  isE2EAuthBypassEnabled,
  msalInstance
} from "../../app/auth/authConfig";

export const PLATFORM_AUTHENTICATION_REQUIRED_EVENT = "alamo-platform:authentication-required";

export class PlatformAuthenticationRequiredError extends Error {
  constructor(message = "Your sign-in needs to be refreshed before the platform can load data.") {
    super(message);
    this.name = "PlatformAuthenticationRequiredError";
  }
}

function announceAuthenticationRequired(reason: "missing_account" | "interaction_required" | "api_unauthorized") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(PLATFORM_AUTHENTICATION_REQUIRED_EVENT, {
    detail: { reason }
  }));
}

function requiresInteractiveAuthentication(error: unknown) {
  if (error instanceof InteractionRequiredAuthError) return true;
  const code = error && typeof error === "object" && "errorCode" in error
    ? String(error.errorCode ?? "")
    : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /interaction_required|login_required|no_account_error|monitor_window_timeout|silent_sso_error|token_renewal_error/i.test(
    `${code} ${message}`
  );
}

export function getApiAuthCachePartition() {
  if (!apiAuthEnabled || isE2EAuthBypassEnabled) return "local";
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
  return account?.homeAccountId ?? "signed-out";
}

export interface AuthenticatedFetchOptions<T> {
  timeoutMs?: number;
  consume: (response: Response) => Promise<T>;
}

const DEFAULT_API_REQUEST_TIMEOUT_MS = 30_000;
export { DEFAULT_API_RESPONSE_MAX_BYTES, readBoundedJsonResponse, readBoundedResponseText } from "./boundedResponse";

function getAbortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Request canceled.", "AbortError");
}

async function awaitWithinRequestBoundary<T>(task: () => Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw getAbortReason(signal);
  const promise = task();

  return await new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(getAbortReason(signal));
    signal.addEventListener("abort", handleAbort, { once: true });

    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", handleAbort);
    });
  });
}

function createRequestBoundary(externalSignal: AbortSignal | null | undefined, timeoutMs: number) {
  const controller = new AbortController();
  const boundedTimeoutMs = Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_API_REQUEST_TIMEOUT_MS;
  const timeout = globalThis.setTimeout(() => {
    controller.abort(new DOMException("Request timed out.", "TimeoutError"));
  }, boundedTimeoutMs);
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abortFromExternalSignal);
    }
  };
}

export async function fetchWithApiAuth<T>(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: AuthenticatedFetchOptions<T>
): Promise<T> {
  const headers = new Headers(init.headers);
  const requestBoundary = createRequestBoundary(
    init.signal,
    options.timeoutMs ?? DEFAULT_API_REQUEST_TIMEOUT_MS
  );

  try {
    if (apiAuthEnabled && !isE2EAuthBypassEnabled) {
      if (!apiScope) {
        throw new Error("API authentication is not configured in this build.");
      }
      const requestedApiScope = apiScope;

      const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0] ?? null;
      if (!account) {
        announceAuthenticationRequired("missing_account");
        throw new PlatformAuthenticationRequiredError("Your sign-in session has ended. Sign in again to continue.");
      }

      try {
        const token = await awaitWithinRequestBoundary(
          () => msalInstance.acquireTokenSilent({
            account,
            scopes: [requestedApiScope]
          }),
          requestBoundary.signal
        );
        headers.set("Authorization", `Bearer ${token.accessToken}`);
      } catch (error) {
        if (requiresInteractiveAuthentication(error)) {
          announceAuthenticationRequired("interaction_required");
          throw new PlatformAuthenticationRequiredError();
        }
        throw error;
      }
    }

    const response = await fetch(input, {
      ...init,
      headers,
      signal: requestBoundary.signal
    });
    if (response.status === 401) {
      announceAuthenticationRequired("api_unauthorized");
      throw new PlatformAuthenticationRequiredError("Your sign-in session has expired. Sign in again to continue.");
    }
    return await options.consume(response);
  } finally {
    requestBoundary.cleanup();
  }
}

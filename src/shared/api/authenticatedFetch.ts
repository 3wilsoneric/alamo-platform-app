import { InteractionRequiredAuthError } from "@azure/msal-browser";
import {
  apiAuthEnabled,
  apiScope,
  isE2EAuthBypassEnabled,
  msalInstance
} from "../../app/auth/authConfig";

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
export const DEFAULT_API_RESPONSE_MAX_BYTES = 50 * 1024 * 1024;

function responseSizeError(maximumBytes: number) {
  return new Error(`Platform API response exceeded the ${Math.round(maximumBytes / (1024 * 1024))} MB safety limit.`);
}

export async function readBoundedResponseText(
  response: Response,
  maximumBytes = DEFAULT_API_RESPONSE_MAX_BYTES
) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maximumBytes) {
    throw responseSizeError(maximumBytes);
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength > maximumBytes) throw responseSizeError(maximumBytes);
    return text;
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maximumBytes) {
        await reader.cancel();
        throw responseSizeError(maximumBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  chunks.forEach((chunk) => {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  });
  return new TextDecoder().decode(bytes);
}

export async function readBoundedJsonResponse<T>(
  response: Response,
  maximumBytes = DEFAULT_API_RESPONSE_MAX_BYTES
): Promise<T> {
  const text = await readBoundedResponseText(response, maximumBytes);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("The server returned a response the platform could not read.");
  }
}

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
        throw new Error("Your sign-in session is unavailable. Sign in again and retry.");
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
        if (error instanceof InteractionRequiredAuthError) {
          throw new Error("Your sign-in needs to be refreshed before the platform can load data.");
        }
        throw error;
      }
    }

    const response = await fetch(input, {
      ...init,
      headers,
      signal: requestBoundary.signal
    });
    return await options.consume(response);
  } finally {
    requestBoundary.cleanup();
  }
}

import type {
  CommunitySnapshotResponse,
  DataExplorerKind,
  DataExplorerResponse,
  HomeDashboardResponse,
  IncidentFeedResponse,
  LiveCommunitiesDashboardResponse,
  PlatformHealthResponse,
  AnalystTraceTelemetryResponse,
  ReportsSummaryResponse
} from "../types/platformSnapshot";
import {
  readJsonStorage,
  removeStorageItem,
  writeStorageItem
} from "../storage/browserStorage";
import { platformResponseValidators } from "./platformResponseSchemas";
import {
  fetchWithApiAuth,
  getApiAuthCachePartition,
  readBoundedJsonResponse
} from "./authenticatedFetch";

export type {
  CommunitySnapshotResponse,
  CommunityIncidentDetailRecord,
  DataExplorerKind,
  DataExplorerResponse,
  HomeDashboardResponse,
  IncidentFeedResponse,
  LiveCommunityResidentRecord,
  LiveIncidentRecord,
  LiveCommunitiesDashboardResponse,
  PlatformHealthResponse,
  AnalystTraceTelemetryResponse,
  ReportsSummaryResponse
} from "../types/platformSnapshot";

const clientCache = new Map<
  string,
  {
    value?: unknown;
    expiresAt: number;
    promise?: Promise<unknown>;
  }
>();

export const PLATFORM_DATA_REFRESH_EVENT = "alamo-platform:data-refresh";
const DEFAULT_CACHE_TTL_MS = 10 * 60_000;
const LIVE_INCIDENT_CACHE_TTL_MS = 10_000;
const SESSION_STORAGE_PREFIX = "alamo-platform:warm-cache:";
const SESSION_CACHE_MAX_BYTES = 750_000;

let sessionCacheHydrated = false;
let sessionCachePersistenceDisabled = false;
let clientCachePartition: string | null = null;

type ResponseValidator<T> = (value: unknown) => T;

function getAbortReason(signal: AbortSignal) {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Request canceled.", "AbortError");
}

async function awaitSharedRequest<T>(promise: Promise<T>, signal?: AbortSignal) {
  if (!signal) return promise;
  if (signal.aborted) throw getAbortReason(signal);

  return await new Promise<T>((resolve, reject) => {
    const handleAbort = () => reject(getAbortReason(signal));
    signal.addEventListener("abort", handleAbort, { once: true });
    promise.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", handleAbort);
    });
  });
}

function isTransientPlatformReadError(error: unknown, signal?: AbortSignal) {
  if (signal?.aborted) return false;
  if (error instanceof DOMException && error.name === "AbortError") return false;
  const message = error instanceof Error ? error.message : String(error);
  return (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError") ||
    /\((408|425|429|5\d\d)\)/.test(message) ||
    /failed to fetch|network|timed out/i.test(message)
  );
}

async function waitForPlatformReadRetry(signal?: AbortSignal) {
  if (signal?.aborted) throw getAbortReason(signal);
  await new Promise<void>((resolve, reject) => {
    function cleanup() {
      signal?.removeEventListener("abort", handleAbort);
    }
    function handleAbort() {
      globalThis.clearTimeout(timeout);
      cleanup();
      reject(getAbortReason(signal as AbortSignal));
    }
    const timeout = globalThis.setTimeout(() => {
      cleanup();
      resolve();
    }, 450);
    signal?.addEventListener("abort", handleAbort, { once: true });
  });
}

function getSessionCachePriority(path: string) {
  if (path === "/api/home-dashboard") return 0;
  if (path === "/api/communities/dashboard") return 1;
  if (path.startsWith("/api/communities/snapshot")) return 2;
  if (path.startsWith("/api/data-explorer?kind=residents")) return 3;
  if (path.startsWith("/api/data-explorer?kind=census")) return 4;
  if (path.startsWith("/api/data-explorer?kind=incidents")) return 5;
  if (path === "/api/analytics-summary") return 6;
  return 9;
}

function ensureClientCachePartition() {
  const nextPartition = getApiAuthCachePartition();
  if (clientCachePartition !== nextPartition) {
    const previousPartition = clientCachePartition;
    clientCache.clear();
    clientCachePartition = nextPartition;
    sessionCacheHydrated = false;
    sessionCachePersistenceDisabled = false;
    if (previousPartition && typeof window !== "undefined") {
      removeStorageItem(getSessionStorageKey(previousPartition), {
        kind: "session",
        label: "previous account platform warm cache"
      });
    }
  }
  return nextPartition;
}

function getSessionStorageKey(partition: string) {
  return `${SESSION_STORAGE_PREFIX}${partition}`;
}

function hydrateSessionCache() {
  const partition = ensureClientCachePartition();
  if (sessionCacheHydrated || typeof window === "undefined") {
    return partition;
  }

  sessionCacheHydrated = true;

  const payload = readJsonStorage<unknown>(getSessionStorageKey(partition), {
    fallback: null,
    kind: "session",
    label: "platform warm cache"
  });
  if (!payload || typeof payload !== "object") return partition;

  const now = Date.now();

  Object.entries(payload as Record<string, { value?: unknown; expiresAt?: unknown }>).forEach(([path, entry]) => {
    if (entry && typeof entry.expiresAt === "number" && entry.expiresAt > now) {
      clientCache.set(path, {
        value: entry.value,
        expiresAt: entry.expiresAt
      });
    }
  });
  return partition;
}

function persistSessionCache(partition: string) {
  if (typeof window === "undefined" || sessionCachePersistenceDisabled) {
    return;
  }
  if (ensureClientCachePartition() !== partition) return;

  try {
    const now = Date.now();
    const candidates = [...clientCache.entries()]
      .filter(([, entry]) => entry.value !== undefined && entry.expiresAt > now)
      .sort(([leftPath, leftEntry], [rightPath, rightEntry]) => {
        const priorityDelta = getSessionCachePriority(leftPath) - getSessionCachePriority(rightPath);
        if (priorityDelta !== 0) return priorityDelta;
        return rightEntry.expiresAt - leftEntry.expiresAt;
      });

    let serialized = "{}";
    let payload: Record<
      string,
      {
        value: unknown;
        expiresAt: number;
      }
    > = {};

    for (const [path, entry] of candidates) {
      const nextPayload = {
        ...payload,
        [path]: {
          value: entry.value,
          expiresAt: entry.expiresAt
        }
      };
      const nextSerialized = JSON.stringify(nextPayload);
      if (nextSerialized.length <= SESSION_CACHE_MAX_BYTES) {
        payload = nextPayload;
        serialized = nextSerialized;
      }
    }

    const storageKey = getSessionStorageKey(partition);
    if (!writeStorageItem(storageKey, serialized, { kind: "session", label: "platform warm cache" })) {
      sessionCachePersistenceDisabled = true;
      removeStorageItem(storageKey, { kind: "session", label: "platform warm cache" });
    }
  } catch (error) {
    sessionCachePersistenceDisabled = true;
    removeStorageItem(getSessionStorageKey(partition), { kind: "session", label: "platform warm cache" });
    console.warn("Could not prepare platform warm cache.", error);
  }
}

function readCachedJson<T>(path: string, validate: ResponseValidator<T>): T | null {
  hydrateSessionCache();
  const cached = clientCache.get(path);
  if (cached?.value === undefined || cached.expiresAt <= Date.now()) return null;

  try {
    return validate(cached.value);
  } catch (error) {
    clientCache.delete(path);
    console.warn(`Ignored invalid warm cache entry for ${path}.`, error);
    return null;
  }
}

async function fetchJson<T>(path: string, signal?: AbortSignal, validate?: ResponseValidator<T>): Promise<T> {
  const requestPartition = hydrateSessionCache();

  const now = Date.now();
  const cached = clientCache.get(path);

  if (cached?.value && cached.expiresAt > now) {
    try {
      return validate ? validate(cached.value) : cached.value as T;
    } catch (error) {
      clientCache.delete(path);
      console.warn(`Ignored invalid warm cache entry for ${path}.`, error);
    }
  }

  if (cached?.promise) {
    const pendingValue = await awaitSharedRequest(cached.promise, signal);
    if (ensureClientCachePartition() !== requestPartition) {
      throw new Error("The signed-in account changed while platform data was loading. Retry the request.");
    }
    return validate ? validate(pendingValue) : pendingValue as T;
  }

  const promise = (async () => {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await fetchWithApiAuth<T>(path, {
          cache: "no-store",
          ...(signal ? { signal } : {}),
          headers: {
            "cache-control": "no-cache"
          }
        }, {
          consume: async (response) => {
            if (!response.ok) {
              throw new Error(`Failed to load ${path} (${response.status})`);
            }

            const value = await readBoundedJsonResponse<unknown>(response);
            return validate ? validate(value) : value as T;
          }
        });
      } catch (error) {
        lastError = error;
        if (attempt > 0 || !isTransientPlatformReadError(error, signal)) throw error;
        await waitForPlatformReadRetry(signal);
      }
    }
    throw lastError;
  })();

  if (!signal) {
    clientCache.set(path, {
      expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS,
      promise
    });
  }

  try {
    const value = await promise;
    if (ensureClientCachePartition() !== requestPartition) {
      throw new Error("The signed-in account changed while platform data was loading. Retry the request.");
    }

    clientCache.set(path, {
      value,
      expiresAt: Date.now() + DEFAULT_CACHE_TTL_MS
    });
    persistSessionCache(requestPartition);

    return value;
  } catch (error) {
    if (!signal && clientCache.get(path)?.promise === promise) clientCache.delete(path);
    throw error;
  }
}

async function fetchLiveJson<T>(path: string, signal?: AbortSignal, validate?: ResponseValidator<T>, ttlMs = 0): Promise<T> {
  const requestPartition = hydrateSessionCache();

  if (ttlMs > 0) {
    const now = Date.now();
    const cached = clientCache.get(path);

    if (cached?.value && cached.expiresAt > now) {
      try {
        return validate ? validate(cached.value) : cached.value as T;
      } catch (error) {
        clientCache.delete(path);
        console.warn(`Ignored invalid live cache entry for ${path}.`, error);
      }
    }

    if (cached?.promise) {
      const pendingValue = await awaitSharedRequest(cached.promise, signal);
      if (ensureClientCachePartition() !== requestPartition) {
        throw new Error("The signed-in account changed while platform data was loading. Retry the request.");
      }
      return validate ? validate(pendingValue) : pendingValue as T;
    }
  }

  const promise = fetchWithApiAuth<T>(path, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
    headers: {
      "cache-control": "no-cache, no-store, must-revalidate",
      pragma: "no-cache"
    }
  }, {
    consume: async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${path} (${response.status})`);
      }

      const value = await readBoundedJsonResponse<unknown>(response);
      return validate ? validate(value) : value as T;
    }
  });

  if (ttlMs > 0 && !signal) {
    clientCache.set(path, {
      expiresAt: Date.now() + ttlMs,
      promise
    });
  }

  try {
    const value = await promise;
    if (ensureClientCachePartition() !== requestPartition) {
      throw new Error("The signed-in account changed while platform data was loading. Retry the request.");
    }

    if (ttlMs > 0) {
      clientCache.set(path, {
        value,
        expiresAt: Date.now() + ttlMs
      });
    }

    return value;
  } catch (error) {
    if (ttlMs > 0 && !signal && clientCache.get(path)?.promise === promise) clientCache.delete(path);
    throw error;
  }
}

async function fetchUncachedLiveJson<T>(path: string, signal?: AbortSignal, validate?: ResponseValidator<T>): Promise<T> {
  const requestPartition = ensureClientCachePartition();
  const value = await fetchWithApiAuth<unknown>(path, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
    headers: {
      "cache-control": "no-cache, no-store, must-revalidate",
      pragma: "no-cache"
    }
  }, {
    consume: async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load ${path} (${response.status})`);
      }
      return readBoundedJsonResponse<unknown>(response);
    }
  });
  if (ensureClientCachePartition() !== requestPartition) {
    throw new Error("The signed-in account changed while platform data was loading. Retry the request.");
  }
  return validate ? validate(value) : value as T;
}

export function fetchCommunitiesDashboard(signal?: AbortSignal) {
  return fetchJson<LiveCommunitiesDashboardResponse>("/api/communities/dashboard", signal, platformResponseValidators.communitiesDashboard);
}

export function readCachedCommunitiesDashboard() {
  return readCachedJson(
    "/api/communities/dashboard",
    platformResponseValidators.communitiesDashboard
  );
}

export function fetchHomeDashboard(signal?: AbortSignal) {
  return fetchJson<HomeDashboardResponse>("/api/home-dashboard", signal, platformResponseValidators.homeDashboard);
}

export function readCachedHomeDashboard() {
  return readCachedJson(
    "/api/home-dashboard",
    platformResponseValidators.homeDashboard
  );
}

export async function fetchCommunitySnapshot(facilityId: string, signal?: AbortSignal) {
  const payload = await fetchJson<CommunitySnapshotResponse>(
    `/api/communities/snapshot?facilityId=${encodeURIComponent(facilityId)}`,
    signal,
    platformResponseValidators.communitySnapshot
  );
  if (String(payload.facility.facility_id) !== String(facilityId)) {
    throw new Error(`Community snapshot scope mismatch for facility ${facilityId}.`);
  }
  return payload;
}

export async function fetchCommunityCensusSnapshot(facilityId: string, signal?: AbortSignal) {
  const payload = await fetchJson<CommunitySnapshotResponse>(
    `/api/communities/snapshot?facilityId=${encodeURIComponent(facilityId)}&view=census`,
    signal,
    platformResponseValidators.communitySnapshot
  );
  if (String(payload.facility.facility_id) !== String(facilityId)) {
    throw new Error(`Community census scope mismatch for facility ${facilityId}.`);
  }
  return payload;
}

export async function fetchIncidentFeed(signal?: AbortSignal) {
  // The Incident Center remains no-store at the network layer; this only reuses a seconds-old in-memory prewarm.
  const payload = await fetchLiveJson<IncidentFeedResponse>(
    "/api/incidents",
    signal,
    platformResponseValidators.incidentStream,
    LIVE_INCIDENT_CACHE_TTL_MS
  );
  if (!payload.source) throw new Error("Incident feed response did not identify its data source.");
  return payload;
}

export async function fetchIncidentStream(signal?: AbortSignal) {
  return (await fetchIncidentFeed(signal)).incidents;
}

export function fetchAnalyticsSummary(signal?: AbortSignal) {
  return fetchJson<ReportsSummaryResponse>("/api/analytics-summary", signal, platformResponseValidators.analyticsSummary);
}

export function readCachedAnalyticsSummary() {
  return readCachedJson(
    "/api/analytics-summary",
    platformResponseValidators.analyticsSummary
  );
}

export async function fetchDataExplorer(kind: DataExplorerKind, signal?: AbortSignal) {
  const payload = await fetchJson<DataExplorerResponse>(
    `/api/data-explorer?kind=${encodeURIComponent(kind)}`,
    signal,
    platformResponseValidators.dataExplorer
  );
  if (payload.kind !== kind) {
    throw new Error(`Data explorer scope mismatch: requested ${kind}, received ${payload.kind}.`);
  }
  return payload;
}

export function fetchPlatformHealth(signal?: AbortSignal) {
  return fetchUncachedLiveJson<PlatformHealthResponse>("/api/platform/health", signal, platformResponseValidators.platformHealth);
}

export function fetchAnalystTraceTelemetry(signal?: AbortSignal) {
  return fetchUncachedLiveJson<AnalystTraceTelemetryResponse>("/api/platform/analyst-traces", signal, platformResponseValidators.analystTraceTelemetry);
}

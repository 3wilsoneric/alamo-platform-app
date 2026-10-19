import {
  fetchCommunitiesDashboard,
  fetchCommunitySnapshot,
  fetchDataExplorer,
  fetchHomeDashboard,
  fetchIncidentStream,
  type DataExplorerKind
} from "../api/platformData";

const scheduledRoutes = new Set<string>();
export const POST_SIGN_IN_WORKSPACE_MAX_WAIT_MS = 2_000;

interface WorkspaceWarmer {
  label: string;
  warm: () => Promise<unknown>;
}

function idle(callback: () => void, timeout = 1200) {
  if (typeof window === "undefined") return;
  const browserWindow = window as Window &
    typeof globalThis & {
      requestIdleCallback?: (callback: IdleRequestCallback, options?: IdleRequestOptions) => number;
    };

  if (browserWindow.requestIdleCallback) {
    browserWindow.requestIdleCallback(callback, { timeout });
    return;
  }
  globalThis.setTimeout(callback, Math.min(timeout, 800));
}

function safeWarm(label: string, warm: () => Promise<unknown>) {
  void warm().catch((error) => {
    console.warn(`Workspace prewarm failed for ${label}.`, error);
  });
}

function normalizeRoute(route?: string | null) {
  if (!route) return "/home";
  try {
    const url = new URL(route, window.location.origin);
    if (url.origin !== window.location.origin) return "/home";
    return url.pathname + url.search;
  } catch {
    return "/home";
  }
}

function getExplorerKind(pathname: string): DataExplorerKind | null {
  if (pathname.includes("/explorer/incidents")) return "incidents";
  if (pathname.includes("/explorer/residents")) return "residents";
  if (pathname.includes("/explorer/census")) return "census";
  return null;
}

function shouldSkipBackgroundPreload() {
  if (typeof navigator === "undefined") return false;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return Boolean(connection?.saveData);
}

function decodeRouteSegment(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function getWorkspaceWarmers(normalizedRoute: string): WorkspaceWarmer[] {
  const url = new URL(normalizedRoute, window.location.origin);
  const pathname = url.pathname;

  if (pathname === "/home" || pathname === "/" || pathname === "/questions") {
    return [
      { label: "home dashboard", warm: () => fetchHomeDashboard() },
      { label: "communities dashboard", warm: () => fetchCommunitiesDashboard() }
    ];
  }

  const homeCommunityMatch = pathname.match(/^\/home\/community\/([^/]+)/);
  if (homeCommunityMatch) {
    const facilityId = homeCommunityMatch[1];
    if (!facilityId) return [{ label: "home dashboard", warm: () => fetchHomeDashboard() }];
    return [
      { label: "home dashboard", warm: () => fetchHomeDashboard() },
      { label: "communities dashboard", warm: () => fetchCommunitiesDashboard() }
    ];
  }

  if (pathname.startsWith("/analytics") || pathname.startsWith("/reports")) {
    return [{ label: "home dashboard", warm: () => fetchHomeDashboard() }];
  }

  if (pathname === "/communities") {
    return [
      { label: "home dashboard", warm: () => fetchHomeDashboard() },
      { label: "communities dashboard", warm: () => fetchCommunitiesDashboard() }
    ];
  }

  if (pathname === "/resident-search") {
    return [{ label: "resident explorer rows", warm: () => fetchDataExplorer("residents") }];
  }

  const communityMatch = pathname.match(/^\/communities\/([^/]+)/);
  if (communityMatch) {
    const facilityId = communityMatch[1];
    if (!facilityId) return [];
    const focus = url.searchParams.get("focus");
    if (focus === "search") {
      return [{ label: "resident explorer rows", warm: () => fetchDataExplorer("residents") }];
    }
    return [
      {
        label: `community snapshot ${facilityId}`,
        warm: () => fetchCommunitySnapshot(decodeRouteSegment(facilityId))
      },
      { label: "communities dashboard", warm: () => fetchCommunitiesDashboard() }
    ];
  }

  if (pathname === "/incidents") {
    return [
      { label: "incident stream", warm: () => fetchIncidentStream() },
      { label: "communities dashboard", warm: () => fetchCommunitiesDashboard() }
    ];
  }

  const explorerKind = getExplorerKind(pathname);
  return explorerKind
    ? [{ label: `data explorer ${explorerKind}`, warm: () => fetchDataExplorer(explorerKind) }]
    : [];
}

function runWorkspaceWarmers(warmers: WorkspaceWarmer[]) {
  return Promise.allSettled(warmers.map(({ warm }) => warm())).then((results) => {
    results.forEach((result, index) => {
      if (result.status === "rejected") {
        console.warn(`Workspace prewarm failed for ${warmers[index]?.label ?? "route"}.`, result.reason);
      }
    });
  });
}

export async function prepareInitialWorkspace(
  route?: string | null,
  options: { maxWaitMs?: number } = {}
) {
  if (typeof window === "undefined") return;
  const warmers = getWorkspaceWarmers(normalizeRoute(route));
  if (!warmers.length) return;

  const requestedWait = options.maxWaitMs ?? POST_SIGN_IN_WORKSPACE_MAX_WAIT_MS;
  const maxWaitMs = Number.isFinite(requestedWait)
    ? Math.max(0, requestedWait)
    : POST_SIGN_IN_WORKSPACE_MAX_WAIT_MS;
  let timeoutId: ReturnType<typeof globalThis.setTimeout> | undefined;

  await Promise.race([
    runWorkspaceWarmers(warmers),
    new Promise<void>((resolve) => {
      timeoutId = globalThis.setTimeout(resolve, maxWaitMs);
    })
  ]);

  if (timeoutId !== undefined) globalThis.clearTimeout(timeoutId);
}

export function preloadWorkspaceSurface(route?: string | null, options: { force?: boolean } = {}) {
  if (typeof window === "undefined") return;
  const normalizedRoute = normalizeRoute(route);
  if (!options.force && scheduledRoutes.has(normalizedRoute)) return;
  scheduledRoutes.add(normalizedRoute);

  idle(() => {
    // Only deduplicate queued work. Imports and data caches are already idempotent,
    // and a failed preload must remain eligible for a later retry.
    scheduledRoutes.delete(normalizedRoute);
    getWorkspaceWarmers(normalizedRoute).forEach(({ label, warm }) => safeWarm(label, warm));
  });
}

export function preloadLikelyWorkspaceSurfaces() {
  if (typeof window === "undefined" || shouldSkipBackgroundPreload()) return;
  preloadWorkspaceSurface("/communities");
  globalThis.setTimeout(() => preloadWorkspaceSurface("/incidents"), 700);
  globalThis.setTimeout(() => preloadWorkspaceSurface("/resident-search"), 1400);
}

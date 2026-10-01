import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  apiScope,
  isE2EAuthBypassEnabled,
  isEntraAuthConfigured,
  loginRequest
} from "../../app/auth/authConfig";
import { normalizePostLoginPath, POST_LOGIN_PATH_KEY } from "../../app/auth/postLoginPath";
import { getAuthenticationErrorMessage } from "../../../shared/auth-redirect-contract.mjs";
import {
  POST_SIGN_IN_WORKSPACE_MAX_WAIT_MS,
  preloadLikelyWorkspaceSurfaces,
  prepareInitialWorkspace
} from "../performance/workspacePreload";
import PlatformPageNavigation from "../../features/california/components/PlatformPageNavigation";
import { AuthenticationProgress } from "../../app/auth/AuthenticationProgress";
import { getAccountAdmissionsAccess } from "../auth/admissionsAccess";
import { isAdmissionsPath } from "../../../shared/admissions-access.mjs";
import { PLATFORM_AUTHENTICATION_REQUIRED_EVENT } from "../api/authenticatedFetch";
import {
  clearPlatformDataCache,
  PLATFORM_DATA_DEGRADED_EVENT,
  PLATFORM_DATA_RECOVERED_EVENT,
  PLATFORM_DATA_REFRESH_EVENT
} from "../api/platformData";
import { writeStorageItem } from "../storage/browserStorage";

export default function ProtectedAppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const isAdmissionsExperience = isAdmissionsPath(location.pathname);
  const isPipelineHandoff = location.pathname === "/pipeline";
  const isStandaloneEditorial =
    location.pathname === "/outreach" || location.pathname === "/fiftystate";
  const isLicensingExperience = location.pathname === "/licensing" || location.pathname === "/analytics/licensing";
  const isCaliforniaExperience =
    location.pathname === "/" ||
    location.pathname === "/questions" ||
    isAdmissionsExperience ||
    location.pathname.startsWith("/analytics") ||
    location.pathname.startsWith("/reports") ||
    location.pathname === "/chat" ||
    location.pathname.startsWith("/home");


  const isAuthenticated = useIsAuthenticated();
  const { accounts, inProgress, instance } = useMsal();
  const effectiveAuthenticated = isE2EAuthBypassEnabled || isAuthenticated;
  const admissionsAccess = getAccountAdmissionsAccess(
    accounts[0],
    isE2EAuthBypassEnabled
  );
  const skipWorkspacePreparation =
    isAdmissionsExperience || isPipelineHandoff || isLicensingExperience || admissionsAccess.restrictedToAdmissions;
  const accountKey = isE2EAuthBypassEnabled
    ? "e2e-authenticated"
    : accounts[0]?.homeAccountId ?? "authenticated";
  const [preparedAccountKey, setPreparedAccountKey] = useState<string | null>(null);
  const [sessionRecoveryPending, setSessionRecoveryPending] = useState(false);
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);
  const [staleDataAt, setStaleDataAt] = useState<number | null>(null);
  const preparationRef = useRef<{ accountKey: string; route: string } | null>(null);
  const authRecoveryStartedRef = useRef(false);
  const landingRouteRef = useRef(`${location.pathname}${location.search}`);

  useLayoutEffect(() => {
    if (isE2EAuthBypassEnabled) return;

    const recoverSession = () => {
      if (authRecoveryStartedRef.current || inProgress !== InteractionStatus.None) return;
      authRecoveryStartedRef.current = true;
      setSessionRecoveryPending(true);

      const returnPath = normalizePostLoginPath(
        `${location.pathname}${location.search}${location.hash}`
      );
      writeStorageItem(POST_LOGIN_PATH_KEY, returnPath, {
        kind: "session",
        label: "post-login path"
      });

      const account = instance.getActiveAccount() ?? accounts[0] ?? null;
      const recovery = account && apiScope
        ? instance.acquireTokenRedirect({ account, scopes: [apiScope] })
        : instance.loginRedirect(loginRequest);

      void recovery.catch((error) => {
        authRecoveryStartedRef.current = false;
        setSessionRecoveryPending(false);
        navigate("/login", {
          replace: true,
          state: {
            forceReauthentication: true,
            recoveryError: getAuthenticationErrorMessage(error),
            from: { pathname: returnPath }
          }
        });
      });
    };

    window.addEventListener(PLATFORM_AUTHENTICATION_REQUIRED_EVENT, recoverSession);
    return () => {
      window.removeEventListener(PLATFORM_AUTHENTICATION_REQUIRED_EVENT, recoverSession);
    };
  }, [accounts, inProgress, instance, location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    const handleOffline = () => setOnline(false);
    const handleOnline = () => {
      setOnline(true);
      window.dispatchEvent(new Event(PLATFORM_DATA_REFRESH_EVENT));
    };
    const handleDegraded = (event: Event) => {
      const cachedAt = Number((event as CustomEvent<{ cachedAt?: number }>).detail?.cachedAt);
      setStaleDataAt(Number.isFinite(cachedAt) && cachedAt > 0 ? cachedAt : Date.now());
    };
    const handleRecovered = () => setStaleDataAt(null);

    window.addEventListener("offline", handleOffline);
    window.addEventListener("online", handleOnline);
    window.addEventListener(PLATFORM_DATA_DEGRADED_EVENT, handleDegraded);
    window.addEventListener(PLATFORM_DATA_RECOVERED_EVENT, handleRecovered);
    return () => {
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener(PLATFORM_DATA_DEGRADED_EVENT, handleDegraded);
      window.removeEventListener(PLATFORM_DATA_RECOVERED_EVENT, handleRecovered);
    };
  }, []);

  useEffect(() => {
    if (!effectiveAuthenticated) {
      clearPlatformDataCache();
      preparationRef.current = null;
      setPreparedAccountKey(null);
      return;
    }
    if (inProgress !== InteractionStatus.None) return;

    if (skipWorkspacePreparation) {
      preparationRef.current = {
        accountKey,
        route: `${location.pathname}${location.search}`
      };
      setPreparedAccountKey(accountKey);
      return;
    }

    if (preparationRef.current?.accountKey !== accountKey) {
      preparationRef.current = {
        accountKey,
        route: landingRouteRef.current
      };
    }

    const preparation = preparationRef.current;
    let active = true;
    void prepareInitialWorkspace(preparation.route, {
      maxWaitMs: POST_SIGN_IN_WORKSPACE_MAX_WAIT_MS
    })
      .catch((error) => {
        console.warn("Initial workspace preparation was unavailable.", error);
      })
      .finally(() => {
        if (active) setPreparedAccountKey(preparation.accountKey);
      });

    return () => {
      active = false;
    };
  }, [
    accountKey,
    effectiveAuthenticated,
    inProgress,
    location.pathname,
    location.search,
    skipWorkspacePreparation
  ]);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      !effectiveAuthenticated ||
      skipWorkspacePreparation ||
      preparedAccountKey !== accountKey
    ) {
      return;
    }

    if ("requestIdleCallback" in window) {
      const callbackId = window.requestIdleCallback(() => {
        preloadLikelyWorkspaceSurfaces();
      }, { timeout: 5000 });
      return () => {
        window.cancelIdleCallback(callbackId);
      };
    }

    const timer = globalThis.setTimeout(() => {
      preloadLikelyWorkspaceSurfaces();
    }, 3500);
    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [accountKey, effectiveAuthenticated, preparedAccountKey, skipWorkspacePreparation]);

  if (!isEntraAuthConfigured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-5 py-10 text-[#111111] sm:px-8">
        <div className="w-full max-w-lg border-y border-[#111111] bg-white py-8">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#a04436]">
            Authentication Setup Required
          </p>
          <h1 className="mt-3 font-serif text-[32px] font-semibold leading-tight tracking-[-0.04em] text-[#111111]">
            Microsoft Entra login is not configured yet.
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-[#595959]">
            An administrator needs to add the Entra application settings and redeploy the platform.
          </p>
        </div>
      </main>
    );
  }

  if (!isE2EAuthBypassEnabled && inProgress !== InteractionStatus.None) {
    return <AuthenticationProgress label="Finishing sign-in" />;
  }

  if (sessionRecoveryPending) {
    return (
      <AuthenticationProgress
        label="Refreshing your sign-in"
        detail="Returning you to the same screen..."
      />
    );
  }

  if (!effectiveAuthenticated) {
    return <AuthenticationRedirect location={location} />;
  }

  if (
    admissionsAccess.restrictedToAdmissions &&
    !isAdmissionsExperience &&
    !isPipelineHandoff
  ) {
    return <AdmissionsZoneRedirect />;
  }

  if (preparedAccountKey !== accountKey) {
    return (
      <AuthenticationProgress
        label="Loading your workspace"
        detail="Preparing current dashboards..."
      />
    );
  }

  return (
    <div className="app-theme-root relative min-h-screen overflow-x-clip bg-white text-[#241f18]">
      <PlatformPageNavigation restricted={admissionsAccess.restrictedToAdmissions} />
      {!online || staleDataAt ? (
        <ConnectionStatusBanner online={online} staleDataAt={staleDataAt} />
      ) : null}
      <main className="min-h-[calc(100dvh-var(--platform-header-height))] min-w-0 bg-white">
        <div
          className={
            isStandaloneEditorial
              ? "px-3 pb-10 pt-3 sm:px-4 sm:pt-4 lg:px-8"
              : isCaliforniaExperience
                ? "px-0 pb-0"
                : location.pathname === "/licensing"
                  ? "px-3 pb-10 pt-3 sm:px-6 lg:px-8 print:p-0"
                  : "px-3 pb-10 pt-5 sm:px-6 lg:px-8 print:p-0"
          }
        >
          <div className={`mx-auto min-h-full w-full ${location.pathname === "/licensing" || isCaliforniaExperience ? "" : "max-w-[1432px]"}`}>
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

function AuthenticationRedirect({
  location
}: {
  location: { pathname: string; search: string; hash: string };
}) {
  const returnPath = normalizePostLoginPath(
    `${location.pathname}${location.search}${location.hash}`
  );
  const [returnPathSaved, setReturnPathSaved] = useState(false);

  useLayoutEffect(() => {
    writeStorageItem(POST_LOGIN_PATH_KEY, returnPath, {
      kind: "session",
      label: "post-login path"
    });
    setReturnPathSaved(true);
  }, [returnPath]);

  if (!returnPathSaved) {
    return <AuthenticationProgress label="Preparing sign-in" />;
  }

  return <Navigate to="/login" replace state={{ from: location }} />;
}

function ConnectionStatusBanner({ online, staleDataAt }: { online: boolean; staleDataAt: number | null }) {
  const loadedAt = staleDataAt
    ? new Date(staleDataAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-platform-connection-status={online ? "stale" : "offline"}
      className="flex min-h-11 items-center justify-between gap-3 border-b border-[#e6cf9d] bg-[#fff8e8] px-4 py-2 text-[11px] leading-5 text-[#694a16] sm:px-6"
    >
      <span>
        {online
          ? `Connection interrupted. Showing information last loaded${loadedAt ? ` at ${loadedAt}` : ""}.`
          : "You’re offline. Previously loaded information stays available and will refresh when the connection returns."}
      </span>
      {online ? (
        <button
          type="button"
          onClick={() => window.dispatchEvent(new Event(PLATFORM_DATA_REFRESH_EVENT))}
          className="min-h-9 shrink-0 rounded-full border border-[#b98b35] bg-white px-3 font-semibold text-[#694a16]"
        >
          Retry
        </button>
      ) : (
        <span className="shrink-0 font-semibold">Waiting to reconnect</span>
      )}
    </div>
  );
}

function AdmissionsZoneRedirect() {
  useEffect(() => {
    window.location.replace("/admissions");
  }, []);

  return (
    <AuthenticationProgress
      label="Opening Admissions"
      detail="Loading your Admissions overview..."
    />
  );
}

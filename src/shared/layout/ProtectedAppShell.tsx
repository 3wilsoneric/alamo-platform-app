import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { isE2EAuthBypassEnabled, isEntraAuthConfigured } from "../../app/auth/authConfig";
import {
  POST_SIGN_IN_WORKSPACE_MAX_WAIT_MS,
  preloadLikelyWorkspaceSurfaces,
  prepareInitialWorkspace
} from "../performance/workspacePreload";
import { PlatformWordmark } from "../branding/PlatformWordmark";
import { AuthenticationProgress } from "../../app/auth/AuthenticationProgress";
import { PlatformUserIdentity } from "../auth/PlatformUserIdentity";
import { getAccountAdmissionsAccess } from "../auth/admissionsAccess";
import { isAdmissionsPath } from "../../../shared/admissions-access.mjs";

export default function ProtectedAppShell() {
  const location = useLocation();
  const isAdmissionsExperience = isAdmissionsPath(location.pathname);
  const isStandaloneEditorial = location.pathname === "/fiftystate";
  const isCaliforniaExperience =
    location.pathname === "/" ||
    location.pathname === "/questions" ||
    location.pathname.startsWith("/analytics") ||
    location.pathname.startsWith("/reports") ||
    location.pathname.startsWith("/home");
  const isCaliforniaMap =
    location.pathname === "/" ||
    location.pathname === "/home" ||
    location.pathname.startsWith("/home/community/");

  const isAuthenticated = useIsAuthenticated();
  const { accounts, inProgress } = useMsal();
  const effectiveAuthenticated = isE2EAuthBypassEnabled || isAuthenticated;
  const admissionsAccess = getAccountAdmissionsAccess(
    accounts[0],
    isE2EAuthBypassEnabled
  );
  const skipWorkspacePreparation =
    isAdmissionsExperience || admissionsAccess.restrictedToAdmissions;
  const accountKey = isE2EAuthBypassEnabled
    ? "e2e-authenticated"
    : accounts[0]?.homeAccountId ?? "authenticated";
  const [preparedAccountKey, setPreparedAccountKey] = useState<string | null>(null);
  const preparationRef = useRef<{ accountKey: string; route: string } | null>(null);
  const landingRouteRef = useRef(`${location.pathname}${location.search}`);

  useEffect(() => {
    if (!effectiveAuthenticated) {
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

  if (!effectiveAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (admissionsAccess.restrictedToAdmissions && !isAdmissionsExperience) {
    return <Navigate to="/admissions" replace />;
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
    <div className="app-theme-root relative min-h-screen overflow-x-hidden bg-white text-[#241f18]">
      {!isStandaloneEditorial && !isCaliforniaExperience ? (
        <>
          <div
            aria-hidden="true"
            className="pointer-events-none fixed inset-x-0 top-0 z-[35] h-[58px] bg-white/95 backdrop-blur-[8px] sm:h-[64px] print:hidden"
          />
          <a
            href="/home"
            aria-label="Go to the Alamo Platform home"
            className="fixed left-4 top-[17px] z-40 text-left sm:left-6 sm:top-[19px] print:hidden"
          >
            <PlatformWordmark />
          </a>
          <div className="fixed right-4 top-4 z-40 sm:right-6 sm:top-5 print:hidden">
            <PlatformUserIdentity />
          </div>
        </>
      ) : null}
      {isCaliforniaMap ? (
        <div className="fixed bottom-5 left-6 z-40 hidden sm:block">
          <PlatformUserIdentity nameSide="right" />
        </div>
      ) : null}
      <main className="min-h-screen overflow-x-hidden bg-white">
        <div
          className={
            isStandaloneEditorial
              ? "px-3 pb-10 pt-3 sm:px-4 sm:pt-4 lg:px-8"
              : isCaliforniaExperience
                ? "px-0 pb-0"
                : "px-3 pb-10 pt-16 sm:px-4 sm:pt-20 lg:px-8 print:px-0 print:pb-0 print:pt-0"
          }
        >
          <div className="mx-auto min-h-full w-full max-w-[1432px]">
            <Outlet />
          </div>
        </div>
      </main>
    </div>
  );
}

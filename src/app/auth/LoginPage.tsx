import { InteractionStatus } from "@azure/msal-browser";
import { useIsAuthenticated, useMsal } from "@azure/msal-react";
import { ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getAuthenticationErrorMessage } from "../../../shared/auth-redirect-contract.mjs";
import { isE2EAuthBypassEnabled, isEntraAuthConfigured, loginRequest } from "./authConfig";
import {
  clearRedirectAuthenticationError,
  readRedirectAuthenticationError
} from "./redirectAuthentication";
import {
  readStorageItem,
  removeStorageItem,
  writeStorageItem
} from "../../shared/storage/browserStorage";
import { normalizePostLoginPath } from "./postLoginPath";
import { PlatformWordmark } from "../../shared/branding/PlatformWordmark";

const POST_LOGIN_PATH_KEY = "alamo-platform-post-login-path";

function MicrosoftMark() {
  return (
    <span className="grid h-[18px] w-[18px] grid-cols-2 gap-[2px]" aria-hidden="true">
      <span className="bg-[#f25022]" />
      <span className="bg-[#7fba00]" />
      <span className="bg-[#00a4ef]" />
      <span className="bg-[#ffb900]" />
    </span>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = useIsAuthenticated();
  const { instance, inProgress } = useMsal();
  const [loginError, setLoginError] = useState<string | null>(() => readRedirectAuthenticationError());
  const [loginRequested, setLoginRequested] = useState(false);

  const fromPath = normalizePostLoginPath(
    (location.state as { from?: { pathname?: string } } | null)?.from?.pathname
  );
  const savedPath = normalizePostLoginPath(
    readStorageItem(POST_LOGIN_PATH_KEY, { kind: "session", label: "post-login path" })
  );

  useEffect(() => {
    if (!isE2EAuthBypassEnabled && !isAuthenticated) return;

    const savedPath = normalizePostLoginPath(
      readStorageItem(POST_LOGIN_PATH_KEY, { kind: "session", label: "post-login path" })
    );
    removeStorageItem(POST_LOGIN_PATH_KEY, { kind: "session", label: "post-login path" });
    clearRedirectAuthenticationError();
    navigate(savedPath, { replace: true });
  }, [isAuthenticated, navigate]);

  if (isE2EAuthBypassEnabled || isAuthenticated) {
    return <Navigate to={savedPath} replace />;
  }

  const handleMicrosoftLogin = async () => {
    setLoginError(null);
    setLoginRequested(true);
    clearRedirectAuthenticationError();
    writeStorageItem(POST_LOGIN_PATH_KEY, fromPath, { kind: "session", label: "post-login path" });
    try {
      await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      await instance.loginRedirect(loginRequest);
    } catch (error) {
      removeStorageItem(POST_LOGIN_PATH_KEY, { kind: "session", label: "post-login path" });
      setLoginRequested(false);
      setLoginError(getAuthenticationErrorMessage(error));
    }
  };

  const signingIn = loginRequested || inProgress !== InteractionStatus.None;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#f7f7f5_0%,#efefec_100%)] px-5 py-10 text-[#111111] sm:px-8">
      <section
        aria-labelledby="sign-in-heading"
        className="w-full max-w-[460px] border border-black/10 bg-white px-7 py-8 shadow-[0_4px_18px_rgba(0,0,0,0.09)] sm:px-9 sm:py-9"
      >
        <div className="border-b border-[#e1dfdd] pb-6">
          <PlatformWordmark display />
        </div>

        <div className="pt-7">
          <h1 id="sign-in-heading" className="text-[28px] font-semibold leading-tight tracking-[-0.035em] text-[#1b1a19]">
            Sign in
          </h1>
          <p className="mt-2 max-w-[38ch] text-[14px] leading-6 text-[#605e5c]">
            Use your Alamo Health Microsoft account to continue to the platform.
          </p>

          {isEntraAuthConfigured ? (
            <button
              type="button"
              onClick={() => void handleMicrosoftLogin()}
              disabled={signingIn}
              className="mt-7 inline-flex h-12 w-full items-center justify-center gap-3 border border-[#8a8886] bg-white px-5 text-[14px] font-semibold text-[#242424] shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[background-color,border-color,box-shadow] hover:border-[#605e5c] hover:bg-[#f5f5f5] hover:shadow-[0_2px_5px_rgba(0,0,0,0.1)] disabled:cursor-wait disabled:border-[#c8c6c4] disabled:bg-[#f5f5f5] disabled:text-[#777777]"
            >
              {signingIn ? (
                <span className="h-[18px] w-[18px] animate-spin rounded-full border-2 border-[#c8c6c4] border-t-[#0f8b73]" aria-hidden="true" />
              ) : (
                <MicrosoftMark />
              )}
              {signingIn ? "Connecting to Microsoft..." : "Continue with Microsoft"}
            </button>
          ) : null}
        </div>

        {!isEntraAuthConfigured ? (
          <div role="alert" className="mt-6 border-l-2 border-[#a04436] bg-[#fff7f5] px-4 py-3 text-[13px] leading-6 text-[#5e2c24]">
            Microsoft sign-in is not configured for this deployment. An administrator needs to add the Entra application settings before anyone can sign in.
          </div>
        ) : loginError ? (
          <div role="alert" className="mt-6 border-l-2 border-[#a04436] bg-[#fff7f5] px-4 py-3 text-[13px] leading-6 text-[#5e2c24]">
            {loginError}
          </div>
        ) : null}

        <div className="mt-7 flex items-start gap-2.5 border-t border-[#e1dfdd] pt-5 text-[12px] leading-5 text-[#737373]">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#0f8b73]" aria-hidden="true" />
          <p>Access is limited to authorized Alamo Health accounts.</p>
        </div>
      </section>
    </main>
  );
}

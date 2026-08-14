import React from "react";
import ReactDOM from "react-dom/client";
import { MsalProvider } from "@azure/msal-react";
import { BrowserRouter } from "react-router-dom";
import App from "./app/App";
import { AppProviders } from "./app/providers/AppProviders";
import { authConfig, msalInstance } from "./app/auth/authConfig";
import { initializeRedirectAuthentication } from "./app/auth/redirectAuthentication";
import { getAuthenticationErrorMessage } from "../shared/auth-redirect-contract.mjs";
import { PlatformWordmark } from "./shared/branding/PlatformWordmark";
import "./styles.css";

async function bootstrap() {
  await initializeRedirectAuthentication(msalInstance);

  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <MsalProvider instance={msalInstance}>
        <BrowserRouter>
          <AppProviders>
            <App />
          </AppProviders>
        </BrowserRouter>
      </MsalProvider>
    </React.StrictMode>
  );
}

bootstrap().catch((error) => {
  console.error("Microsoft Entra bootstrap failed.", error);
  const signInError = getAuthenticationErrorMessage(error);
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <main className="flex min-h-screen items-center justify-center bg-white p-8 text-[#111111]">
      <div className="w-full max-w-xl border-y border-[#d9d9d9] bg-white py-8">
        <PlatformWordmark />
        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#a04436]">
          Sign-in could not start
        </p>
        <h1 className="mt-3 text-[24px] font-semibold tracking-[-0.035em]">
          The app could not initialize Microsoft Entra.
        </h1>
        <p className="mt-3 text-[14px] leading-6 text-[#595959]">
          {signInError}
        </p>
        <div className="mt-5 border-l-2 border-[#d9d9d9] bg-[#fafafa] px-4 py-3 text-[12px] leading-6 text-[#595959]">
          Sign-in return address: <span className="font-medium text-[#111111]">{authConfig.redirectUri}</span>
        </div>
      </div>
    </main>
  );
});

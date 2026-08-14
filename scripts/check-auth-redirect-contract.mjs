#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  getAuthenticationErrorCode,
  getAuthenticationErrorMessage,
  getSameOriginLoginRedirectUri
} from "../shared/auth-redirect-contract.mjs";

assert.equal(
  getSameOriginLoginRedirectUri("https://www.alamoplatform.com"),
  "https://www.alamoplatform.com/login"
);
assert.equal(
  getSameOriginLoginRedirectUri("https://alamoplatform.com/ignored/path"),
  "https://alamoplatform.com/login"
);
assert.equal(
  getSameOriginLoginRedirectUri("http://localhost:3001"),
  "http://localhost:3001/login"
);
assert.throws(() => getSameOriginLoginRedirectUri("ftp://alamoplatform.com"));
assert.throws(() => getSameOriginLoginRedirectUri("https://user:pass@alamoplatform.com"));
assert.throws(() => getSameOriginLoginRedirectUri("not a url"));

assert.match(
  getAuthenticationErrorMessage({ errorCode: "redirect_uri_mismatch" }),
  /return address/i
);
assert.match(
  getAuthenticationErrorMessage({
    errorCode: "server_error",
    message: "AADSTS500011: resource principal not found"
  }),
  /expose.*access_as_user/i
);
assert.match(
  getAuthenticationErrorMessage({ errorCode: "consent_required", message: "AADSTS65001" }),
  /administrator consent/i
);
assert.equal(
  getAuthenticationErrorCode({ errorCode: "server_error", message: "AADSTS50011: bad callback" }),
  "AADSTS50011"
);
assert.equal(getAuthenticationErrorCode({ errorCode: "invalid_scope" }), "invalid_scope");
assert.equal(getAuthenticationErrorCode(new Error("unclassified failure")), null);
assert.match(
  getAuthenticationErrorMessage({ errorCode: "invalid_scope" }),
  /API permission/i
);
assert.match(
  getAuthenticationErrorMessage({ errorCode: "user_cancelled" }),
  /canceled/i
);
assert.match(
  getAuthenticationErrorMessage(new Error("network timeout")),
  /connection/i
);

const root = path.resolve(import.meta.dirname, "..");
const authConfig = await readFile(path.join(root, "src/app/auth/authConfig.ts"), "utf8");
const app = await readFile(path.join(root, "src/app/App.tsx"), "utf8");
const viteConfig = await readFile(path.join(root, "vite.config.ts"), "utf8");
const vercelConfig = JSON.parse(await readFile(path.join(root, "vercel.json"), "utf8"));
const main = await readFile(path.join(root, "src/main.tsx"), "utf8");
const redirectAuthentication = await readFile(
  path.join(root, "src/app/auth/redirectAuthentication.ts"),
  "utf8"
);
const loginPage = await readFile(path.join(root, "src/app/auth/LoginPage.tsx"), "utf8");
const protectedShell = await readFile(
  path.join(root, "src/shared/layout/ProtectedAppShell.tsx"),
  "utf8"
);
const workspacePreload = await readFile(
  path.join(root, "src/shared/performance/workspacePreload.ts"),
  "utf8"
);
if (authConfig.includes("VITE_ENTRA_REDIRECT_URI")) {
  throw new Error("authConfig.ts must not accept a cross-origin redirect override");
}
if (!authConfig.includes("getSameOriginLoginRedirectUri(window.location.origin)")) {
  throw new Error("authConfig.ts must derive the callback from the current browser origin");
}
if (!authConfig.includes("navigateToLoginRequestUrl: false")) {
  throw new Error("authConfig.ts must leave post-login routing to the app instead of starting a second Microsoft navigation");
}
if (!app.includes('path="/" element={withRouteBoundary(<CaliforniaHomePage />)}')) {
  throw new Error("App.tsx must render the authenticated California workspace as the root route");
}
if (
  !app.includes('path="/questions" element={withRouteBoundary(<CaliforniaHomePage />)}') ||
  !app.includes('path="/analytics" element={withRouteBoundary(<CaliforniaHomePage />)}') ||
  !app.includes('path="/reports" element={withRouteBoundary(<CaliforniaHomePage />)}')
) {
  throw new Error("App.tsx must keep Questions, Analytics, and the legacy reports route inside the California workspace carousel");
}
if (!viteConfig.includes("modulePreload: false")) {
  throw new Error("vite.config.ts must not wrap lazy routes in the production dependency-preload path");
}
if (app.includes("lazy(") || app.includes("<Suspense")) {
  throw new Error("App.tsx must not put registered platform routes behind a production lazy-loading boundary");
}
const securityHeaders = new Map(
  (vercelConfig.headers ?? [])
    .flatMap((rule) => rule.headers ?? [])
    .map((header) => [header.key, header.value])
);
const contentSecurityPolicy = securityHeaders.get("Content-Security-Policy") ?? "";
if (!contentSecurityPolicy.includes("frame-ancestors 'self'")) {
  throw new Error("Production CSP must allow the same-origin Microsoft callback iframe to return to /login");
}
if (!contentSecurityPolicy.includes("frame-src 'self' https://login.microsoftonline.com")) {
  throw new Error("Production CSP must allow both Microsoft and the same-origin silent-auth callback frame");
}
if (securityHeaders.get("X-Frame-Options") !== "SAMEORIGIN") {
  throw new Error("X-Frame-Options must agree with the same-origin MSAL callback frame policy");
}
if (!main.includes("initializeRedirectAuthentication(msalInstance)")) {
  throw new Error("main.tsx must process the Microsoft redirect before rendering the app");
}
if (!redirectAuthentication.includes("handleRedirectPromise()")) {
  throw new Error("redirect authentication must process the Microsoft callback");
}
if (!redirectAuthentication.includes("setActiveAccount")) {
  throw new Error("redirect authentication must select the returned Microsoft account");
}
if (!redirectAuthentication.includes("AUTH_REDIRECT_ERROR_KEY")) {
  throw new Error("redirect authentication must preserve callback failures for the login UI");
}
if (!loginPage.includes("readRedirectAuthenticationError()")) {
  throw new Error("LoginPage must display a preserved Microsoft callback failure");
}
if (
  !workspacePreload.includes("POST_SIGN_IN_WORKSPACE_MAX_WAIT_MS = 2_000") ||
  !workspacePreload.includes("prepareInitialWorkspace") ||
  !workspacePreload.includes('label: "home dashboard", warm: () => fetchHomeDashboard()')
) {
  throw new Error("post-sign-in preparation must immediately warm the landing dashboard with a two-second ceiling");
}
if (
  !protectedShell.includes("prepareInitialWorkspace") ||
  !protectedShell.includes('label="Loading your workspace"') ||
  !protectedShell.includes('detail="Preparing current dashboards..."')
) {
  throw new Error("the authenticated shell must hold first paint behind the bounded workspace preparation state");
}

console.log("auth redirect contract checks passed");

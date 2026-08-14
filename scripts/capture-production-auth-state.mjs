#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const ROOT = process.cwd();
const BASE_URL = String(process.env.PRODUCTION_SIGNED_IN_BASE_URL || process.env.PRODUCTION_SMOKE_BASE_URL || "https://www.alamoplatform.com").replace(/\/+$/, "");
const STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_SIGNED_IN_STORAGE_STATE || ".auth/alamo-production-storage-state.json"
);
const SESSION_STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_SIGNED_IN_SESSION_STORAGE_STATE || STORAGE_STATE.replace(/\.json$/i, ".session-storage.json")
);
const TIMEOUT_MS = Number(process.env.PRODUCTION_AUTH_CAPTURE_TIMEOUT_MS || 300_000);
const HEADED = process.env.PRODUCTION_AUTH_CAPTURE_HEADLESS !== "true";

function buildUrl(pathname) {
  return `${BASE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

async function getPageState(page) {
  if (page.isClosed()) return null;
  try {
    return await page.evaluate(() => {
      const text = document.body?.innerText || "";
      const url = window.location.href;
      return {
        url,
        title: document.title,
        textSample: text.slice(0, 1200),
        isMicrosoftLogin: /login\.microsoftonline\.com/i.test(url) || /Sign in|Pick an account/i.test(text),
        isAppLogin: /\/login(?:$|[?#])/i.test(url) || /Continue with Microsoft/i.test(text),
        hasLoginButton: /Continue with Microsoft/i.test(text),
        hasWorkspace: Boolean(document.querySelector("textarea[placeholder*='Ask']")) ||
          /Ask the platform|Communities|Incidents|Resident Search/i.test(text)
      };
    });
  } catch (error) {
    return {
      url: page.url(),
      title: "",
      textSample: "",
      isMicrosoftLogin: /login\.microsoftonline\.com/i.test(page.url()),
      isAppLogin: false,
      hasLoginButton: false,
      hasWorkspace: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function maybeClickMicrosoftLogin(page, state) {
  if (!state?.hasLoginButton || page.isClosed()) return false;
  const button = page.getByRole("button", { name: /continue with microsoft/i });
  if (!(await button.count().catch(() => 0))) return false;
  await button.first().click({ timeout: 10_000 }).catch(() => {});
  return true;
}

async function writeCaptureReport(status, details = {}, context = null) {
  const artifactDir = path.join(ROOT, "generated", "production-auth-capture");
  const screenshotDir = path.join(artifactDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  const pages = context ? await Promise.all(
    context.pages().map(async (page, index) => {
      const state = await getPageState(page);
      const screenshotPath = path.join(screenshotDir, `page-${index + 1}.png`);
      if (state && !page.isClosed()) {
        await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
      }
      return {
        ...state,
        screenshotPath: state && !page.isClosed() ? screenshotPath : null
      };
    })
  ) : [];

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    storageStatePath: path.relative(ROOT, STORAGE_STATE),
    sessionStorageStatePath: path.relative(ROOT, SESSION_STORAGE_STATE),
    status,
    ...details,
    pages
  };
  await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
  return report;
}

async function saveSignedInState(context, page) {
  await context.storageState({ path: STORAGE_STATE });
  const sessionState = await page.evaluate(() => ({
    origin: window.location.origin,
    entries: Object.fromEntries(Object.entries(window.sessionStorage))
  }));
  await writeFile(SESSION_STORAGE_STATE, JSON.stringify(sessionState, null, 2));
  await writeFile(
    path.join(path.dirname(STORAGE_STATE), "README.md"),
    [
      "# Local Auth State",
      "",
      "This directory stores local Playwright browser storage state for signed-in production smoke tests.",
      "It is intentionally gitignored and should not be committed."
    ].join("\n")
  );
  await writeCaptureReport("pass", { passed: true }, context);
}

async function main() {
  await mkdir(path.dirname(STORAGE_STATE), { recursive: true });

  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: !HEADED
  }).catch(() => chromium.launch({ headless: !HEADED }));

  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 920 } });
    const page = await context.newPage();
    console.log(`Opening ${buildUrl("/home")}`);
    console.log("I will click the app's Microsoft sign-in button. Complete the Microsoft sign-in when prompted; auth state saves once the workspace is visible.");

    await page.goto(buildUrl("/home"), { waitUntil: "domcontentloaded", timeout: TIMEOUT_MS });
    const deadline = Date.now() + TIMEOUT_MS;
    let clickedLogin = false;

    while (Date.now() < deadline) {
      for (const candidate of context.pages()) {
        const state = await getPageState(candidate);
        if (!state) continue;

        if (state.hasWorkspace && !state.isMicrosoftLogin && !state.isAppLogin) {
          await saveSignedInState(context, candidate);
          console.log(`Saved signed-in production auth state -> ${path.relative(ROOT, STORAGE_STATE)}`);
          console.log(`Saved signed-in session storage -> ${path.relative(ROOT, SESSION_STORAGE_STATE)}`);
          return;
        }

        if (!clickedLogin && await maybeClickMicrosoftLogin(candidate, state)) {
          clickedLogin = true;
          console.log("Clicked Continue with Microsoft. Complete the Microsoft sign-in in the browser window.");
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    await writeCaptureReport("fail", {
      passed: false,
      reason: "Timed out before the signed-in workspace was detected."
    }, context);
    throw new Error(`Timed out after ${Math.round(TIMEOUT_MS / 1000)} seconds before signed-in workspace was detected.`);
  } finally {
    await browser.close().catch(() => {});
  }
}

await main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (/Target page, context or browser has been closed/i.test(message)) {
    console.error("Production auth capture stopped because the browser window was closed before the signed-in workspace was detected.");
  } else if (/Timeout/i.test(message)) {
    console.error(`Production auth capture timed out after ${Math.round(TIMEOUT_MS / 1000)} seconds before the signed-in workspace was detected.`);
  } else {
    console.error(`Production auth capture failed: ${message}`);
  }
  console.error(`No auth state was saved. Re-run: npm run capture:production-auth`);
  console.error("Diagnostics: generated/production-auth-capture/latest.json");
  process.exitCode = 1;
});

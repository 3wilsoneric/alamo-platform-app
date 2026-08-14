#!/usr/bin/env node
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";
import { getCertifiedQuestionMenuRoutes } from "../shared/certified-analyst-questions.mjs";

const ROOT = process.cwd();
const BASE_URL = String(
  process.env.PRODUCTION_SIGNED_IN_BASE_URL ||
  process.env.PRODUCTION_SMOKE_BASE_URL ||
  "https://www.alamoplatform.com"
).replace(/\/+$/, "");
const STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_SIGNED_IN_STORAGE_STATE || ".auth/alamo-production-storage-state.json"
);
const SESSION_STORAGE_STATE = path.resolve(
  ROOT,
  process.env.PRODUCTION_SIGNED_IN_SESSION_STORAGE_STATE ||
  STORAGE_STATE.replace(/\.json$/i, ".session-storage.json")
);
const REQUIRED = process.env.PRODUCTION_SIGNED_IN_REQUIRED === "true";
const AUTH_BYPASS = process.env.PRODUCTION_GUIDED_AUTH_BYPASS === "true";
const QUESTION_TIMEOUT_MS = Number(process.env.PRODUCTION_GUIDED_QUESTION_TIMEOUT_MS || 45_000);
const SETTLE_MS = Number(process.env.PRODUCTION_GUIDED_QUESTION_SETTLE_MS || 1_500);
const ROUTE_FILTER = new Set(
  String(process.env.PRODUCTION_GUIDED_QUESTION_IDS || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
);

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  if (!(await exists(filePath))) return null;
  return JSON.parse(await readFile(filePath, "utf8"));
}

function searchText(prompt) {
  return String(prompt)
    .replace(/\{[^}]+\}/g, " ")
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitize(value) {
  return String(value)
    .replace(/([?#&](?:code|state|session_state|id_token|access_token|nonce)=)[^&\s'"\]]+/gi, "$1[redacted]")
    .slice(0, 2_000);
}

async function ensureGuideOpen(page) {
  const guide = page.locator('[data-certified-question-guide="true"]').last();
  if (await guide.isVisible().catch(() => false)) return guide;

  const openButton = page
    .getByRole("button", { name: /^(Ask a question|Open questions|Choose another question|Questions)$/i })
    .filter({ visible: true })
    .last();
  await openButton.click({ timeout: 10_000 });
  await guide.waitFor({ state: "visible", timeout: 10_000 });
  return guide;
}

async function waitForSignedInWorkspace(page) {
  await page.locator('a[href="/home"]').first().waitFor({
    state: "visible",
    timeout: 10_000
  });
  await page.waitForFunction(
    () => {
      const guide = document.querySelector('[data-certified-question-guide="true"]');
      if (guide) {
        const rect = guide.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) return true;
      }

      return Array.from(document.querySelectorAll("button")).some((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          /^(Ask a question|Open questions|Choose another question|Questions)$/i.test(
            String(button.textContent || "").trim()
          )
        );
      });
    },
    undefined,
    { timeout: 10_000 }
  );
}

async function pickOption(page, trigger) {
  const variableId = await trigger.getAttribute("data-question-variable-id") || "";
  await trigger.click();
  const menu = page.locator('[data-question-variable-menu="true"]');
  await menu.waitFor({ state: "visible", timeout: 5_000 });
  const options = menu.locator("[data-question-variable-option]");
  const optionCount = await options.count();
  if (!optionCount) throw new Error(`No options were rendered for ${variableId || "a question selector"}.`);

  const preferredPattern = variableId === "startMonth"
    ? /April 2026/i
    : variableId === "endMonth" || variableId === "month"
      ? /May 2026/i
      : /incidentCategory|category/i.test(variableId)
        ? /AWOL|Elopement/i
        : null;
  const preferred = preferredPattern ? options.filter({ hasText: preferredPattern }).first() : null;
  if (preferred && await preferred.count()) {
    await preferred.click();
    return;
  }

  await options.first().click();
}

async function waitForAnswerOrFailure(page) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText || "";
      return (
        document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]').length > 0 ||
        /Safe mode|could not render/i.test(text)
      );
    },
    undefined,
    { timeout: QUESTION_TIMEOUT_MS }
  ).catch(() => {});

  await page.waitForFunction(
    () => !/Thinking through the data|Still working through the data/i.test(document.body.innerText || ""),
    undefined,
    { timeout: QUESTION_TIMEOUT_MS }
  ).catch(() => {});
  await page.waitForTimeout(SETTLE_MS);
}

async function readState(page) {
  return page.evaluate(() => {
    const bodyText = document.body.innerText || "";
    const alerts = Array.from(document.querySelectorAll('[role="alert"]'))
      .map((element) => String(element.textContent || "").replace(/\s+/g, " ").trim())
      .filter(Boolean);
    const assistants = Array.from(
      document.querySelectorAll('[data-chat-item-id][data-chat-role="assistant"]')
    );
    const latestAssistant = assistants.at(-1);
    const assistantText = String(latestAssistant?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 1_200);
    return {
      url: window.location.href,
      safeModeVisible: /Safe mode|Workspace view could not render|could not render/i.test(bodyText),
      alerts,
      assistantCount: assistants.length,
      assistantText,
      analysisFailureVisible:
        /analysis request failed|analysis fallback|structured data tool did not respond|could not answer that exact slice safely/i.test(
          assistantText
        ),
      guideVisible: Boolean(document.querySelector('[data-certified-question-guide="true"]')),
      thinkingVisible: /Thinking through the data|Still working through the data/i.test(bodyText),
      horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth
    };
  });
}

async function runRoute(page, route, screenshotDir) {
  const consoleErrors = [];
  const pageErrors = [];
  const requestFailures = [];
  const handleConsole = (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    if (/Unsafe attempt to initiate navigation.*login\.microsoftonline\.com/i.test(text)) return;
    const location = message.location();
    const source = location?.url ? `${location.url}${location.lineNumber ? `:${location.lineNumber}` : ""}` : "";
    consoleErrors.push(sanitize(source ? `${text} (${source})` : text));
  };
  const handlePageError = (error) => pageErrors.push(sanitize(error.stack || error.message));
  const handleRequestFailure = (request) => {
    const url = request.url();
    if (!url.startsWith(BASE_URL) || !/\/api\//.test(url)) return;
    if (/net::ERR_ABORTED/i.test(request.failure()?.errorText || "")) return;
    requestFailures.push({
      url: sanitize(url),
      error: sanitize(request.failure()?.errorText || "unknown")
    });
  };
  page.on("console", handleConsole);
  page.on("pageerror", handlePageError);
  page.on("requestfailed", handleRequestFailure);

  let state = null;
  let runError = null;
  const startedAt = Date.now();
  try {
    await page.goto(`${BASE_URL}/questions`, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForSignedInWorkspace(page);
    const guide = await ensureGuideOpen(page);
    const search = guide.locator('[data-certified-question-search="true"]');
    await search.fill(searchText(route.prompt));

    const row = guide.locator(
      `[data-certified-question-button="true"][data-certified-question-id="${route.id}"]`
    );
    await row.waitFor({ state: "visible", timeout: 10_000 });
    const triggers = row.locator('[data-question-variable-trigger="true"]');
    for (let index = 0; index < await triggers.count(); index += 1) {
      await pickOption(page, triggers.nth(index));
    }

    const submit = row.locator('[data-certified-question-submit="true"]');
    await submit.waitFor({ state: "visible", timeout: 5_000 });
    if (!(await submit.isEnabled())) throw new Error("Question submit stayed disabled after selectors were completed.");
    await submit.click();
    await waitForAnswerOrFailure(page);
    state = await readState(page);
  } catch (error) {
    runError = error instanceof Error ? error.stack || error.message : String(error);
    state = await readState(page).catch(() => null);
  }

  const screenshotPath = path.join(
    screenshotDir,
    `${route.id.replace(/[^a-z0-9]+/gi, "-")}.png`
  );
  await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
  page.off("console", handleConsole);
  page.off("pageerror", handlePageError);
  page.off("requestfailed", handleRequestFailure);

  const failures = [];
  if (runError) failures.push(sanitize(runError));
  if (!state?.assistantCount) failures.push("No assistant answer rendered.");
  if (state?.safeModeVisible) failures.push("Safe Mode rendered after the question ran.");
  if (state?.analysisFailureVisible) failures.push("The question rendered a generic analysis failure.");
  if (state?.thinkingVisible) failures.push("The question remained stuck in its loading state.");
  if ((state?.horizontalOverflow ?? 0) > 1) failures.push(`Page overflowed horizontally by ${state.horizontalOverflow}px.`);
  if (consoleErrors.length) failures.push(`Console errors: ${consoleErrors.join(" | ")}`);
  if (pageErrors.length) failures.push(`Page errors: ${pageErrors.join(" | ")}`);
  if (requestFailures.length) failures.push(`API request failures: ${JSON.stringify(requestFailures)}`);

  return {
    routeId: route.id,
    prompt: route.prompt,
    passed: failures.length === 0,
    failures,
    elapsedMs: Date.now() - startedAt,
    state,
    consoleErrors,
    pageErrors,
    requestFailures,
    screenshotPath
  };
}

async function main() {
  const artifactDir = path.join(ROOT, "generated", "production-guided-question-qa");
  const screenshotDir = path.join(artifactDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });

  if (!AUTH_BYPASS && !(await exists(STORAGE_STATE))) {
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      passed: !REQUIRED,
      status: "skipped",
      reason: "Signed-in production storage state is missing."
    };
    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
    if (REQUIRED) process.exitCode = 1;
    console.log(`production guided question QA skipped: missing ${path.relative(ROOT, STORAGE_STATE)}`);
    return;
  }

  const browser = await chromium.launch({
    channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
    headless: process.env.PRODUCTION_SIGNED_IN_HEADED !== "true"
  }).catch(() => chromium.launch({ headless: true }));
  try {
    const context = await browser.newContext({
      ...(AUTH_BYPASS ? {} : { storageState: STORAGE_STATE }),
      viewport: { width: 1440, height: 920 }
    });
    const sessionState = AUTH_BYPASS ? null : await readJson(SESSION_STORAGE_STATE);
    if (sessionState?.origin && sessionState?.entries) {
      await context.addInitScript((saved) => {
        if (window.location.origin !== saved.origin) return;
        Object.entries(saved.entries).forEach(([key, value]) => {
          if (window.sessionStorage.getItem(key) === null) {
            window.sessionStorage.setItem(key, String(value));
          }
        });
      }, sessionState);
    }

    const routes = getCertifiedQuestionMenuRoutes().filter((route) => (
      !ROUTE_FILTER.size || ROUTE_FILTER.has(route.id) || ROUTE_FILTER.has(route.questionId)
    ));
    const page = await context.newPage();
    const results = [];
    for (const [index, route] of routes.entries()) {
      console.log(`production guided question ${index + 1}/${routes.length}: ${route.id}`);
      results.push(await runRoute(page, route, screenshotDir));
    }
    await page.close();
    await context.close();

    const passed = results.every((result) => result.passed);
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl: BASE_URL,
      passed,
      summary: {
        questions: results.length,
        passed: results.filter((result) => result.passed).length,
        failed: results.filter((result) => !result.passed).length,
        safeModeFailures: results.filter((result) => result.state?.safeModeVisible).length,
        analysisFailures: results.filter((result) => result.state?.analysisFailureVisible).length
      },
      results
    };
    await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));
    if (!passed) {
      console.error(JSON.stringify({
        summary: report.summary,
        failures: results.filter((result) => !result.passed).map((result) => ({
          routeId: result.routeId,
          failures: result.failures
        }))
      }, null, 2));
      process.exitCode = 1;
      return;
    }
    console.log(`production guided question QA passed: ${results.length}/${results.length}`);
  } finally {
    await browser.close().catch(() => {});
  }
}

await main();

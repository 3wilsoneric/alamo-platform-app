import { chromium } from "playwright";
import { spawn } from "node:child_process";
import net from "node:net";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { matchCertifiedQuestion } from "../shared/certified-analyst-questions.mjs";
import { understandQuery } from "../shared/query-understanding.mjs";

const ROOT = process.cwd();
const BASE_URL_WAS_EXPLICIT = Boolean(process.env.BROWSER_MISSION_BASE_URL);
const API_URL_WAS_EXPLICIT = Boolean(process.env.BROWSER_MISSION_API_URL);
const EXPLICIT_PORT_OFFSET = Number(process.env.BROWSER_QA_PORT_OFFSET || 0);
const RUN_PORT_BASE = 20_000 + ((process.pid % 15_000) * 2);
const DEFAULT_APP_PORT = EXPLICIT_PORT_OFFSET ? 3101 + EXPLICIT_PORT_OFFSET : RUN_PORT_BASE;
const DEFAULT_API_PORT = EXPLICIT_PORT_OFFSET ? 3002 + EXPLICIT_PORT_OFFSET : RUN_PORT_BASE + 1;
export let BASE_URL = process.env.BROWSER_MISSION_BASE_URL || `http://127.0.0.1:${DEFAULT_APP_PORT}`;
let API_URL = process.env.BROWSER_MISSION_API_URL || `http://127.0.0.1:${DEFAULT_API_PORT}/api/platform/health`;
const MANAGED = process.env.BROWSER_MISSION_MANAGED !== "false";
const HEADLESS = process.env.BROWSER_MISSION_HEADED !== "true";
export const TIMEOUT_MS = Number(process.env.BROWSER_MISSION_TIMEOUT_MS || 45_000);
const SERVER_START_TIMEOUT_MS = Number(
  process.env.BROWSER_QA_SERVER_START_TIMEOUT_MS || Math.max(TIMEOUT_MS, 60_000)
);
const SERVER_PROBE_TIMEOUT_MS = Number(
  process.env.BROWSER_QA_SERVER_PROBE_TIMEOUT_MS || 5_000
);
const STRICT_SERVER_GUARD = process.env.BROWSER_QA_STRICT_SERVER_GUARD !== "false";
const CLEAN_ROOM = process.env.BROWSER_QA_CLEAN_ROOM !== "false";
const REUSE_EXISTING_APP = process.env.BROWSER_QA_REUSE_EXISTING_APP === "true";
const managedProcessGroups = new Set();
let managedProcessCleanupRegistered = false;

function signalManagedProcessGroups(signal = "SIGTERM") {
  for (const pid of managedProcessGroups) {
    try {
      if (process.platform === "win32") process.kill(pid, signal);
      else process.kill(-pid, signal);
    } catch {
      // Cleanup is best-effort; the child may have exited between checks.
    }
  }
}

function registerManagedProcessGroup(child) {
  if (child.pid) managedProcessGroups.add(child.pid);
  if (managedProcessCleanupRegistered) return;
  managedProcessCleanupRegistered = true;

  process.once("exit", () => {
    signalManagedProcessGroups("SIGTERM");
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      signalManagedProcessGroups("SIGTERM");
      process.exit(signal === "SIGINT" ? 130 : 143);
    });
  }
}

function redact(value) {
  return String(value)
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, "[redacted-key]")
    .replace(/([A-Z0-9]{20,})/g, (match) => (match.length > 36 ? "[redacted-token]" : match));
}

export async function prepareArtifactDirs(name) {
  const artifactDir = path.join(ROOT, "generated", name);
  const screenshotDir = path.join(artifactDir, "screenshots");
  await mkdir(screenshotDir, { recursive: true });
  return { artifactDir, screenshotDir };
}

async function isReachable(url) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SERVER_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return response.ok || response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function waitForReachable(url, timeoutMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isReachable(url)) return true;
    await delay(500);
  }
  return false;
}

function parseServerUrl(url, fallbackPort) {
  try {
    const parsed = new URL(url);
    return {
      host: parsed.hostname || "127.0.0.1",
      port: Number(parsed.port || fallbackPort)
    };
  } catch {
    return {
      host: "127.0.0.1",
      port: fallbackPort
    };
  }
}

function buildServerUrl(url, port) {
  const parsed = new URL(url);
  parsed.port = String(port);
  return parsed.toString().replace(/\/$/, "");
}

function canListen(host, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen({ host, port });
  });
}

async function chooseCleanRoomBaseUrl() {
  if (!CLEAN_ROOM || REUSE_EXISTING_APP) return;

  const { host, port } = parseServerUrl(BASE_URL, DEFAULT_APP_PORT);
  const searchLimit = BASE_URL_WAS_EXPLICIT ? 0 : 24;

  for (let candidate = port; candidate <= port + searchLimit; candidate += 1) {
    if (await canListen(host, candidate)) {
      if (candidate !== port) {
        BASE_URL = buildServerUrl(BASE_URL, candidate);
        console.log(`browser QA clean-room app port ${port} was busy; using ${BASE_URL}`);
      }
      return;
    }
  }

  throw new Error(
    BASE_URL_WAS_EXPLICIT
      ? `Browser QA clean-room port is busy at ${BASE_URL}. Stop that process or set BROWSER_QA_REUSE_EXISTING_APP=true.`
      : `Browser QA clean-room ports ${port}-${port + searchLimit} are busy. Stop stale Vite processes or set BROWSER_MISSION_BASE_URL to a free port.`
  );
}

async function chooseCleanRoomApiUrl() {
  if (!CLEAN_ROOM || REUSE_EXISTING_APP) return;

  const { host, port } = parseServerUrl(API_URL, DEFAULT_API_PORT);
  const searchLimit = API_URL_WAS_EXPLICIT ? 0 : 24;

  for (let candidate = port; candidate <= port + searchLimit; candidate += 1) {
    if (await canListen(host, candidate)) {
      if (candidate !== port) {
        API_URL = buildServerUrl(API_URL, candidate);
        console.log(`browser QA clean-room API port ${port} was busy; using ${API_URL}`);
      }
      return;
    }
  }

  throw new Error(
    API_URL_WAS_EXPLICIT
      ? `Browser QA clean-room API port is busy at ${API_URL}. Stop that process or set BROWSER_QA_REUSE_EXISTING_APP=true.`
      : `Browser QA clean-room API ports ${port}-${port + searchLimit} are busy. Stop stale dev API processes or set BROWSER_MISSION_API_URL to a free port.`
  );
}

function getApiPort() {
  return String(parseServerUrl(API_URL, DEFAULT_API_PORT).port);
}

function getApiOrigin() {
  const parsed = new URL(API_URL);
  return `${parsed.protocol}//${parsed.host}`;
}

function viteArgsForBaseUrl() {
  const { host, port } = parseServerUrl(BASE_URL, DEFAULT_APP_PORT);
  return ["run", "dev", "--", "--host", host, "--port", String(port), "--strictPort"];
}

async function readTextProbe(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      url,
      text: redact(text).slice(0, 4000)
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      error: error instanceof Error ? error.message : String(error),
      text: ""
    };
  }
}

async function readJsonProbe(url) {
  try {
    const response = await fetch(url, { method: "GET" });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }

    return {
      ok: response.ok,
      status: response.status,
      url,
      text: redact(text).slice(0, 4000),
      json
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      url,
      json: null,
      error: error instanceof Error ? error.message : String(error),
      text: ""
    };
  }
}

export async function getBrowserQaServerSnapshot() {
  const app = await readTextProbe(`${BASE_URL}/home`);
  const api = await readJsonProbe(API_URL);
  const appLooksLikeAlamo =
    app.ok &&
    /<title>\s*Alamo Platform\s*<\/title>/i.test(app.text) &&
    /<div id="root">/i.test(app.text) &&
    /\bAlamo\b|app-boot-shell/i.test(app.text);
  const apiLooksLikePlatform =
    api.ok &&
    api.json &&
    api.json.ok === true &&
    ["databricks-sql", "published-snapshot"].includes(api.json.backend) &&
    typeof api.json.catalog === "string" &&
    typeof api.json.schema === "string";

  return {
    baseUrl: BASE_URL,
    apiUrl: API_URL,
    app: {
      ok: app.ok,
      status: app.status,
      url: app.url,
      looksLikeAlamo: Boolean(appLooksLikeAlamo),
      error: app.error ?? null,
      sample: app.text.slice(0, 600)
    },
    api: {
      ok: api.ok,
      status: api.status,
      url: api.url,
      looksLikePlatform: Boolean(apiLooksLikePlatform),
      error: api.error ?? null,
      sample: api.text.slice(0, 600)
    }
  };
}

async function assertBrowserQaServersHealthy(processes) {
  if (!STRICT_SERVER_GUARD) return;

  const snapshot = await getBrowserQaServerSnapshot();
  const failures = [];
  if (!snapshot.app.looksLikeAlamo) {
    failures.push(`App server at ${snapshot.baseUrl} did not look like the Alamo Platform shell.`);
  }
  if (!snapshot.api.looksLikePlatform) {
    failures.push(`API server at ${snapshot.apiUrl} did not look like the platform health endpoint.`);
  }
  if (!failures.length) return;

  const error = new Error(`Browser QA server guard failed: ${failures.join(" ")}`);
  error.details = {
    snapshot,
    processes: processes.map((entry) => ({
      name: entry.name,
      logs: entry.logs.join("").slice(-3000)
    }))
  };
  throw error;
}

function startProcess(name, command, args, env = {}) {
  const logs = [];
  const child = spawn(command, args, {
    cwd: ROOT,
    detached: process.platform !== "win32",
    env: {
      ...process.env,
      ...env
    },
    stdio: ["ignore", "pipe", "pipe"]
  });
  registerManagedProcessGroup(child);

  const collect = (chunk) => {
    const text = redact(chunk.toString("utf8"));
    logs.push(text);
    if (logs.join("").length > 12_000) logs.shift();
  };

  child.stdout.on("data", collect);
  child.stderr.on("data", collect);

  const signalTree = (signal) => {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
    try {
      if (process.platform === "win32") child.kill(signal);
      else process.kill(-child.pid, signal);
    } catch (error) {
      if (error?.code !== "ESRCH") throw error;
    }
  };

  const waitForExit = (timeoutMs) => {
    if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
    return new Promise((resolve) => {
      const finish = (exited) => {
        clearTimeout(timer);
        child.off("exit", onExit);
        resolve(exited);
      };
      const onExit = () => finish(true);
      const timer = setTimeout(() => finish(false), timeoutMs);
      child.once("exit", onExit);
    });
  };

  child.once("exit", () => {
    if (child.pid) managedProcessGroups.delete(child.pid);
  });

  return {
    name,
    child,
    logs,
    async stop() {
      signalTree("SIGTERM");
      if (await waitForExit(2_000)) return;
      signalTree("SIGKILL");
      await waitForExit(2_000);
    }
  };
}

async function startManagedServers() {
  const processes = [];

  try {
    await chooseCleanRoomBaseUrl();
    await chooseCleanRoomApiUrl();

    const apiReady = await isReachable(API_URL);
    const appReady = await isReachable(`${BASE_URL}/home`);
    const shouldStartApi = CLEAN_ROOM && !REUSE_EXISTING_APP ? true : !apiReady;
    const shouldStartApp = CLEAN_ROOM && !REUSE_EXISTING_APP ? true : !appReady;

    if (shouldStartApi) {
      processes.push(startProcess("dev-api", "node", ["--env-file=.env", "server/dev-api.mjs"], {
        API_PORT: getApiPort(),
        PORT: getApiPort()
      }));
    }

    if (shouldStartApp) {
      processes.push(
        startProcess("vite", "npm", viteArgsForBaseUrl(), {
          VITE_API_PROXY_TARGET: getApiOrigin(),
          VITE_E2E_AUTH_BYPASS: "true"
        })
      );
    }

    const [apiStarted, appStarted] = await Promise.all([
      waitForReachable(API_URL, SERVER_START_TIMEOUT_MS),
      waitForReachable(`${BASE_URL}/home`, SERVER_START_TIMEOUT_MS)
    ]);

    if (!apiStarted || !appStarted) {
      const details = processes.map((entry) => ({
        name: entry.name,
        logs: redact(entry.logs.join("").slice(-3000))
      }));
      const diagnostics = details
        .map(({ name, logs }) => `${name}:\n${logs || "No process output was captured."}`)
        .join("\n\n");
      const error = new Error(
        `Browser QA servers did not become reachable.\n\n${diagnostics}`
      );
      error.details = details;
      throw error;
    }

    await assertBrowserQaServersHealthy(processes);

    return processes;
  } catch (error) {
    await Promise.allSettled(processes.map((entry) => entry.stop()));
    throw error;
  }
}

async function launchBrowser() {
  try {
    return await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL || "chrome",
      headless: HEADLESS
    });
  } catch {
    return chromium.launch({ headless: HEADLESS });
  }
}

export function attachPageDiagnostics(page, { consoleErrors, requestFailures }) {
  page.on("console", (message) => {
    const text = message.text();
    const isGenericMissingAsset404 =
      /Failed to load resource: the server responded with a status of 404/i.test(text);
    if (message.type() === "error" && !isGenericMissingAsset404) {
      consoleErrors.push(redact(text));
    }
  });

  page.on("pageerror", (error) => {
    consoleErrors.push(redact(error.message));
  });

  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.includes("/api/")) return;
    if (request.failure()?.errorText === "net::ERR_ABORTED") return;
    requestFailures.push({
      url,
      failure: request.failure()?.errorText ?? "unknown"
    });
  });
}

export async function clearClientState(page) {
  await page.evaluate(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
  });
}

export async function openChat(page, { resetClientState = true } = {}) {
  await page.goto(`${BASE_URL}/questions`, { waitUntil: "domcontentloaded" });
  if (resetClientState) {
    await clearClientState(page);
    await page.goto(`${BASE_URL}/questions`, { waitUntil: "networkidle" });
  } else {
    await page.waitForLoadState("networkidle");
  }

  const composer = page.getByPlaceholder(/Ask anything/i);
  if (await composer.isVisible().catch(() => false)) return;

  const guide = page.locator('[data-certified-question-guide="true"]').first();
  if (await guide.isVisible().catch(() => false)) return;

  const questionsButton = page
    .getByRole("button", { name: /^(Questions|Open questions|Ask the platform|Ask a question)$/i })
    .first();
  await questionsButton.click({ timeout: 10_000 });

  await page
    .locator('[data-certified-question-guide="true"], textarea[placeholder*="Ask"]')
    .first()
    .waitFor({ state: "visible", timeout: 10_000 });
}

export async function startCleanChat(page) {
  const button = page.getByRole("button", { name: /(?:Start a |New (?:clean )?)chat/i }).first();
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    await page.waitForFunction(
      () => document.querySelectorAll("[data-chat-item-id]").length === 0,
      undefined,
      { timeout: 10_000 }
    );
    await page.waitForFunction(
      () => (
        Boolean(document.querySelector('[data-certified-question-guide="true"]')) ||
        Array.from(document.querySelectorAll("button")).some((candidate) =>
          /^(Ask a question|Questions|Open questions)$/i.test(String(candidate.textContent || "").trim())
        )
      ),
      undefined,
      { timeout: 10_000 }
    );
    await delay(100);
    return;
  }

  await page.goto(`${BASE_URL}/questions`, { waitUntil: "networkidle" });
  await page.locator('[data-certified-question-guide="true"]').first().waitFor({
    state: "visible",
    timeout: 10_000
  });
}

export async function measureCanvas(page) {
  return page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll("[data-chat-snap-anchor-id]"));
    const lastAnchor = anchors.at(-1);
    const anchorRect = lastAnchor?.getBoundingClientRect();
    const textarea = document.querySelector("textarea");
    const textareaRect = textarea?.getBoundingClientRect();
    const questionGuide = document.querySelector('[data-certified-question-guide="true"]');
    const questionGuideRect = questionGuide?.getBoundingClientRect();
    const questionButton = Array.from(document.querySelectorAll("button"))
      .find((button) => /^(Ask a question|Questions|Open questions|Choose another question)$/i.test(String(button.textContent || "").trim()));
    const questionButtonRect = questionButton?.getBoundingClientRect();
    const workspacePanel = document.querySelector('[data-chat-workspace-panel="true"]');
    const workspacePanelRect = workspacePanel?.getBoundingClientRect();
    const modules = Array.from(
      document.querySelectorAll("[data-chat-module-content-id], [data-chat-visual-module-id]")
    );
    const latestModuleRect = modules.at(-1)?.getBoundingClientRect();
    const documentElement = document.documentElement;
    const composerReadyRect = textareaRect ?? questionGuideRect ?? questionButtonRect ?? workspacePanelRect;

    return {
      anchorTop: anchorRect ? Math.round(anchorRect.top) : null,
      anchorVisibleNearTop: anchorRect ? anchorRect.top >= -12 && anchorRect.top <= 190 : false,
      composerVisible: composerReadyRect
        ? composerReadyRect.top < window.innerHeight && composerReadyRect.bottom > 0
        : false,
      latestModuleVisible: latestModuleRect
        ? latestModuleRect.top < window.innerHeight && latestModuleRect.bottom > 0
        : false,
      horizontalOverflow: documentElement.scrollWidth - documentElement.clientWidth
    };
  });
}

export async function waitForThinkingToFinish(page) {
  await page.waitForFunction(
    () => {
      const text = document.body.innerText;
      return !/Thinking through the data|Still working through the data/i.test(text);
    },
    undefined,
    { timeout: TIMEOUT_MS }
  );
}

export async function waitForExpectations(page, expectations, timeoutMs = TIMEOUT_MS) {
  const found = [];
  const missing = [];

  for (const expected of expectations) {
    try {
      await page.getByText(expected, { exact: false }).last().waitFor({ state: "attached", timeout: timeoutMs });
      found.push(String(expected));
    } catch {
      missing.push(String(expected));
    }
  }

  return { found, missing };
}

function compactPrompt(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function guidedSearchText(prompt) {
  const correctedPrompt = understandQuery(prompt).correctedText;
  const matched = matchCertifiedQuestion(correctedPrompt);
  // Search by the concrete question whenever the deterministic matcher knows
  // the family. Family titles are intentionally broad and can expose several
  // surface variants, making an automated or keyboard-driven choice ambiguous.
  if (matched) return correctedPrompt;

  const text = compactPrompt(correctedPrompt);
  if (/resident|client|shannon|tuesday|romero|woo|profile|search census|roster/.test(text)) return "resident";
  if (/communities|community overview|census movement|community trend/.test(text)) return "communities";
  if (/incident center|open incident/.test(text)) return "incident center";
  if (/export|download|csv/.test(text) && /incident|awol|elopement/.test(text)) return "export incident";
  if (/fresh|today|showing|current|loaded/.test(text) && /incident/.test(text)) return "incident freshness";
  if (/awol|elopement/.test(text) && /people|resident|client/.test(text)) return "unique people";
  if (/awol|elopement|incident/.test(text)) return "incident";
  if (/census|clients|residents|population|headcount/.test(text)) return "census";
  return prompt;
}

function selectorTargetForPrompt(prompt) {
  const text = compactPrompt(prompt);
  const monthByName = {
    january: "01",
    jan: "01",
    february: "02",
    feb: "02",
    march: "03",
    mar: "03",
    april: "04",
    apr: "04",
    may: "05",
    june: "06",
    jun: "06",
    july: "07",
    jul: "07",
    august: "08",
    aug: "08",
    september: "09",
    sep: "09",
    sept: "09",
    october: "10",
    oct: "10",
    november: "11",
    nov: "11",
    december: "12",
    dec: "12"
  };
  const monthMatch = text.match(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(20\d{2})\b/);
  const isoMonthMatch = text.match(/\b(20\d{2})[-/](0?[1-9]|1[0-2])\b/);
  const defaultYear = text.match(/\b(20\d{2})\b/)?.[1] ?? "2026";
  const mentionedMonths = Array.from(text.matchAll(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\b(?:\s+(20\d{2}))?/g))
    .map((match) => ({
      month: monthByName[match[1]],
      year: match[2] ?? defaultYear
    }))
    .filter((entry) => entry.month);
  const monthPeriod = monthMatch
    ? `${monthMatch[2]}-${monthByName[monthMatch[1]]}`
    : isoMonthMatch
      ? `${isoMonthMatch[1]}-${String(isoMonthMatch[2]).padStart(2, "0")}`
      : mentionedMonths.length === 1
        ? `${mentionedMonths[0].year}-${mentionedMonths[0].month}`
      : "";
  const monthLabel = monthPeriod
    ? new Date(`${monthPeriod}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : "";
  const startPeriodLabel = mentionedMonths[0]
    ? new Date(`${mentionedMonths[0].year}-${mentionedMonths[0].month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : "";
  const endPeriodLabel = mentionedMonths[1]
    ? new Date(`${mentionedMonths[1].year}-${mentionedMonths[1].month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" })
    : "";

  return {
    text,
    period: monthPeriod,
    periodLabel: monthLabel,
    startPeriodLabel,
    endPeriodLabel,
    community: /san pablo/.test(text)
      ? "san pablo"
      : /santa clarita|clartia/.test(text)
        ? "santa clarita"
        : /jc wallace|wallace/.test(text)
          ? "jc wallace"
          : /turlock/.test(text)
            ? "turlock"
            : /victoria/.test(text)
              ? "victoria"
              : "",
    category: /awol|elopement/.test(text)
      ? "awol elopement"
      : /medication refusal|med refusal|refused medication/.test(text)
        ? "medication refusal"
        : /substance/.test(text)
          ? "substance use"
          : /aggressive/.test(text)
            ? "aggressive behavior"
            : /medical emergency/.test(text)
              ? "medical emergency"
              : "",
    resident: /shannon romero/.test(text)
      ? "shannon romero"
      : /tuesday woo/.test(text)
        ? "tuesday woo"
        : /brian hinz/.test(text)
          ? "brian hinz"
          : "",
    medicationDetail: /medication refusal|medication refusals|refused medication/.test(text)
      ? "medication refusal detail"
      : /not given|not-given|missed medication/.test(text)
        ? "not-given medication detail"
        : /late administration|late medication|over 60|delayed medication/.test(text)
          ? "late medication administrations"
          : /held medication|medication hold|on hold/.test(text)
            ? "held medication detail"
            : /\bprn\b/.test(text)
              ? "prn medication detail"
              : ""
  };
}

async function completeGuidedQuestionIfNeeded(page, prompt, questionControl) {
  const guideTriggers = questionControl.locator('[data-question-variable-trigger="true"]');
  const triggerCount = await guideTriggers.count();
  if (!triggerCount) return;

  const target = selectorTargetForPrompt(prompt);
  const priorFrame = await page.evaluate(() => {
    try {
      const parsed = JSON.parse(window.sessionStorage.getItem("alamo-platform:analysis-session-v1") || "{}");
      return parsed?.frame ?? null;
    } catch {
      return null;
    }
  });
  if (priorFrame && /\b(do it|same|same thing|that|it|just totals|now)\b/i.test(String(prompt ?? ""))) {
    if (!target.community && priorFrame.communityName) target.community = compactPrompt(priorFrame.communityName);
    if (!target.category && priorFrame.category) target.category = compactPrompt(priorFrame.category);
    if (!target.resident && priorFrame.residentName) target.resident = compactPrompt(priorFrame.residentName);
    if (!target.period && Array.isArray(priorFrame.periods) && priorFrame.periods.length === 1) {
      target.period = priorFrame.periods[0];
      target.periodLabel = new Date(`${target.period}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC"
      });
    }
  }
  const normalize = (value) => String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const scoreOption = (labelText, optionText, optionValue) => {
    const label = normalize(labelText);
    const optionTextNormalized = normalize(optionText);
    const optionValueNormalized = normalize(optionValue);
    const option = normalize(`${optionText} ${optionValue}`);
    const rawOption = String(`${optionText} ${optionValue}`);
    if (!option) return 0;
    if (/community|facility/.test(label) && target.community && option.includes(target.community)) return 100;
    if (/resident|client/.test(label) && target.resident && option.includes(target.resident)) return 100;
    if (/category|incident type/.test(label) && target.category && option.includes(target.category)) return 100;
    if (
      /medication|detail|exception/.test(label) &&
      target.medicationDetail &&
      (
        optionTextNormalized.includes(target.medicationDetail) ||
        optionValueNormalized.includes(target.medicationDetail) ||
        target.medicationDetail.includes(optionTextNormalized) ||
        target.medicationDetail.includes(optionValueNormalized)
      )
    ) return 100;
    if (/month|period|date/.test(label) && target.period) {
      if (/start/.test(label) && normalize(target.startPeriodLabel) && option.includes(normalize(target.startPeriodLabel))) return 110;
      if (/end/.test(label) && normalize(target.endPeriodLabel) && option.includes(normalize(target.endPeriodLabel))) return 110;
      if (rawOption.includes(target.period)) return 100;
      if (normalize(target.periodLabel) && option.includes(normalize(target.periodLabel))) return 95;
    }
    if (/start/.test(label) && normalize(target.startPeriodLabel) && option.includes(normalize(target.startPeriodLabel))) return 105;
    if (/end/.test(label) && normalize(target.endPeriodLabel) && option.includes(normalize(target.endPeriodLabel))) return 105;
    if (/month|period|date/.test(label) && /\b(this|current|latest)\s+month\b/.test(target.text)) return 30;
    if (
      target.text &&
      (
        (optionTextNormalized && target.text.includes(optionTextNormalized)) ||
        (optionValueNormalized && target.text.includes(optionValueNormalized))
      )
    ) return 40;
    return 0;
  };

  let selectionCount = 0;
  for (let index = 0; index < triggerCount; index += 1) {
    const trigger = guideTriggers.nth(index);
    const label = await trigger.getAttribute("aria-label") ?? "";
    await trigger.scrollIntoViewIfNeeded();
    await trigger.waitFor({ state: "visible", timeout: 5_000 });
    await trigger.focus();
    await trigger.press("Enter");
    const menu = page.locator('[data-question-variable-menu="true"]');
    await menu.waitFor({ state: "visible", timeout: 5_000 });
    const optionNodes = menu.locator('[data-question-variable-option]');
    const options = await optionNodes.evaluateAll((nodes) => nodes.map((node, optionIndex) => ({
      index: optionIndex,
      value: node.getAttribute("data-question-variable-option") ?? "",
      text: node.textContent ?? ""
    })));
    const latestMonthRequested = /month|period|date/.test(normalize(label)) &&
      /\b(this|current|latest)\s+month\b/.test(target.text);
    const ranked = options
      .map((option) => ({ ...option, score: scoreOption(label, option.text, option.value) }))
      .sort((left, right) => right.score - left.score);
    const selected = latestMonthRequested ? options.at(-1) : ranked[0];
    if (selected && (latestMonthRequested || selected.score > 0 || options.length === 1)) {
      await optionNodes.nth(selected.index).click();
      selectionCount += 1;
    } else {
      await page.keyboard.press("Escape");
    }
  }

  if (selectionCount) await delay(120);

  const runButton = questionControl.locator('[data-certified-question-submit="true"]');
  if (await runButton.isVisible().catch(() => false)) {
    const enabled = await runButton.isEnabled({ timeout: 2_000 }).catch(() => false);
    if (enabled) {
      await runButton.click({ timeout: 10_000 });
    }
  }
}

async function ensureQuestionGuideOpen(page) {
  const guide = page.locator('[data-certified-question-guide="true"]').first();
  if (await guide.isVisible().catch(() => false)) return;

  const questionsButton = page
    .getByRole("button", { name: /^(Ask a question|Questions|Open questions|Choose another question)$/i })
    .first();
  await questionsButton.click({ timeout: 10_000 });
  await guide.waitFor({ state: "visible", timeout: 10_000 });
}

async function selectGuidedQuestion(page, prompt, selection = {}) {
  await ensureQuestionGuideOpen(page);

  const search = page.locator('[data-certified-question-search="true"]').last();
  await search.waitFor({ state: "visible", timeout: 10_000 });
  await search.fill(selection.searchText ?? guidedSearchText(prompt));
  await delay(120);

  const matchedQuestionId = matchCertifiedQuestion(understandQuery(prompt).correctedText)?.id ?? null;
  let buttonSelector = selection.questionItemId
    ? `[data-certified-question-button="true"][data-certified-question-id="${selection.questionItemId}"]`
    : selection.questionId
      ? `[data-certified-question-button="true"][data-certified-question-id^="${selection.questionId}:"]`
      : matchedQuestionId
        ? `[data-certified-question-button="true"][data-certified-question-id^="${matchedQuestionId}:"]`
    : '[data-certified-question-button="true"]';
  let buttons = page.locator(buttonSelector);
  let buttonCount = await buttons.count();
  if (!buttonCount && matchedQuestionId && !selection.questionId && !selection.questionItemId) {
    buttonSelector = '[data-certified-question-button="true"]';
    buttons = page.locator(buttonSelector);
    buttonCount = await buttons.count();
  }
  if (!buttonCount && selection.promptTemplate) {
    await search.fill(selection.promptTemplate);
    await delay(120);
    buttonCount = await buttons.count();
  }
  if (!buttonCount) {
    await search.fill("");
    await delay(120);
  }

  const candidateButtons = page.locator(buttonSelector);
  const selectionTarget = selectorTargetForPrompt(prompt);
  const preferredIndex = await candidateButtons.evaluateAll((buttonNodes, request) => {
    const ignoredTokens = new Set([
      "a", "an", "and", "can", "could", "me", "please", "show", "the", "to", "you",
      "community", "facility", "month", "period", "date", "start", "end", "type", "incident", "category"
    ]);
    function normalize(value) {
      return String(value ?? "")
        .toLowerCase()
        .replace(/\{[^}]+\}/g, " ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }
    function searchable(value) {
      return normalize(value)
        .split(" ")
        .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token)
        .filter((token) => token && !ignoredTokens.has(token))
        .join(" ");
    }
    function tokens(value) {
      return normalize(value)
        .split(" ")
        .filter(Boolean)
        .map((token) => token.length > 3 && token.endsWith("s") ? token.slice(0, -1) : token);
    }
    function stemmed(value) {
      return tokens(value).join(" ");
    }
    const wanted = normalize(request.rawPrompt);
    const wantedStemmed = stemmed(request.rawPrompt);
    const wantedTemplate = normalize(request.promptTemplate);
    const wantedSearchable = searchable(request.rawPrompt);
    if (!wanted) return -1;
    const wantedTokens = new Set(tokens(request.rawPrompt));
    let bestIndex = -1;
    let bestScore = 0;
    buttonNodes.forEach((button, index) => {
      const rawPrompt = button.getAttribute("data-certified-question-prompt") || "";
      const prompt = normalize(button.getAttribute("data-certified-question-prompt"));
      const runPrompt = normalize(button.getAttribute("data-certified-question-run-prompt"));
      const promptStemmed = stemmed(button.getAttribute("data-certified-question-prompt"));
      const runPromptStemmed = stemmed(button.getAttribute("data-certified-question-run-prompt"));
      const promptSearchable = searchable(button.getAttribute("data-certified-question-prompt"));
      const runPromptSearchable = searchable(button.getAttribute("data-certified-question-run-prompt"));
      const candidateTokens = new Set([
        ...tokens(button.getAttribute("data-certified-question-prompt")),
        ...tokens(button.getAttribute("data-certified-question-run-prompt"))
      ]);
      const overlap = Array.from(wantedTokens).filter((token) => candidateTokens.has(token)).length;
      const placeholderCount = (rawPrompt.match(/\{[^}]+\}/g) || []).length;
      let score = overlap * 100 - placeholderCount * 40;
      const placeholderIds = new Set(
        Array.from(rawPrompt.matchAll(/\{([^}]+)\}/g)).map((match) => match[1])
      );
      if (request.target.community && placeholderIds.has("community")) score += 800;
      if (request.target.resident && placeholderIds.has("resident")) score += 800;
      if (
        request.target.category &&
        (placeholderIds.has("incidentCategory") || placeholderIds.has("category"))
      ) score += 600;
      if (request.target.period && placeholderIds.has("month")) score += 600;
      if (
        request.target.startPeriodLabel &&
        request.target.endPeriodLabel &&
        placeholderIds.has("startMonth") &&
        placeholderIds.has("endMonth")
      ) score += 800;
      if (wantedTemplate && prompt === wantedTemplate) score += 20_000;
      if (prompt === wanted || runPrompt === wanted) score += 15_000;
      if (
        promptStemmed.includes(wantedStemmed) ||
        runPromptStemmed.includes(wantedStemmed) ||
        wantedStemmed.includes(promptStemmed) ||
        wantedStemmed.includes(runPromptStemmed)
      ) score += 1_000;
      if (wantedSearchable && (
          promptSearchable.includes(wantedSearchable) ||
          runPromptSearchable.includes(wantedSearchable) ||
          wantedSearchable.includes(promptSearchable) ||
          wantedSearchable.includes(runPromptSearchable)
        )) score += 500;
      if (score > bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    });
    return bestIndex;
  }, {
    rawPrompt: prompt,
    promptTemplate: selection.promptTemplate ?? "",
    target: selectionTarget
  });

  const nextButton = preferredIndex >= 0
    ? candidateButtons.nth(preferredIndex)
    : candidateButtons.first();
  await nextButton.waitFor({ state: "visible", timeout: 10_000 });
  const variableCount = await nextButton.locator('[data-question-variable-trigger="true"]').count();
  if (variableCount) {
    await completeGuidedQuestionIfNeeded(page, prompt, nextButton);
    return;
  }

  await nextButton.locator('[data-certified-question-submit="true"]').click({ timeout: 10_000 });
}

async function maybeCompleteResidentSearch(page, prompt) {
  const residentMatch = String(prompt ?? "").match(/\b(Shannon Romero|Tuesday Woo|Brian Hinz)\b/i);
  if (!residentMatch) return;

  const search = page.getByLabel(/Search residents/i).last();
  if (!(await search.isVisible().catch(() => false))) return;
  await search.fill(residentMatch[1]);
  await delay(150);
  await page.getByRole("button", { name: new RegExp(residentMatch[1], "i") }).first().click({ timeout: 8_000 }).catch(() => {});
}

export async function submitQuestion(page, prompt, selection = {}) {
  const itemCountBefore = await page.locator("[data-chat-item-id]").count();
  const composer = page.getByPlaceholder(/Ask anything/i);
  if (await composer.isVisible().catch(() => false)) {
    await composer.fill(prompt);
    await page.getByRole("button", { name: /Start request/i }).click();
  } else {
    await selectGuidedQuestion(page, prompt, selection);
  }

  await page.waitForFunction(
    (previousCount) => document.querySelectorAll("[data-chat-item-id]").length > previousCount,
    itemCountBefore,
    { timeout: 10_000 }
  );

  return itemCountBefore;
}

export async function ask(page, prompt, turnIndex = 1, selection = {}) {
  await submitQuestion(page, prompt, selection);

  await delay(250);
  const pendingCanvas = await measureCanvas(page);
  await waitForThinkingToFinish(page);
  await maybeCompleteResidentSearch(page, prompt);
  await delay(250);
  const finalCanvas = await measureCanvas(page);

  return {
    turnIndex,
    prompt,
    pendingCanvas,
    finalCanvas
  };
}

export async function withBrowserQa(run) {
  const managedProcesses = MANAGED ? await startManagedServers() : [];
  const browser = await launchBrowser();

  try {
    return await run(browser);
  } finally {
    await browser.close().catch(() => {});
    await Promise.allSettled(managedProcesses.map((entry) => entry.stop()));
  }
}

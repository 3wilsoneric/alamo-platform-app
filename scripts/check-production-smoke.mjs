#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const BASE_URL = String(process.env.PRODUCTION_SMOKE_BASE_URL || "https://www.alamoplatform.com").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.PRODUCTION_SMOKE_TIMEOUT_MS || 15_000);

function buildUrl(pathname) {
  return `${BASE_URL}${pathname.startsWith("/") ? pathname : `/${pathname}`}`;
}

function redact(value) {
  return String(value)
    .replace(/sk-[a-zA-Z0-9_-]{12,}/g, "[redacted-key]")
    .replace(/([A-Z0-9]{20,})/g, (match) => (match.length > 36 ? "[redacted-token]" : match));
}

function isAuthGate(status, location = "") {
  if ([301, 302, 303, 307, 308, 401, 403].includes(status)) return true;
  return /login\.microsoftonline\.com|\/login\b|signin|authorize/i.test(location);
}

async function fetchProbe({ name, pathname, kind }) {
  const url = buildUrl(pathname);
  const startedAt = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        "User-Agent": "AlamoPlatformProductionSmoke/1.0"
      }
    });
    const elapsedMs = Date.now() - startedAt;
    const location = response.headers.get("location") || "";
    const text = redact(await response.text().catch(() => "")).slice(0, 1600);
    const authGate = isAuthGate(response.status, location);
    const serverOk = response.status < 500;
    let shapeOk = false;
    let parsedJson = null;

    if (kind === "app") {
      shapeOk =
        authGate ||
        /<div id="root">|app-boot-shell|Alamo Platform|login|Sign in/i.test(text);
    } else {
      try {
        parsedJson = text ? JSON.parse(text) : null;
      } catch {
        parsedJson = null;
      }
      shapeOk =
        authGate ||
        Boolean(parsedJson && (parsedJson.ok === true || parsedJson.backend === "databricks-sql")) ||
        /login|Sign in/i.test(text);
    }

    const passed = serverOk && response.status !== 404 && shapeOk;

    return {
      name,
      url,
      kind,
      passed,
      status: response.status,
      authGate,
      elapsedMs,
      location: location ? redact(location) : null,
      contentType: response.headers.get("content-type"),
      sample: text.slice(0, 500),
      error: null
    };
  } catch (error) {
    return {
      name,
      url,
      kind,
      passed: false,
      status: null,
      authGate: false,
      elapsedMs: Date.now() - startedAt,
      location: null,
      contentType: null,
      sample: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function fetchAuthBundleProbe() {
  const url = buildUrl("/login");
  const startedAt = Date.now();

  try {
    const pageResponse = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "User-Agent": "AlamoPlatformProductionSmoke/1.0" }
    });
    const page = await pageResponse.text();
    const scriptPaths = [...page.matchAll(/<script[^>]+src=["']([^"']+\.js)["']/gi)]
      .map((match) => match[1])
      .filter(Boolean);
    const scripts = await Promise.all(
      scriptPaths.map(async (scriptPath) => {
        const scriptUrl = new URL(scriptPath, url);
        const response = await fetch(scriptUrl, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
          headers: { "User-Agent": "AlamoPlatformProductionSmoke/1.0" }
        });
        return response.ok ? response.text() : "";
      })
    );
    const source = scripts.join("\n");
    const staleApexCallback = source.includes("https://alamoplatform.com/login");
    const callbackRecoveryPresent = source.includes("alamo-platform-auth-redirect-error");
    const passed =
      pageResponse.ok &&
      scriptPaths.length > 0 &&
      !staleApexCallback &&
      callbackRecoveryPresent;

    return {
      name: "Microsoft callback contract",
      url,
      kind: "auth-config",
      passed,
      status: pageResponse.status,
      authGate: false,
      elapsedMs: Date.now() - startedAt,
      location: null,
      contentType: pageResponse.headers.get("content-type"),
      sample: staleApexCallback
        ? "Production bundle still points Microsoft at the non-canonical apex login URL."
        : !callbackRecoveryPresent
          ? "Production bundle does not preserve Microsoft callback failures for the login screen."
          : `Checked ${scriptPaths.length} production script bundle${scriptPaths.length === 1 ? "" : "s"}.`,
      error: null
    };
  } catch (error) {
    return {
      name: "Microsoft callback contract",
      url,
      kind: "auth-config",
      passed: false,
      status: null,
      authGate: false,
      elapsedMs: Date.now() - startedAt,
      location: null,
      contentType: null,
      sample: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const artifactDir = path.join(ROOT, "generated", "production-smoke");
  await mkdir(artifactDir, { recursive: true });

  const probes = await Promise.all([
    fetchProbe({ name: "App root", pathname: "/", kind: "app" }),
    fetchProbe({ name: "Workspace route", pathname: "/home", kind: "app" }),
    fetchProbe({ name: "Health API", pathname: "/api/platform/health", kind: "api" }),
    fetchAuthBundleProbe()
  ]);
  const passed = probes.every((probe) => probe.passed);
  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: BASE_URL,
    passed,
    summary: {
      probes: probes.length,
      passedProbes: probes.filter((probe) => probe.passed).length,
      authGatedProbes: probes.filter((probe) => probe.authGate).length,
      maxElapsedMs: Math.max(...probes.map((probe) => probe.elapsedMs))
    },
    probes
  };

  await writeFile(path.join(artifactDir, "latest.json"), JSON.stringify(report, null, 2));

  if (!passed) {
    console.error(JSON.stringify(report, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(
    `production smoke passed: ${report.summary.passedProbes}/${report.summary.probes} probes for ${BASE_URL}`
  );
}

await main();

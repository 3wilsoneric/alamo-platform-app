// Run the canonical navigation assertions through the supported CUA page adapter.
// Chrome retains its credentials; this module never reads or exports its session.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createProductionNavigationChecks, sanitizeBrowserDiagnostic } from './production-navigation-checks.mjs';

export const NETWORK_SUCCESS_FILTER = '-status-code:200 -status-code:204 -status-code:304 -status-code:301 -status-code:302';
const hash = value => createHash('sha256').update(value).digest('hex');
const entryPattern = /^\/assets\/index-[\w-]+\.js$/;
async function sourceFingerprint() {
  return hash(Buffer.concat(await Promise.all([import.meta.url, new URL('./production-navigation-checks.mjs', import.meta.url)].map(url => readFile(new URL(url))))));
}

// Fail closed when Chrome's AX format changes, filters are incomplete, rows are
// virtualized, or a request has an unknown status. Revisit this parser only with
// a fresh observed capture and regressions for that browser format.
export function inspectNativeNetwork(ax, allowEmpty = false) {
  const panel = ax.match(/container Network panel([\s\S]*?)text Network data available/)?.[1];
  assert(panel, 'Missing native Network capture.');
  assert.match(panel, /toggle button Stop recording network log[^\n]*Value: 1/);
  assert.match(panel, /checkbox Keep log, Value: 1/);
  assert.match(panel, /checkbox Invert, Value: 0/);
  const filter = panel.match(/text entry area[^\n]* Filter, Value: ([^\n]+)/)?.[1];
  assert.equal(filter, NETWORK_SUCCESS_FILTER, 'The Network filter must exclude only successful statuses.');
  assert.match(panel, /text \(selected\) All Fetch\/XHR Doc CSS JS Font Img Media Manifest Socket Wasm Other/);
  for (const option of ['Hide data URLs', 'Hide extension URLs', 'Blocked response cookies', 'Blocked requests', '3rd-party requests']) {
    assert(ax.split('\n').some(line => line.includes(` ${option}, unchecked, Help:`)), `Network option is not verified: ${option}`);
  }
  const counts = panel.match(/container (\d+) \/ (\d+) requests/);
  if (!counts) {
    assert(allowEmpty && /Currently recording network activity/.test(panel), 'Missing request counts.');
    return { total: 0, visible: 0, canceled: 0 };
  }
  const visible = Number(counts[1]), total = Number(counts[2]);
  assert(total >= visible && (allowEmpty || total > 0), 'Incomplete request capture.');
  assert(!/request status can.t be shown|unloaded while|\(pending\)/i.test(panel), 'Network status is unverified.');
  const rows = panel.split(/\n\t*\d+ row\n/).slice(1).filter(row => /\bcell https?:\/\//.test(row));
  assert.equal(rows.length, visible, 'Not every visible request has an observed status.');
  let canceled = 0;
  for (const row of rows) {
    const cells = ('\n' + row).split(/\n\t*\d+ cell(?: |\n)/).slice(1);
    assert(cells.length >= 2, 'Missing request status cell.');
    const status = cells[1].trim();
    if (/^(?:\d+ text )?\(canceled\)$/.test(status)) canceled++;
    else assert(/^(?:\d+ text )?[123]\d\d$/.test(status), 'HTTP failure or unverified request status.');
  }
  return { total, visible, canceled };
}

async function liveEntry(baseUrl) {
  const response = await fetch(baseUrl + '/', { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  assert.equal(response.status, 200);
  const html = await response.text();
  const entry = html.match(/<script\b[^>]*type="module"[^>]*src="(\/assets\/index-[\w-]+\.js)"/)?.[1];
  assert(entry && entryPattern.test(entry), 'Current production entry is missing.');
  const asset = await fetch(baseUrl + entry, { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  assert.equal(asset.status, 200);
  return { path: entry, sha256: hash(Buffer.from(await asset.arrayBuffer())) };
}

export function validateMainChromeEvidence(evidence, { baseUrl, fingerprint, entry, now = Date.now() }) {
  assert.equal(evidence.version, 1);
  assert.equal(evidence.mode, 'main-chrome');
  assert.equal(evidence.baseUrl, baseUrl);
  assert.equal(evidence.assertionFingerprint, fingerprint, 'Browser assertions changed after capture.');
  assert.deepEqual(evidence.entry, entry, 'Production changed after capture.');
  const start = Date.parse(evidence.startedAt), end = Date.parse(evidence.completedAt);
  assert(Number.isFinite(start) && Number.isFinite(end) && start <= end && end <= now && now - start < 3_600_000, 'Need a fresh, complete browser capture.');
  assert.equal(evidence.startedNetwork.total, 0, 'Clear the Network log before running the checks.');
  assert.deepEqual(evidence.budgets, { homeReadyMs: 5000, routeReadyMs: 8000, dataReadyMs: 12000, timeoutMs: 30000 });
  assert.deepEqual(createProductionNavigationChecks({ baseUrl }).validateCapturedResults(evidence.routeResults, evidence.interactionResults), []);
  assert(Array.isArray(evidence.consoleErrors) && evidence.consoleErrors.length === 0, 'Browser console errors must be resolved.');
  assert.equal(evidence.consoleCaptureComplete, true);
  const network = inspectNativeNetwork(evidence.networkAX);
  assert(network.total >= evidence.routeResults.length, 'Incomplete navigation network capture.');
  return network;
}

// Call inside cua_repl with the documented browser adapter and native Network
// observation. The initial and final observations must use the same empty log,
// Keep log on, All request types, the exact filter above, and the expanded
// More filters menu showing every option unchecked. No HAR/body export.
export async function captureMainChromeProductionCheck({ page, readConsole, readNetwork, baseUrl, directory }) {
  assert.equal(new URL(baseUrl).origin, baseUrl);
  const fingerprint = await sourceFingerprint(), entry = await liveEntry(baseUrl);
  const startedAt = new Date().toISOString();
  const initialAX = await readNetwork();
  const startedNetwork = inspectNativeNetwork(initialAX, true);
  assert.equal(startedNetwork.total, 0);
  const observedEntry = await page.evaluate(() => [...document.querySelectorAll('script[type="module"][src]')].map(script => new URL(script.src).pathname));
  assert(observedEntry.includes(entry.path), 'The browser is not on the current production build.');
  await mkdir(path.join(directory, 'screenshots'), { recursive: true });
  const checks = createProductionNavigationChecks({ baseUrl });
  const routeResults = await checks.checkProductionRoutes(page, directory);
  const interactionResults = await checks.checkProductionInteractions(page);
  const networkAX = await readNetwork();
  const logs = await readConsole();
  assert(logs.length < 1000, 'Console capture may be truncated.');
  assert(logs.every(log => Number.isFinite(Date.parse(log.timestamp))), 'Unverified console timing.');
  const consoleErrors = logs.filter(log => Date.parse(log.timestamp) >= Date.parse(startedAt))
    .map(log => ({ timestamp: log.timestamp, message: sanitizeBrowserDiagnostic(log.message).slice(0, 600) }));
  assert.equal(await sourceFingerprint(), fingerprint, 'Assertions changed during capture.');
  assert.deepEqual(await liveEntry(baseUrl), entry, 'Production changed during capture.');
  const evidence = { version: 1, mode: 'main-chrome', baseUrl, assertionFingerprint: fingerprint, entry, startedAt,
    completedAt: new Date().toISOString(), startedNetwork, networkAX,
    budgets: { homeReadyMs: 5000, routeReadyMs: 8000, dataReadyMs: 12000, timeoutMs: 30000 },
    routeResults, interactionResults, consoleErrors, consoleCaptureComplete: true };
  // Retain failures too. The verifier derives pass/fail from observations.
  await writeFile(path.join(directory, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n', { mode: 0o600 });
  const network = validateMainChromeEvidence(evidence, { baseUrl, fingerprint, entry });
  return { routes: routeResults.length, interactions: interactionResults.length, network, consoleErrors: consoleErrors.length };
}

export async function readMainChromeProductionCheck(file, baseUrl) {
  const evidence = JSON.parse(await readFile(file, 'utf8'));
  const network = validateMainChromeEvidence(evidence, { baseUrl, fingerprint: await sourceFingerprint(), entry: await liveEntry(baseUrl) });
  return { generatedAt: new Date().toISOString(), baseUrl, mode: 'main-chrome', status: 'pass', passed: true,
    routeResults: evidence.routeResults, interactionResults: evidence.interactionResults, budgets: evidence.budgets,
    consoleErrors: [], requestFailures: [], httpFailures: [], network,
    evidencePath: path.resolve(file), evidenceSha256: hash(JSON.stringify(evidence)), entry: evidence.entry };
}

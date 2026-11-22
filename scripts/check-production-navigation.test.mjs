import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createProductionNavigationChecks, sanitizeBrowserDiagnostic } from './lib/production-navigation-checks.mjs';
import { inspectNativeNetwork, NETWORK_SUCCESS_FILTER, validateMainChromeEvidence } from './lib/production-main-chrome.mjs';

// Fault-injection checks for the release assertions. This fake page does not
// authenticate, inspect production data or constitute browser acceptance.
function pageFixture(change = state => state, delayed = false) {
  let currentUrl = 'https://example.test/home';
  const locator = { first() { return this; }, async waitFor() {} };
  return {
    async goto(url) {
      currentUrl = /\/(?:analytics\/)?questions$/.test(url) ? 'https://example.test/analytics' : url;
      const parsed = new URL(currentUrl);
      if (parsed.pathname === '/analytics/admissions') parsed.pathname = '/admissions';
      else if (['/analytics/residents', '/analytics/community'].includes(parsed.pathname)) {
        const report = parsed.pathname.split('/').at(-1);
        parsed.pathname = '/analytics'; parsed.searchParams.set('report', report);
      }
      currentUrl = parsed.href;
      if (delayed) await delay(4);
    },
    locator() { return locator; },
    getByText(text) {
      assert.match(text.source, /^Loading incidents$/i,
        'completed readiness markers must not wait on potentially hidden broad page text');
      return locator;
    },
    async evaluate() {
      return change({ url: currentUrl, matchedExpected: true, readySelectorVisible: true,
        hasAuthenticatedShell: true, communityMarkerCount: 5, loadedRecordCount: 1,
        explorerStatus: 'ready', horizontalOverflow: 0, reportBusy: false,
        incidentLoading: false, errorVisible: false, isMicrosoftLogin: false,
        loadingGovernedRecords: false, commandCenterLoading: false,
        snapshotUnavailable: false, questionGuideVisible: false });
    },
    async screenshot() {}
  };
}
const checks = createProductionNavigationChecks({ baseUrl: 'https://example.test' });

test('current routes and both legacy redirects pass only with completed authenticated content', async () => {
  const results = await checks.checkProductionRoutes(pageFixture(), '/unused');
  assert.equal(results.length, 15);
  assert.ok(results.every(result => result.passed), JSON.stringify(results.filter(result => !result.passed)));
  assert.deepEqual(results.slice(-2).map(result => result.pageState.url), Array(2).fill('https://example.test/analytics'));
});

for (const [label, patch, expectedFailures] of [
  ['missing identity', { hasAuthenticatedShell: false }, 15],
  ['wrong route', { url: 'https://example.test/wrong' }, 15],
  ['missing readiness marker', { readySelectorVisible: false }, 15],
  ['rendered error', { errorVisible: true }, 15],
  ['horizontal overflow', { horizontalOverflow: 9 }, 15],
  ['incomplete community map', { communityMarkerCount: 4 }, 2],
  ['empty governed explorers', { loadedRecordCount: 0 }, 2],
  ['unfinished governed explorers', { explorerStatus: 'loading' }, 2],
  ['unavailable snapshot', { snapshotUnavailable: true }, 1],
  ['report still compiling', { reportBusy: true }, 6],
  ['retired question guide', { questionGuideVisible: true }, 2]
]) {
  test(`release assertion rejects ${label}`, async () => {
    const results = await checks.checkProductionRoutes(pageFixture(state => ({ ...state, ...patch })), '/unused');
    assert.equal(results.filter(result => !result.passed).length, expectedFailures);
  });
}

test('home useful-ready budget remains an enforced failure', async () => {
  const timed = createProductionNavigationChecks({ baseUrl: 'https://example.test', homeReadyMs: 1 });
  const results = await timed.checkProductionRoutes(pageFixture(undefined, true), '/unused');
  assert.ok(results[0].failures.some(reason => reason.includes('useful-ready exceeded')));
  assert.ok(results[1].failures.some(reason => reason.includes('useful-ready exceeded')));
});

test('Microsoft callback diagnostics redact credentials', () => {
  const text = sanitizeBrowserDiagnostic('https://example.test/login?code=secret&state=private&access_token=credential');
  assert.ok(!/secret|private|credential/.test(text));
});


test('Clients cannot silently resolve to Overview by losing its query', async () => {
  const results = await checks.checkProductionRoutes(pageFixture(state => ({ ...state,
    url: state.url.includes('report=residents') ? 'https://example.test/analytics' : state.url
  })), '/unused');
  assert.deepEqual(results.filter(result => !result.passed).map(result => result.name), ['Clients', 'Legacy Clients']);
});

// Synthetic AX fixture, matching Chrome's observed native row/control format.
// Keep separate from real captures, which remain private generated artifacts.
function networkFixture(status = '(canceled)', { total = 600, visible = 1 } = {}) {
  return `70 container Network panel
\t74 toggle button Stop recording network log - ⌘ E, Value: 1
\t82 checkbox Keep log, Value: 1
\t99 text entry area (settable) Filter, Value: ${NETWORK_SUCCESS_FILTER}
\t104 checkbox Invert, Value: 0
\t112 text (selected) All Fetch/XHR Doc CSS JS Font Img Media Manifest Socket Wasm Other
\t143 row
\t\t144 column header Name
${visible ? `\t156 row
\t\t157 cell https://example.test/api/report
\t\t\t158 text report
\t\t160 cell
\t\t\t161 text ${status}
\t\t162 cell
\t\t\t163 text fetch
\t\t164 cell
\t\t\t165 button
` : ''}\t170 container ${visible} / ${total} requests
\t171 text ${visible} / ${total} requests
180 text Network data available
${['Hide data URLs','Hide extension URLs','Blocked response cookies','Blocked requests','3rd-party requests'].map((name,index) => `${266 + index * 2} ${name}, unchecked, Help: Filter requests`).join('\n')}`;
}

test('native capture parses the actual status cell, never the accessibility node ID', () => {
  assert.deepEqual(inspectNativeNetwork(networkFixture()), { total: 600, visible: 1, canceled: 1 });
  assert.equal(inspectNativeNetwork(networkFixture('200')).canceled, 0);
  for (const status of ['401', '404', '500', '(failed)', 'net::ERR_CONNECTION_RESET', 'fetch', 'request status can’t be shown', '(pending)']) {
    assert.throws(() => inspectNativeNetwork(networkFixture(status)), undefined, status);
  }
});

test('native capture fails closed on incomplete observations and restrictive filters', () => {
  for (const [before, after] of [
    ['Keep log, Value: 1', 'Keep log, Value: 0'],
    ['log - ⌘ E, Value: 1', 'log - ⌘ E, Value: 0'],
    ['Invert, Value: 0', 'Invert, Value: 1'],
    [NETWORK_SUCCESS_FILTER, NETWORK_SUCCESS_FILTER + ' -status-code:500'],
    ['text (selected) All ', 'text All '],
    ['Blocked requests, unchecked', 'Blocked requests, checked'],
    ['3rd-party requests, unchecked', '3rd-party requests, checked'],
    ['container 1 / 600 requests', 'container 2 / 600 requests'],
    ['161 text (canceled)', '161 text'],
    ['160 cell', '160 container']
  ]) assert.throws(() => inspectNativeNetwork(networkFixture().replace(before, after)), undefined, before);
  assert.throws(() => inspectNativeNetwork(networkFixture('', { total: 0, visible: 0 })));
  assert.equal(inspectNativeNetwork(networkFixture('', { total: 0, visible: 0 }), true).total, 0);
  assert.equal(inspectNativeNetwork(networkFixture('', { total: 600, visible: 0 })).visible, 0);
});

async function captureFixture() {
  const routes = await checks.checkProductionRoutes(pageFixture(), '/unused');
  const names = [...['337','342','343','344','345'].map(id => `Community ${id} marker and report`),
    ...['Analytics','Admissions','Clients','Incidents','Licensing','Home'].map(name => `${name} navigation`),
    'Command Center Workspace navigation'];
  return { version: 1, mode: 'main-chrome', baseUrl: 'https://example.test', assertionFingerprint: 'test-source',
    entry: { path: '/assets/index-test.js', sha256: 'test-hash' },
    startedAt: '2026-11-22T22:00:00Z', completedAt: '2026-11-22T22:02:00Z',
    initialNetworkAX: networkFixture('', { total: 0, visible: 0 }),
    startedNetwork: { total: 0, visible: 0, canceled: 0 }, networkAX: networkFixture(),
    budgets: { homeReadyMs: 5000, routeReadyMs: 8000, dataReadyMs: 12000, timeoutMs: 30000 },
    routeResults: routes, interactionResults: names.map(name => ({ name, passed: true, failures: [] })),
    consoleErrors: [], consoleCaptureComplete: true };
}

test('captured evidence rechecks route observations, coverage, build, source and freshness', async () => {
  const good = await captureFixture();
  const options = { baseUrl: good.baseUrl, fingerprint: good.assertionFingerprint, entry: good.entry, now: Date.parse('2026-11-22T22:03:00Z') };
  assert.equal(validateMainChromeEvidence(good, options).total, 600);
  const withBackgroundPoll = structuredClone(good);
  withBackgroundPoll.initialNetworkAX = networkFixture('200', {total:1,visible:1});
  withBackgroundPoll.startedNetwork = {total:1,visible:1,canceled:0};
  assert.equal(validateMainChromeEvidence(withBackgroundPoll, options).total, 600);
  for (const mutate of [
    e => e.routeResults.pop(), e => e.interactionResults.pop(),
    e => e.routeResults[0].pageState.hasAuthenticatedShell = false,
    e => e.routeResults[0].elapsedMs = 5001,
    e => e.routeResults[0].pageState.url = 'https://wrong.test/',
    e => e.routeResults[4].pageState.url = 'https://example.test/analytics',
    e => e.routeResults[0].pageState.horizontalOverflow = 9,
    e => delete e.routeResults[0].pageState.errorVisible,
    e => e.interactionResults[0].failures = ['click failed'],
    e => e.assertionFingerprint = 'old-source', e => e.entry.sha256 = 'old-build',
    e => e.startedAt = '2026-11-22T20:00:00Z', e => e.completedAt = '2026-11-22T23:00:00Z',
    e => e.startedNetwork.total = 10, e => e.budgets.homeReadyMs = 999999,
    e => { e.initialNetworkAX = networkFixture('500'); e.startedNetwork = {total:600,visible:1,canceled:0}; },
    e => { e.initialNetworkAX = networkFixture('200'); e.startedNetwork = {total:600,visible:1,canceled:0}; },
    e => e.consoleErrors.push({ message: 'failure' }), e => e.consoleCaptureComplete = false,
    e => e.networkAX = networkFixture('500')
  ]) {
    const invalid = structuredClone(good); mutate(invalid);
    assert.throws(() => validateMainChromeEvidence(invalid, options));
  }
});

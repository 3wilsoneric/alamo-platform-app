import assert from 'node:assert/strict';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { createProductionNavigationChecks, sanitizeBrowserDiagnostic } from './lib/production-navigation-checks.mjs';

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

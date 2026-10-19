import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdir } from 'node:fs/promises';
import { BASE_URL, withBrowserQa } from "./browser-qa-utils.mjs";
import { createWorkflowApiHandler } from '../server/workflow-api.mjs';
import { WorkflowError } from '../server/workflow/model.mjs';

const artifacts = new URL('../generated/workflow-publication-browser/', import.meta.url);
await mkdir(artifacts, { recursive: true });
let value = null, version = null;
const handler = createWorkflowApiHandler({ env: { WORKFLOW_CONTENT_ENABLED: 'true' },
  authenticate: async () => ({ authenticated: true, mode: 'entra-delegated', claims: { tid: '10000000-0000-4000-8000-000000000001', oid: 'f73371d5-d2b4-48b4-a32b-1edc7c88869f', scp: 'access_as_user', name: 'Synthetic browser reviewer' } }),
  persistence: { kind: 'isolated-test', async read() { return { value: structuredClone(value), version }; }, async write(_scope, next, previous) {
    if (version !== previous) throw new WorkflowError(409, 'revision_conflict', 'Fixture conflict.'); value = structuredClone(next); version = String(Number(version ?? 0) + 1);
  } } });
const api = http.createServer((req, res) => {
  if (!req.url?.startsWith('/api/platform/workflow/v1/')) { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ok: true, backend: 'published-snapshot', catalog: 'synthetic-fixture', schema: 'workflow-browser-test' })); return; }
  const adapter = { setHeader: (name, value) => res.setHeader(name, value), getHeader: name => res.getHeader(name), status(code) { res.statusCode = code; return this; }, json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); } };
  void handler(req, adapter);
});
await withBrowserQa(async browser => {
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(20000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${BASE_URL}/workflow?view=drafts`);
  await page.getByRole('button', { name: '+ New draft', exact: true }).click();
  await page.getByLabel('Title', { exact: true }).fill('Synthetic shared publication');
  await page.getByLabel('Audience', { exact: true }).fill('Practice team');
  await page.getByLabel('Purpose', { exact: true }).fill('Verify the reviewed publication flow.');
  await page.getByLabel('Source reference', { exact: false }).fill('Synthetic test fixture.');
  const quote = 'The assessor uses this fictional handoff guide.';
  await page.getByLabel('Instructions', { exact: true }).fill(quote + ' This is synthetic test content.');
  await page.getByRole('button', { name: 'Save draft', exact: true }).click();
  await page.getByText('Saved · Revision 1', { exact: true }).waitFor();
  await page.getByRole('button', { name: '+ Connect knowledge', exact: true }).click();
  await page.getByLabel('Connected entity', { exact: true }).selectOption('role:assessor');
  await page.getByLabel('Exact evidence excerpt', { exact: true }).fill(quote);
  await page.getByLabel('Why are these connected?', { exact: true }).fill('The source explicitly names the assessor role.');
  await page.getByRole('button', { name: 'Save proposed connection', exact: true }).click();
  await page.getByText('Proposed · Unapproved', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Submit for review', exact: true }).click();
  await page.getByText('Saved · Revision 2', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review connection', exact: true }).click();
  await page.getByLabel('Connection decision', { exact: true }).fill('Checked the exact quote and target role source.');
  await page.getByRole('button', { name: 'Approve connection', exact: true }).click();
  await page.getByText('Connection approved', { exact: true }).waitFor();
  await page.getByLabel('Review decision', { exact: true }).fill('Reviewed the complete synthetic guide.');
  await page.getByRole('button', { name: 'Approve document', exact: true }).click();
  await page.getByText('Saved · Revision 3', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Load approved connections', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Assessor', exact: true }).check();
  await page.getByRole('button', { name: 'Publish approved version', exact: true }).click();
  await page.getByText('Saved · Revision 4', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Read published version', exact: true }).click();
  await page.getByRole('article', { name: 'Published version', exact: true }).waitFor();
  assert.match(await page.getByRole('article', { name: 'Published version', exact: true }).innerText(), /Published content revision 1/);
  assert.match(await page.getByRole('article', { name: 'Published version', exact: true }).innerText(), /Target status: draft-reference/);
  await page.getByRole('region', { name: 'Review and publication', exact: true }).screenshot({ path: new URL('desktop-publication.png', artifacts).pathname });
  await page.reload();
  await page.locator('.drafts-list-item').filter({ hasText: 'Synthetic shared publication' }).click();
  await page.getByText('Saved · Revision 4', { exact: true }).waitFor();
  assert(await page.getByLabel('Instructions', { exact: true }).isDisabled());
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForFunction(() => document.querySelector('.workflow-sidebar')?.getBoundingClientRect().width === 72);
  await page.getByRole('button', { name: 'Read published version', exact: true }).click();
  await page.getByRole('article', { name: 'Published version', exact: true }).waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: new URL('mobile-workspace.png', artifacts).pathname, fullPage: true });
  await page.getByRole('region', { name: 'Review and publication', exact: true }).screenshot({ path: new URL('mobile-publication.png', artifacts).pathname });
  await page.getByLabel('Review decision', { exact: true }).fill('Withdraw this synthetic publication after verification.');
  await page.getByRole('button', { name: 'Retract publication', exact: true }).click();
  await page.getByText('Saved · Revision 5', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Read published version', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'This publication was retracted.' }).waitFor();
  assert.deepEqual(errors, []);
  console.log('Workflow browser publication passed: create, quote, submit, separate connection/document review, publish, reload, cited retrieval, mobile layout, and retract.');
} catch (error) {
  for (const page of browser?.contexts().flatMap(context => context.pages()) ?? []) await page.screenshot({ path: new URL('failure.png', artifacts).pathname, fullPage: true }).catch(() => {});
  throw error;
}
}, { startApi: async ({ host, port }) => {
  await new Promise((resolve, reject) => { api.once('error', reject); api.listen(port, host, resolve); });
  return { name: 'synthetic-workflow-api', logs: [], async stop() { api.closeAllConnections(); await new Promise(resolve => api.close(resolve)); } };
} });

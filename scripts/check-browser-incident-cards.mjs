import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';
import { hasPlatformOwnerAccess } from '../shared/platform-owner-access.mjs';
import { BASE_URL, prepareArtifactDirs, withBrowserQa } from "./browser-qa-utils.mjs";
const { screenshotDir } = await prepareArtifactDirs('incident-cards');
const rows = ALAMO_FACILITIES.flatMap((facility, community) => Array.from({ length: 8 }, (_, index) => ({
  id: `${facility.facilityId}-${index}`, facility_id: facility.facilityId, facility_name: facility.shortName,
  client_name: index === 0 ? `Alexandria Montgomery-de la Cruz ${facility.shortName}` : `Example Resident ${community}-${index}`,
  resident_id: `synthetic-${community}-${index}`, incident_type: 'Medical Emergency',
  priority: index < 5 ? 'HIGH' : index === 5 ? 'MEDIUM' : 'LOW', stage: index === 6 ? 'reviewed' : 'new',
  received_at: index === 7 ? '2026-11-17T17:00:00Z' : '2026-11-18T17:00:00Z',
  incident_date: '2026-11-18', flags: ['911', 'PHYSICIAN', 'FAMILY'],
  email_body: 'Synthetic incident note.\nThe second paragraph remains readable at phone widths.',
  primary_diagnosis: 'A long synthetic value to exercise wrapping without clipping', staff_name: 'Example Staff'
})));
await withBrowserQa(async (browser) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  let fail = false;
  await page.route('**/api/incidents', route => route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(fail ? { error: 'Test refresh failure' } : { source: 'synthetic-test', incidents: rows }) }));
  await page.goto(`${BASE_URL}/incidents`, { waitUntil: 'domcontentloaded' });
  const center = page.locator('[data-incident-center]');
  await center.locator('[data-incident-card]').first().waitFor();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 400 ? 844 : 900 });
    await center.getByRole('combobox', { name: 'Community' }).selectOption('337');
    await page.waitForFunction(() => document.querySelector('[data-incident-center-facility="337"]'));
    assert.match(await center.innerText(), /San Pablo/);
    assert.doesNotMatch(await center.locator('[data-incident-card]').allTextContents().then(t=>t.join(' ')), /Victoria|Turlock|Santa Clarita|JC Wallace/);
    if (width < 640) {
      assert.equal(await center.getByRole('tab').count(), 3);
      const high = center.getByRole('tab', { name: 'High 5', exact: true });
      await high.click(); await high.press('ArrowRight');
      assert.equal(await center.getByRole('tab', { name: 'Medium 1', exact: true }).getAttribute('aria-selected'), 'true');
      await center.getByRole('tab', { name: 'Medium 1', exact: true }).press('Home');
      await center.getByRole('button', { name: 'Show all 5', exact: true }).click();
      assert.equal(await center.locator('[data-incident-card]').count(), 5);
      await center.getByRole('button', { name: 'Show fewer', exact: true }).click();
    }
    const details = center.locator('[data-incident-details-toggle]').first();
    await details.click();
    assert.match(await center.locator('.incident-detail').innerText(), /second paragraph/);
    const layout = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth-innerWidth,
      controls: [...document.querySelectorAll('[data-incident-center] button,[data-incident-center] select,[data-incident-center] a')]
        .filter(el => el.getBoundingClientRect().width>0).filter(el=>el.getBoundingClientRect().height<43).map(el=>el.textContent) }));
    assert.ok(layout.overflow <= 2, `${width}: horizontal overflow`);
    assert.deepEqual(layout.controls, [], `${width}: undersized controls`);
    await center.getByRole('button', { name: 'Close incident details' }).click();
    assert.equal(await details.evaluate(el=>el===document.activeElement), true);
    await center.locator('[data-incident-resident-link]').first().click();
    const dialog = page.getByRole('dialog'); await dialog.waitFor();
    assert.ok(await dialog.evaluate(el=>el.contains(document.activeElement)));
    await page.keyboard.press('Escape'); await dialog.waitFor({ state: 'hidden' });
    await page.screenshot({ path: `${screenshotDir}/${width}.png`, fullPage: false });
  }
  await center.locator('[data-incident-date-window="previous"]').click();
  assert.match(await center.innerText(), /Example Resident 0-7/);
  await center.getByRole('combobox', { name: 'Community' }).selectOption('344');
  assert.equal(await center.locator('[data-incident-date-window="latest"]').getAttribute('aria-pressed'), 'true');
  assert.match(await center.innerText(), /Alexandria Montgomery-de la Cruz Turlock/);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await center.locator('[data-incident-card]').first().waitFor();
  assert.equal(await center.getByRole('combobox').inputValue(), '344');
  fail = true;
  await center.getByRole('button', { name: 'Refresh incidents' }).click();
  // Transient reads retain the shared warm cache and announce the shell's stale-data state.
  await page.locator('[data-platform-connection-status="stale"]').waitFor();
  assert.ok(await center.locator('[data-incident-card]').count()>0);
  const emptyPage = await context.newPage();
  await emptyPage.route('**/api/incidents', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ source: 'synthetic-test', incidents: [] }) }));
  await emptyPage.goto(`${BASE_URL}/incidents?community=345`, { waitUntil: 'domcontentloaded' });
  await emptyPage.getByText('No incident dates are loaded in this view.', { exact: true }).waitFor();
  assert.equal(await emptyPage.locator('[data-incident-card]').count(), 0);
  assert.equal(await emptyPage.locator('[data-incident-date-window="previous"]').isEnabled(), false);
  assert.equal(await emptyPage.getByRole('combobox', { name: 'Community' }).inputValue(), '345');
  await emptyPage.close();
  // The public launcher is navigation only. The canonical claims check controls
  // its owner marker; display-name spoofing must never expose either entry.
  const launcher = await readFile('public/point-of-care-launcher.js','utf8');
  for (const [claims, allowed] of [[{ oid: 'f73371d5-d2b4-48b4-a32b-1edc7c88869f' },true], [{ preferred_username: 'ericwilsonalamo@outlook.com' },true], [{ name: 'Eric Wilson', oid: 'not-owner' },false], [{ name: 'Andrew Dominici', preferred_username: 'andrew@example.test' },false], [null,false]]) {
    assert.equal(hasPlatformOwnerAccess(claims), allowed);
    await page.setContent(`<header data-platform-header data-platform-owner="${allowed}"><nav data-platform-page-navigation><div data-platform-primary-links><span data-platform-user-identity aria-label="Signed in as Eric Wilson"></span></div></nav><nav data-platform-mobile-menu><div></div></nav></header><div data-california-community-profile="337"><div data-community-modal-navigation></div></div>`);
    await page.addScriptTag({ content: launcher });
    assert.equal(await page.locator('.platform-poc-launcher').count(), allowed ? 1 : 0);
    assert.equal(await page.locator('[data-platform-fleet-link]').count(), allowed ? 3 : 0);
    if (allowed) {
      await page.locator('[data-platform-header]').evaluate(el=>el.setAttribute('data-platform-owner','false'));
      await page.locator('.platform-poc-launcher').waitFor({ state: 'detached' });
      assert.equal(await page.locator('[data-platform-fleet-link]').count(), 0);
    }
  }
  await context.close();
  console.log('Incident cards: 320/390/768/1440 layouts, community/date scope, keyboard, details, dialog, refresh recovery, and owner-only launcher checks passed.');
});

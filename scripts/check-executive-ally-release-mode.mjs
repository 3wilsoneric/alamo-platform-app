import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { executiveAllyReleaseMode } from './executive-ally-release-mode.mjs';

test('default release is inactive and fictional preview stays isolated', () => {
  const off = executiveAllyReleaseMode([]), preview = executiveAllyReleaseMode(['--enabled-preview']);
  assert.equal(off.enabled, false); assert.deepEqual(off.participants, []);
  assert.equal(off.display.origin, ''); assert.equal(off.display.scope, '');
  assert.equal(preview.preview, true); assert.equal(preview.pilot, false);
  assert.equal(preview.display.origin, 'https://ally.invalid');
  assert.notEqual(preview.suffix, off.suffix);
});
test('first production artifact admits only the verified owner to its display gate', () => {
  const pilot = executiveAllyReleaseMode(['--owner-pilot']);
  assert.equal(pilot.preview, false); assert.equal(pilot.enabled, true);
  assert.deepEqual(pilot.participants, [{ id: 'f73371d5-d2b4-48b4-a32b-1edc7c88869f', name: 'Eric Wilson' }]);
  assert.equal(pilot.display.origin, 'https://alamo-ally-prod-api.wittysmoke-69c99f62.westus2.azurecontainerapps.io');
  assert.equal(pilot.display.scope, 'api://c71237ad-51a0-4f97-a137-72cb9a532583/access_as_user');
  assert.equal(pilot.suffix, '-pilot');
});
test('ambiguous, repeated and unrecognized release switches cannot broaden access', () => {
  for (const args of [['--enabled-preview', '--owner-pilot'], ['--owner-pilot', '--owner-pilot'], ['--owner-pilot', '--executives'], ['--executives', '--enabled-preview'], ['--all'], ['--owner-pilot', 'anything'], ['']]) {
    assert.throws(() => executiveAllyReleaseMode(args));
  }
});

test('native preparation rejects missing, mutable and unrelated base images before external work', () => {
  for (const base of ['', 'pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform:latest', 'elsewhere.example/app@sha256:' + 'a'.repeat(64)]) {
    const result = spawnSync(process.execPath, ['scripts/prepare-executive-ally-release.mjs'], {
      encoding: 'utf8', timeout: 10_000, env: { ...process.env, PLATFORM_UI_BASE_IMAGE: base }
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Set PLATFORM_UI_BASE_IMAGE to the reviewed current immutable image/);
  }
});

test('authorized executive release names only Eric, Andrew and Betty', () => {
  const release=executiveAllyReleaseMode(['--executives']);
  assert.equal(release.enabled,true); assert.equal(release.preview,false); assert.equal(release.pilot,false);
  assert.deepEqual(release.participants,[
    {id:'f73371d5-d2b4-48b4-a32b-1edc7c88869f',name:'Eric Wilson'},
    {id:'e9f39185-d751-45c0-bcf5-c24d3565bdd9',name:'Andrew Dominici'},
    {id:'424b21d4-605a-43a6-8dff-2a89a846e698',name:'Betty Dominici'}
  ]);
  assert.equal(release.display.origin,executiveAllyReleaseMode(['--owner-pilot']).display.origin);
  assert.equal(release.suffix,'-executives');
});

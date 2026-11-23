import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { guidanceOverlay, guidancePaths as p, guidanceSourcePath } from './prepare-proforma-guidance-overlay.mjs';

const base = {
  [p.process]: "import { processHandoff } from './process-handoff.mjs';\nfunction service(){\n  const service = {\n    existing: true,\n  };\n}",
  [p.service]: "// source authorization remains before dispatch\n      if (method === 'GET' && pathname === '/processes') result = await processes.workspace();\n      else throw new Error('not found');",
  [p.api]: "import { ProcessHandoffError } from './workflow/process-handoff.mjs';\nif (error instanceof ProcessHandoffError) { return error.status; }",
};
const reader = await readFile(guidanceSourcePath, 'utf8');
test('only four owned files change and the base remains immutable', () => {
  const original = structuredClone(base), result = guidanceOverlay(base, reader);
  assert.deepEqual(base, original);
  assert.deepEqual(Object.keys(result).sort(), Object.values(p).sort());
  assert.equal(result[p.reader], reader);
  assert(result[p.process].includes('createGuidanceReader({ load, assertCurrent, scope, actorId: actor.id })'));
  assert(result[p.service].startsWith('// source authorization remains before dispatch\n'));
});
test('replaying an identical source integration is idempotent', () => {
  const first = guidanceOverlay(base, reader);
  assert.deepEqual(guidanceOverlay(first, reader), first);
});
test('missing and ambiguous live boundaries fail closed', () => {
  assert.throws(() => guidanceOverlay({ ...base, [p.service]: 'changed runtime' }, reader), /boundary changed/);
  assert.throws(() => guidanceOverlay({ ...base, [p.api]: base[p.api] + base[p.api] }, reader), /boundary changed/);
  assert.throws(() => guidanceOverlay({ ...base, [p.process]: undefined }, reader), /Missing deployed/);
});
test('an independently changed installed reader requires reconciliation', () => {
  assert.throws(() => guidanceOverlay({ ...base, [p.reader]: reader + '\n// another release' }, reader), /reconcile/);
});

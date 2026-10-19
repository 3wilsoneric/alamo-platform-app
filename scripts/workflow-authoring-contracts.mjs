import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const target = 'src/features/workflow/legacy/src/lib';
const manifestPath = path.join(root, 'src/features/workflow/authoring-contracts.v1.json');
const files = ['capture-contract.mjs', 'capture-contract.d.mts', 'capture-types.ts', 'sop-contract.mjs', 'sop-contract.d.mts', 'sop-types.ts'];
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const source = path.resolve(process.env.WORKFLOW_AUTHORING_SOURCE_ROOT ?? path.join(root, '../alamo-workflow'));
const writing = process.argv.includes('--write');
if (writing) {
  const entries = [];
  for (const file of files) {
    const sourcePath = `src/lib/${file}`, destination = `${target}/${file}`;
    const bytes = await readFile(path.join(source, sourcePath));
    await mkdir(path.dirname(path.join(root, destination)), { recursive: true });
    await writeFile(path.join(root, destination), bytes);
    entries.push({ source: sourcePath, destination, sha256: digest(bytes) });
  }
  await writeFile(manifestPath, JSON.stringify({ schemaVersion: 1, owner: 'Alamo Workflow', contractVersion: 1, rendererVersion: 1, files: entries }, null, 2) + '\n');
}
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.owner, 'Alamo Workflow');
assert.equal(manifest.contractVersion, 1);
assert.equal(manifest.rendererVersion, 1);
assert.deepEqual(manifest.files.map(entry => entry.destination), files.map(file => `${target}/${file}`));
for (const entry of manifest.files) {
  assert.equal(digest(await readFile(path.join(root, entry.destination))), entry.sha256, `Pinned contract changed: ${entry.destination}`);
  if (process.argv.includes('--strict-sources')) assert.equal(digest(await readFile(path.join(source, entry.source))), entry.sha256, `Workflow source drift: ${entry.source}`);
}
console.log(`Workflow authoring contracts verified: ${files.length} pinned files, schema/renderer v1${writing ? ' (refreshed from source)' : ''}.`);

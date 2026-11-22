import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import React from 'react';
import { executiveAllyReleaseMode } from './executive-ally-release-mode.mjs';

const { preview, pilot, enabled, suffix, imageKind, participants, display } = executiveAllyReleaseMode(process.argv.slice(2));
const root = 'generated/executive-ally-release' + suffix;
const receipt = JSON.parse(await readFile(root + '/receipt.json', 'utf8'));
const image = `platform-executive-${imageKind}:20261122-v0184`;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const docker = args => execFileSync('docker', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const inventory = `import {readdir,readFile,stat} from 'node:fs/promises';import {createHash} from 'node:crypto';
 const files={};async function walk(file){const info=await stat(file);if(info.isDirectory()){for(const name of await readdir(file))await walk(file+'/'+name);}else files[file.replace(/^\\/app\\//,'')]=createHash('sha256').update(await readFile(file)).digest('hex');}
 for(const file of ['dist','api','server','shared','package.json','package-lock.json','node_modules/@alamo/agent-runtime'])await walk('/app/'+file);console.log(JSON.stringify(files));`;
function manifest(target) { return JSON.parse(docker(['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'node', target, '--input-type=module', '-e', inventory])); }
const before = manifest(receipt.base), after = manifest(image);
for (const [file, digest] of Object.entries(before)) assert.equal(after[file], receipt.files[file] ?? digest, `Unreviewed production change: ${file}`);
for (const [file, digest] of Object.entries(after)) assert.equal(digest, receipt.files[file] ?? before[file], `Unrecorded candidate file: ${file}`);
for (const [file, digest] of Object.entries(receipt.files)) {
  assert.equal(after[file], digest, `Candidate mismatch: ${file}`);
  const bytes = await readFile(root + '/overlay/' + file); assert.equal(hash(bytes), digest);
  if (file.endsWith('.gz') || file.endsWith('.br')) {
    const raw = file.endsWith('.gz') ? gunzipSync(bytes) : brotliDecompressSync(bytes);
    assert.equal(hash(raw), receipt.files[file.replace(/\.(gz|br)$/, '')], `Encoding mismatch: ${file}`);
  }
}
for (const [file, digest] of Object.entries(receipt.sourceHashes)) assert.equal(hash(await readFile(file)), digest, `Source changed since preparation: ${file}`);
const config = target => JSON.parse(docker(['image', 'inspect', target, '--format', '{{json .Config}}']));
const previous = config(receipt.base), candidate = config(image);
for (const field of ['Cmd', 'Entrypoint', 'Env', 'User', 'WorkingDir', 'ExposedPorts', 'Healthcheck']) assert.deepEqual(candidate[field], previous[field], `Image configuration changed: ${field}`);
assert.equal(receipt.reportsEnabled, enabled);
assert.equal(receipt.previewOnly, preview);
assert.equal(receipt.ownerPilot, pilot);
assert.deepEqual(receipt.display, display);
assert.equal(receipt.sourceConfigured, false);
const originalHost = docker(['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'cat', receipt.base, '/app/server/app-server.mjs']);
if (enabled) {
  const connect = '"connect-src \'self\' https://login.microsoftonline.com"';
  assert.equal(originalHost.split(connect).length, 2);
  assert.equal(await readFile(root + '/overlay/server/app-server.mjs', 'utf8'),
    originalHost.replace(connect, JSON.stringify("connect-src 'self' https://login.microsoftonline.com " + display.origin)), 'Only the exact service origin may change in the live host.');
} else assert.equal(after['server/app-server.mjs'], before['server/app-server.mjs']);

// Exercise the actual appended browser module without entering a real account.
// The existing auth/router providers are host objects, not a second MSAL client.
const bundle = await readFile(root + '/overlay/dist/assets/' + receipt.newJs, 'utf8');
const marker = '\nconst PlatformAllyMsal=';
assert.equal(bundle.split(marker).length, 2);
const addition = bundle.slice(bundle.indexOf(marker));
const children = { existing: 'host outlet' };
for (const bypass of [false, true]) for (const restricted of [false, true]) for (const subject of ['allowed', 'other-user', 'other-tenant', 'signed-out']) {
  const claims = subject === 'signed-out' ? undefined : {
    tid: subject === 'other-tenant' ? '33333333-3333-4333-8333-333333333333' : 'd72d9036-cff8-4f5f-a6fa-d698f621d420',
    oid: subject === 'other-user' ? '44444444-4444-4444-4444-444444444444' : participants[0]?.id ?? '11111111-1111-4111-8111-111111111111',
  };
  const context = { V: React, H: {}, We: {}, Ue: {}, _i: bypass,
    i: () => ({ accounts: claims ? [{ homeAccountId: 'fictional-session', idTokenClaims: claims }] : [], instance: { getActiveAccount: () => null } }),
    vn: () => ({ pathname: '/', search: '' }), window: { location: { origin: 'https://platform.invalid', hostname: 'platform.invalid' } }, location: { hostname: 'platform.invalid' }, children, restricted };
  const element = runInNewContext(addition + '\nPlatformExecutiveAlly({children,restricted})', context);
  assert.equal(element.props.children[0], children, 'Preserve the original route outlet.');
  const expected = enabled && !restricted && subject === 'allowed';
  assert.equal(Boolean(element.props.children[1]), expected, `Display gate: mode=${imageKind}, restricted=${restricted}, subject=${subject}, bypass=${bypass}`);
  if (expected) assert.equal(element.props.children[1].key, 'fictional-session', 'Changing account remounts the report panel.');
}

const smoke = `import assert from 'node:assert/strict';import {createAppServer} from '/app/server/app-server.mjs';
 const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(origin+'/healthz')).status,200);
  for(const route of ['/','/admissions','/chat','/analytics/residents','/incidents']){const response=await fetch(origin+route);assert.equal(response.status,200,route);assert((await response.text()).includes(${JSON.stringify(receipt.newJs)}),route+' must use the candidate entry');
   const directives=response.headers.get('content-security-policy').split('; ');
   assert.equal(directives.find(d=>d.startsWith('connect-src ')),${JSON.stringify("connect-src 'self' https://login.microsoftonline.com" + (enabled ? ' ' + display.origin : ''))});
   assert(directives.includes("script-src 'self'")&&directives.includes("object-src 'none'")&&directives.includes("frame-ancestors 'self'"));}
  for(const route of ['/api/platform/bootstrap','/api/platform/admissions-dashboard','/api/platform/everyagent'])assert.equal((await fetch(origin+route)).status,401,route);
  const source=()=>fetch(origin+'/api/platform/ally-source/v1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  let response=await source();assert.equal(response.status,503);assert(response.headers.get('cache-control').includes('no-store'));
  process.env.PLATFORM_AGENT_SOURCE_AUDIENCE='11111111-1111-4111-8111-111111111111';response=await source();assert.equal(response.status,401);assert(response.headers.get('cache-control').includes('no-store'));
  console.log('Container HTTP: routes, health, old protected APIs, disabled source and workload authorization passed.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}`;
const smokeOutput = docker(['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '-e', 'NODE_ENV=production', '-e', 'API_AUTH_REQUIRED=true',
  '-e', 'ENTRA_TENANT_ID=d72d9036-cff8-4f5f-a6fa-d698f621d420', '-e', 'ENTRA_CLIENT_ID=11111111-1111-4111-8111-111111111111',
  '--entrypoint', 'node', image, '--input-type=module', '-e', smoke]);
assert(smokeOutput.includes('Container HTTP:'));
const result = { checkedAt: new Date().toISOString(), imageId: docker(['image', 'inspect', image, '--format', '{{.Id}}']).trim(), base: receipt.base,
  baseFiles: Object.keys(before).length, reviewedFiles: Object.keys(receipt.files).length, preservedOtherFiles: true, imageConfiguration: 'unchanged',
  previewOnly: preview, ownerPilot: pilot,
  checks: ['exact file allowlist', 'compressed assets', 'source fingerprints', 'shared host authentication', enabled ? 'configured subject and denied display gates' : 'disabled display gate', 'exact service CSP origin', 'HTTP routes', 'anonymous API denial', 'source disabled/unauthorized denial'],
  productionDeployed: false, liveModelTested: false, signedInBrowserTested: false };
await writeFile(root + '/verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

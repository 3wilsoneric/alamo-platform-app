import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { gunzipSync, brotliDecompressSync } from 'node:zlib';
import ts from 'typescript';
import { loadEnv } from 'vite';
import { executiveAllyReleaseMode } from './executive-ally-release-mode.mjs';
import { guidanceOverlay, guidancePaths, guidanceSourcePath } from './prepare-proforma-guidance-overlay.mjs';

const { preview, pilot, enabled, suffix, imageKind, participants, display } = executiveAllyReleaseMode(process.argv.slice(2));
const root = 'generated/executive-ally-release' + suffix;
const receipt = JSON.parse(await readFile(root + '/receipt.json', 'utf8'));
const image = `platform-executive-${imageKind}:native-v0187`;
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
  assert(Object.values(guidancePaths).includes(file) || /^(?:dist\/assets\/[^/]+|dist\/(?:index\.html|(?:admissions|chat)\/index\.html|brand\/ally-mark\.svg)(?:\.gz|\.br)?|server\/(?:ally-report-source-release|app-server|admissions-dashboard|platform-snapshot)\.mjs|api\/platform\.js)$/.test(file), `Outside the native UI and source boundary: ${file}`);
  assert.equal(after[file], digest, `Candidate mismatch: ${file}`);
  const bytes = await readFile(root + '/overlay/' + file); assert.equal(hash(bytes), digest);
  if (file.endsWith('.gz') || file.endsWith('.br')) {
    const raw = file.endsWith('.gz') ? gunzipSync(bytes) : brotliDecompressSync(bytes);
    assert.equal(hash(raw), receipt.files[file.replace(/\.(gz|br)$/, '')], `Encoding mismatch: ${file}`);
  }
}
for (const [file, digest] of Object.entries(receipt.sourceHashes)) assert.equal(hash(await readFile(file)), digest, `Source changed since preparation: ${file}`);
// Recompute the exact four-file delta against the immutable base. An allowlist
// alone must never authorize arbitrary replacement of the authoring runtime.
const guidanceBase = {};
for (const file of Object.values(guidancePaths)) if (Object.hasOwn(before, file)) {
  guidanceBase[file] = docker(['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'cat', receipt.base, '/app/' + file]);
}
assert(Object.hasOwn(receipt.sourceHashes, guidanceSourcePath));
assert(Object.hasOwn(receipt.sourceHashes, 'scripts/prepare-proforma-guidance-overlay.mjs'));
for (const [file, expected] of Object.entries(guidanceOverlay(guidanceBase, await readFile(guidanceSourcePath, 'utf8')))) {
  assert.equal(await readFile(root + '/overlay/' + file, 'utf8'), expected, `Unexpected ProForma delta: ${file}`);
}
const config = target => JSON.parse(docker(['image', 'inspect', target, '--format', '{{json .Config}}']));
const previous = config(receipt.base), candidate = config(image);
for (const field of ['Cmd', 'Entrypoint', 'Env', 'User', 'WorkingDir', 'ExposedPorts', 'Healthcheck']) assert.deepEqual(candidate[field], previous[field], `Image configuration changed: ${field}`);
assert.equal(receipt.reportsEnabled, enabled);
assert.equal(receipt.previewOnly, preview);
assert.equal(receipt.ownerPilot, pilot);
assert.deepEqual(receipt.display, display);
assert.equal(receipt.sourceConfigured, false);
assert.equal(receipt.nativeUi, true);
assert.equal(receipt.publicBuildEnvironmentHash, hash(JSON.stringify(Object.entries(loadEnv('production', process.cwd(), 'VITE_')).sort(([a], [b]) => a.localeCompare(b)))), 'Public build environment changed; prepare again.');
const originalHost = docker(['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'cat', receipt.base, '/app/server/app-server.mjs']);
if (enabled) {
  const connect = '"connect-src \'self\' https://login.microsoftonline.com"';
  assert.equal(originalHost.split(connect).length, 2);
  assert.equal(await readFile(root + '/overlay/server/app-server.mjs', 'utf8'),
    originalHost.replace(connect, JSON.stringify("connect-src 'self' https://login.microsoftonline.com " + display.origin)), 'Only the exact service origin may change in the live host.');
} else assert.equal(after['server/app-server.mjs'], before['server/app-server.mjs']);

// The native app owns its auth provider and panel. Verify the compiled source
// gate with fictional claims; source fingerprints bind this check to the build.
// Real signed-in acceptance remains a separate required release check.
const bundle = await readFile(root + '/overlay/dist/assets/' + receipt.newJs, 'utf8');
assert(!bundle.includes('PlatformAllyMsal=') && !bundle.includes('PlatformExecutiveAlly'), 'No appended Ally/auth tree.');
assert(!Object.hasOwn(receipt.files, 'dist/executive-ally.css'), 'Use the native stylesheet.');
for (const file of ['dist/index.html', 'dist/admissions/index.html', 'dist/chat/index.html']) {
  const html = await readFile(root + '/overlay/' + file, 'utf8');
  assert.equal([...html.matchAll(/<script\b[^>]*type="module"[^>]*src=/g)].length, 1, 'One native app entry.');
  assert.equal([...html.matchAll(/href="\/assets\/index-[^/]+\.css"/g)].length, 1, 'One main native stylesheet.');
  for (const kept of [...receipt.preservedScripts, ...receipt.preservedStyles]) assert(html.includes(kept), `Preserve shell extension: ${file}`);
}
const accessPath = 'src/features/agent/reports/reportAccess.ts';
assert(Object.hasOwn(receipt.sourceHashes, accessPath));
const accessSource = await readFile(accessPath, 'utf8');
const accessCode = ts.transpileModule(accessSource.replaceAll('import.meta.env', '__env'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const shell = await readFile('src/shared/layout/ProtectedAppShell.tsx', 'utf8');
assert(Object.hasOwn(receipt.sourceHashes, 'src/shared/layout/ProtectedAppShell.tsx'));
const shellTree = ts.createSourceFile('ProtectedAppShell.tsx', shell, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nativeGates = [];
function findNativeGate(node) {
  if (ts.isIfStatement(node) && node.expression.getText(shellTree).includes('hasExecutiveReportAccess')) nativeGates.push(node.expression.getText(shellTree));
  ts.forEachChild(node, findNativeGate);
}
findNativeGate(shellTree);
assert.equal(nativeGates.length, 1, 'One native report access branch.');
for (const hasExecutiveReportAccess of [false, true]) for (const assessor of [false, true]) for (const director of [false, true]) {
  assert.equal(runInNewContext(nativeGates[0], { hasExecutiveReportAccess,
    admissionsAccess: { restrictedToAdmissions: assessor }, executiveDirectorAccess: { restrictedToExecutive: director } }),
  hasExecutiveReportAccess && !assessor && !director, 'Restricted workspaces must not mount executive reports.');
}
assert.equal((shell.match(/<ExecutiveAlly\b/g) ?? []).length, 1, 'One native report panel.');
assert(shell.includes('<ExecutiveAlly key={getApiAuthCachePartition()}'), 'Account changes remount the report panel.');
assert(shell.includes('return showEveryAgent ? <EveryAgentProvider key={getApiAuthCachePartition()}>{withAlly}</EveryAgentProvider> : withAlly;'), 'Report access replaces the companion instead of adding a duplicate.');
for (const bypass of [false, true]) for (const configured of [false, true]) for (const subject of ['allowed', 'other-user', 'other-tenant', 'signed-out']) {
  const claims = subject === 'signed-out' ? undefined : {
    tid: subject === 'other-tenant' ? '33333333-3333-4333-8333-333333333333' : 'd72d9036-cff8-4f5f-a6fa-d698f621d420',
    oid: subject === 'other-user' ? '44444444-4444-4444-4444-444444444444' : participants[0]?.id ?? '11111111-1111-4111-8111-111111111111',
  };
  const dependencies = {
    '@azure/msal-react': { useMsal: () => ({ accounts: claims ? [{ idTokenClaims: claims }] : [], instance: { getActiveAccount: () => null } }) },
    '../../../app/auth/authConfig': { isE2EAuthBypassEnabled: bypass },
    '../conversations/agentTransport': { agentChatConfigured: configured }
  };
  const context = { exports: {}, __env: { VITE_ALLY_REPORTS_ENABLED: display.enabled, VITE_ALLY_REPORT_PARTICIPANTS: display.participants },
    location: { hostname: 'platform.invalid' }, require: id => { assert(Object.hasOwn(dependencies, id), `Unexpected access dependency: ${id}`); return dependencies[id]; } };
  const allowed = runInNewContext(accessCode + '\nexports.useExecutiveReportAccess()', context);
  assert.equal(Boolean(allowed), enabled && configured && subject === 'allowed', `Native display gate: mode=${imageKind}, configured=${configured}, subject=${subject}, bypass=${bypass}`);
}

const smoke = `import assert from 'node:assert/strict';import {createAppServer} from '/app/server/app-server.mjs';
 const server=createAppServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin='http://127.0.0.1:'+server.address().port;
 try{
  assert.equal((await fetch(origin+'/healthz')).status,200);
  for(const route of ['/','/admissions','/chat','/analytics/residents','/analytics/community','/analytics/licensing','/incidents','/workflow']){const response=await fetch(origin+route);assert.equal(response.status,200,route);assert((await response.text()).includes(${JSON.stringify(receipt.newJs)}),route+' must use the candidate entry');
   const directives=response.headers.get('content-security-policy').split('; ');
   assert.equal(directives.find(d=>d.startsWith('connect-src ')),${JSON.stringify("connect-src 'self' https://login.microsoftonline.com" + (enabled ? ' ' + display.origin : ''))});
   assert(directives.includes("script-src 'self'")&&directives.includes("object-src 'none'")&&directives.includes("frame-ancestors 'self'"));}
  assert.equal((await fetch(origin+'/poc/app/now')).status,200,'Carelog route');
  for(const route of ['/api/platform/bootstrap','/api/platform/admissions-dashboard','/api/platform/everyagent'])assert.equal((await fetch(origin+route)).status,401,route);
  const guidance=await fetch(origin+'/api/platform/workflow/v1/processes/guidance',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(guidance.status,401);assert(guidance.headers.get('cache-control').includes('no-store'));
  const source=()=>fetch(origin+'/api/platform/ally-source/v1',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});
  let response=await source();assert.equal(response.status,503);assert(response.headers.get('cache-control').includes('no-store'));
  process.env.PLATFORM_AGENT_SOURCE_AUDIENCE='11111111-1111-4111-8111-111111111111';response=await source();assert.equal(response.status,401);assert(response.headers.get('cache-control').includes('no-store'));
  console.log('Container HTTP: routes, health, old protected APIs, disabled source and workload authorization passed.');
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}`;
const smokeOutput = docker(['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '-e', 'NODE_ENV=production', '-e', 'API_AUTH_REQUIRED=true',
  '-e', 'ENTRA_TENANT_ID=d72d9036-cff8-4f5f-a6fa-d698f621d420', '-e', 'ENTRA_CLIENT_ID=11111111-1111-4111-8111-111111111111',
  '--entrypoint', 'node', image, '--input-type=module', '-e', smoke]);
assert(smokeOutput.includes('Container HTTP:'));
const transportOutput = docker(['run', '--rm', '--platform', 'linux/amd64', '--network', 'none',
  '-v', path.resolve('scripts/check-snapshot-transport.mjs') + ':/app/scripts/check-snapshot-transport.mjs:ro',
  '-v', path.resolve('scripts/fixtures/pipeline-clinical-snapshot.sanitized.json') + ':/app/scripts/fixtures/pipeline-clinical-snapshot.sanitized.json:ro',
  '--entrypoint', 'node', image, '/app/scripts/check-snapshot-transport.mjs']);
assert(transportOutput.includes('Azure snapshot transport passed:'));
const result = { checkedAt: new Date().toISOString(), imageId: docker(['image', 'inspect', image, '--format', '{{.Id}}']).trim(), base: receipt.base,
  nativeUi: true, baseFiles: Object.keys(before).length, reviewedFiles: Object.keys(receipt.files).length, preservedOtherFiles: true, imageConfiguration: 'unchanged',
  previewOnly: preview, ownerPilot: pilot,
  checks: ['exact file allowlist', 'exact ProForma guidance delta and anonymous denial', 'compressed assets', 'source fingerprints', 'native source-bound authentication and display gates', enabled ? 'configured subject and denied display gates' : 'disabled display gate', 'exact service CSP origin', 'HTTP routes', 'anonymous API denial', 'source disabled/unauthorized denial', 'bounded Azure snapshot transport and retry'],
  productionDeployed: false, liveModelTested: false, signedInBrowserTested: false };
await writeFile(root + '/verification.json', JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));

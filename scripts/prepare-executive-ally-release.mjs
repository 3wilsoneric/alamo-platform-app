// Prepare the native Platform UI and the bounded Ally source endpoint on an exact live image.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { build, loadEnv } from 'vite';
import { executiveAllyReleaseMode } from './executive-ally-release-mode.mjs';

const base = process.env.PLATFORM_UI_BASE_IMAGE;
assert.match(base ?? '', /^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/, 'Set PLATFORM_UI_BASE_IMAGE to the reviewed current immutable image.');
const { preview, pilot, enabled, suffix, display } = executiveAllyReleaseMode(process.argv.slice(2));
const root = process.cwd(), out = path.resolve('generated/executive-ally-release' + suffix);
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
const currentImage = () => run('az', ['containerapp', 'show', '-n', 'alamo-platform-prod-web', '-g', 'alamo-data-rg', '--query', 'properties.template.containers[0].image', '-o', 'tsv']).trim();
assert.equal(currentImage(), base, 'Production changed; reconcile its new source before preparation.');
const readImage = file => run('docker', ['run', '--rm', '--platform', 'linux/amd64', '--network', 'none', '--entrypoint', 'cat', base, '/app/' + file]);
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function once(text, before, after) { assert.equal(text.split(before).length, 2, `Release boundary changed: ${before.slice(0, 80)}`); return text.replace(before, after); }
const files = {}, sources = {};
async function source(file) { const bytes = await readFile(file); sources[file] = hash(bytes); return bytes.toString(); }
async function write(file, bytes, compress = false) {
  const target = path.join(out, 'overlay', file); await mkdir(path.dirname(target), { recursive: true });
  for (const [suffix, data] of [['', bytes], ...(compress ? [['.gz', gzipSync(bytes)], ['.br', brotliCompressSync(bytes)]] : [])]) {
    await writeFile(target + suffix, data); files[file + suffix] = hash(data);
  }
}
async function recordFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await recordFiles(file);
    else { assert(entry.isFile(), `Unexpected overlay entry: ${file}`); files[path.relative(path.join(out, 'overlay'), file)] = hash(await readFile(file)); }
  }
}

// These modes configure display only; source grants and execution are separate.
assert(process.env.VITE_ALLY_REPORTS_ENABLED !== 'true', 'Environment activation is not supported; use an explicit release mode.');
const oldJs = readImage('dist/index.html').match(/<script\b[^>]*type="module"[^>]*src="\/assets\/([^"/]+\.js)"/)?.[1];
assert(oldJs, 'Current native entry missing.');
const prior = readImage('dist/assets/' + oldJs);
assert.equal(hash(run('curl', ['-fsSL', 'https://www.alamoplatform.com/assets/' + oldJs])), hash(prior));
const publicBuildEnvironment = loadEnv('production', root, 'VITE_');
for (const key of ['VITE_ENTRA_TENANT_ID', 'VITE_ENTRA_CLIENT_ID']) {
  assert.match(publicBuildEnvironment[key] ?? '', /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i, `Missing production public identity setting: ${key}`);
  assert(prior.includes(publicBuildEnvironment[key]), `Production identity differs: ${key}`);
}
const hostAuth = { tenantId: publicBuildEnvironment.VITE_ENTRA_TENANT_ID, clientId: publicBuildEnvironment.VITE_ENTRA_CLIENT_ID,
  apiScope: publicBuildEnvironment.VITE_ENTRA_API_SCOPE || `api://${publicBuildEnvironment.VITE_ENTRA_CLIENT_ID}/access_as_user` };
assert(prior.includes(hostAuth.apiScope) || hostAuth.apiScope === `api://${hostAuth.clientId}/access_as_user`, 'Review the changed Platform API scope.');
await rm(path.join(out, 'overlay'), { recursive: true, force: true });
// Build the existing app and its single ProtectedAppShell. Never append a second
// component tree or MSAL instance to a previously minified browser bundle.
const browser = await build({ define: {
  'import.meta.env.VITE_ALLY_REPORTS_ENABLED': JSON.stringify(display.enabled),
  'import.meta.env.VITE_ALLY_REPORT_PARTICIPANTS': JSON.stringify(display.participants),
  'import.meta.env.VITE_ALAMOAGENT_API_ORIGIN': JSON.stringify(display.origin),
  'import.meta.env.VITE_ALAMOAGENT_SCOPE': JSON.stringify(display.scope),
  'import.meta.env.VITE_E2E_AUTH_BYPASS': JSON.stringify('false'),
  'import.meta.env.VITE_API_AUTH_REQUIRED': JSON.stringify('true')
} });
const browserOutput = (Array.isArray(browser) ? browser : [browser]).flatMap(result => result.output);
const browserChunks = browserOutput.filter(item => item.type === 'chunk');
for (const file of ['src/app/auth/authConfig.ts', 'src/shared/layout/ProtectedAppShell.tsx']) {
  assert.equal(browserChunks.filter(chunk => Object.hasOwn(chunk.modules, path.join(root, file))).length, 1, `Expected one native owner: ${file}`);
}
run(process.execPath, ['scripts/stage-spa-route-indexes.mjs']);
run(process.execPath, ['scripts/compress-browser-dist.mjs']);
// Canonical UI preparation preserves the current shell scripts, Workflow CSS,
// Carelog files and live-image/HTML checks. Only its browser overlay is consumed.
run(process.execPath, ['scripts/prepare-platform-ui-release.mjs']);
const uiRoot = path.join(root, 'generated/platform-ui-release');
const ui = JSON.parse(await readFile(path.join(uiRoot, 'receipt.json'), 'utf8'));
assert.equal(ui.base, base);
await mkdir(out, { recursive: true });
await cp(path.join(uiRoot, 'overlay'), path.join(out, 'overlay'), { recursive: true });
await recordFiles(path.join(out, 'overlay'));
const html = await readFile(path.join(out, 'overlay/dist/index.html'), 'utf8');
const newJs = html.match(/<script\b[^>]*type="module"[^>]*src="\/assets\/([^"/]+\.js)"/)?.[1];
assert(newJs && browserChunks.some(chunk => chunk.fileName === `assets/${newJs}`), 'Prepared UI must use this native build.');

// Bundle only the new source boundary and its pinned contracts. Retain the live
// source readers and installed monitoring engine, rather than upgrading either.
const readers = ['platform-snapshot', 'platform-data', 'pipeline-admissions-summary', 'admissions-dashboard', 'licensing-library', 'workflow-knowledge-source', 'databricks'];
const externalReaders = new Set(readers.map(name => path.join(root, `server/${name}.mjs`)));
const server = await build({ configFile: false, envDir: false, publicDir: false, ssr: { noExternal: ['@alamo/agent-runtime'] },
  build: { write: false, minify: false, ssr: 'server/ally-report-source-api.mjs', rollupOptions: {
    external(id, importer) { return externalReaders.has(id) || Boolean(importer && id.startsWith('.') && externalReaders.has(path.resolve(path.dirname(importer), id))); },
    output: { codeSplitting: false, paths: id => externalReaders.has(id) ? './' + path.basename(id) : id } } } });
const serverOutput = (Array.isArray(server) ? server : [server]).flatMap(result => result.output);
assert.equal(serverOutput.length, 1); assert.equal(serverOutput[0].type, 'chunk');
for (const reader of externalReaders) assert(!Object.keys(serverOutput[0].modules).includes(reader), `Production reader was bundled: ${reader}`);
await write('server/ally-report-source-release.mjs', serverOutput[0].code);
// Preserve the deployed reader's compressed publications and identity handling,
// adding the reviewed read deadline and equivalent credential consolidation.
await write('server/platform-snapshot.mjs', await source('server/platform-snapshot.mjs'));
let api = readImage('api/platform.js');
assert(!api.includes('handlePlatformReportSourceRequest') && !api.includes('/api/platform/ally-source/v1'), 'The base already contains an Ally source endpoint; review its installed implementation before replacing it.');
api = 'import { handlePlatformReportSourceRequest } from "../server/ally-report-source-release.mjs";\n' + once(api,
  '  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";',
  '  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";\n  if (requestPath === "/api/platform/ally-source/v1") { await handlePlatformReportSourceRequest(req, res); return; }');
await write('api/platform.js', api);
// The live host has a static CSP, unlike the staging wrapper. Permit exactly
// the configured service; retain every other directive and server byte.
if (enabled) await write('server/app-server.mjs', once(readImage('server/app-server.mjs'),
  '"connect-src \'self\' https://login.microsoftonline.com"',
  JSON.stringify("connect-src 'self' https://login.microsoftonline.com " + display.origin)));
await write('server/admissions-dashboard.mjs', once(readImage('server/admissions-dashboard.mjs'), 'function facilityIdForPipelineCommunity(name)', 'export function facilityIdForPipelineCommunity(name)'));
await write('dist/brand/ally-mark.svg', await source('public/brand/ally-mark.svg'));
// Fingerprint the actual native and source modules plus their build owners.
for (const result of [...browserChunks, serverOutput[0]]) for (const id of Object.keys(result.modules)) {
  const file = id.split('?')[0];
  if (file.startsWith(root + '/') && !file.includes('/node_modules/')) await source(path.relative(root, file));
}
for (const file of ['package.json', 'package-lock.json', 'vite.config.ts', 'vendor/alamo-agent-runtime-0.18.7.tgz',
  'scripts/prepare-executive-ally-release.mjs', 'scripts/executive-ally-release-mode.mjs', 'scripts/prepare-platform-ui-release.mjs',
  'scripts/stage-spa-route-indexes.mjs', 'scripts/compress-browser-dist.mjs']) await source(file);
assert.equal(currentImage(), base, 'Production changed during preparation; prepare again against its reviewed current image.');
await writeFile(path.join(out, 'Dockerfile'), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(out, '.dockerignore'), '*\n!Dockerfile\n!overlay/\n!overlay/**\n');
await writeFile(path.join(out, 'receipt.json'), JSON.stringify({ base, rollback: base, sourceCommit: run('git', ['rev-parse', 'HEAD']).trim(),
  nativeUi: true, hostAuth, publicBuildEnvironmentHash: hash(JSON.stringify(Object.entries(publicBuildEnvironment).sort(([a], [b]) => a.localeCompare(b)))),
  oldJs, newJs, sourceHashes: sources, files, reportsEnabled: enabled, previewOnly: preview, ownerPilot: pilot, display, sourceConfigured: false,
  preservedScripts: ui.preservedScripts, preservedStyles: ui.preservedStyles,
  scope: preview ? 'Local fictional display preview only. Unroutable service, fictional participant, source endpoint disabled; never deploy this preview.'
    : pilot ? 'Native owner-only production service display. Source endpoint remains disabled without deployment configuration. API membership, source grants, required release checks and signed-in acceptance remain separate.'
      : 'Native report UI disabled and source endpoint disabled. Live source readers, monitoring runtime, identity, configuration and data remain unchanged.' }, null, 2));
console.log(JSON.stringify({ out, files: Object.keys(files).length, newJs, enabled, previewOnly: preview, ownerPilot: pilot }));

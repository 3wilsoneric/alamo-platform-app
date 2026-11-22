// Add Ally to the pinned live shell without rebuilding unrelated route overlays.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import ts from 'typescript';
import { executiveAllyReleaseMode } from './executive-ally-release-mode.mjs';

const base = 'pipelineprodacra6qdvl6ebenac.azurecr.io/alamo-platform@sha256:b958cb49939c895b56a7c2f032c0208863efb0a5b726a29c00862f47117c59dd';
const { preview, pilot, enabled, suffix, display } = executiveAllyReleaseMode(process.argv.slice(2));
const root = process.cwd(), out = path.resolve('generated/executive-ally-release' + suffix);
const run = (command, args) => execFileSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
assert.equal(run('az', ['containerapp', 'show', '-n', 'alamo-platform-prod-web', '-g', 'alamo-data-rg', '--query', 'properties.template.containers[0].image', '-o', 'tsv']).trim(), base, 'Production changed; reconcile its new source before preparation.');
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

// Explicit modes keep fictional previews separate from the owner pilot. Neither
// grants source access, enrolls a browser client, or enables model execution.
assert(process.env.VITE_ALLY_REPORTS_ENABLED !== 'true', 'Environment activation is not supported; use an explicit release mode.');
const oldJs = 'index-platform-consistency-f080e6786782.js';
const prior = readImage('dist/assets/' + oldJs);
assert.equal(hash(prior), 'f080e67867827e01cf397d3d55c1b47837fd131e79701b4b555324728757f867');
assert.equal(hash(run('curl', ['-fsSL', 'https://www.alamoplatform.com/assets/' + oldJs])), hash(prior));

await rm(path.join(out, 'overlay'), { recursive: true, force: true });
const entry = path.join(out, 'executive-release-entry.js');
const authConfig = path.join(root, 'src/app/auth/authConfig.ts');
const browserExternals = ['react', 'react/jsx-runtime', '@azure/msal-react', 'react-router-dom', 'react-dom/client', 'react-dom'];
const isHostAuth = (id, importer) => id === authConfig || Boolean(importer && id.startsWith('.') && path.resolve(path.dirname(importer), id) === authConfig.slice(0, -3));
const browser = await build({ configFile: false, envDir: false, publicDir: false,
  plugins: [react(), { name: 'executive-release-entry', enforce: 'pre', resolveId(id) { if (id === entry) return id; },
    load(id) { if (id === entry) return `import {createElement,Fragment} from 'react';
      import {useMsal} from '@azure/msal-react';
      import ExecutiveAlly from ${JSON.stringify(path.join(root, 'src/features/agent/reports/ExecutiveAlly.tsx'))};
      import {useExecutiveReportAccess} from ${JSON.stringify(path.join(root, 'src/features/agent/reports/reportAccess.ts'))};
      export default function ExecutiveReleaseOutlet({children,restricted}) {
        const allowed=useExecutiveReportAccess(); const {instance,accounts}=useMsal();
        const account=instance.getActiveAccount()??accounts[0];
        return createElement(Fragment,null,children,allowed&&!restricted?createElement(ExecutiveAlly,{key:account?.homeAccountId}):null);
      }`; } }],
  define: { 'import.meta.env.VITE_ALLY_REPORTS_ENABLED': JSON.stringify(display.enabled), 'import.meta.env.VITE_ALLY_REPORT_PARTICIPANTS': JSON.stringify(display.participants),
    'import.meta.env.VITE_E2E_AUTH_BYPASS': JSON.stringify('false'), 'import.meta.env.VITE_ALAMOAGENT_API_ORIGIN': JSON.stringify(display.origin), 'import.meta.env.VITE_ALAMOAGENT_SCOPE': JSON.stringify(display.scope) },
  build: { write: false, minify: false, lib: { entry, formats: ['iife'], name: 'PlatformExecutiveAlly' },
    rollupOptions: { external: (id, importer) => browserExternals.includes(id) || isHostAuth(id, importer), output: {
      globals: id => ({ react: 'V', 'react/jsx-runtime': 'H', '@azure/msal-react': 'PlatformAllyMsal', 'react-router-dom': 'PlatformAllyRouter', 'react-dom/client': 'We', 'react-dom': 'Ue' })[id] ?? 'PlatformAllyAuth' } } } });
const browserOutput = (Array.isArray(browser) ? browser : [browser]).flatMap(result => result.output);
const browserCode = browserOutput.find(item => item.type === 'chunk');
assert(browserCode && browserOutput.filter(item => item.type === 'chunk').length === 1, 'Expected one embedded browser module.');
assert(!Object.keys(browserCode.modules).some(id => id === authConfig || id.includes('/@azure/msal-browser/')), 'Reuse the live authentication instance.');
const outlet = '(0,H.jsx)(Xn,{})';
const tree = ts.createSourceFile('live.js', prior, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const shellNode = tree.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'js');
assert(shellNode, 'Protected shell missing.');
const shellStart = shellNode.getStart(tree), shellEnd = shellNode.end;
// Only the protected shell's outlet changes. Other route modules and their
// authentication/loading branches retain their exact bytes.
const shell = prior.slice(shellStart, shellEnd);
const replaced = once(shell, outlet, 'V.createElement(PlatformExecutiveAlly,{restricted:v.restrictedToAdmissions||y.restrictedToExecutive},' + outlet + ')');
let bundle = prior.slice(0, shellStart) + replaced + prior.slice(shellEnd);
bundle += '\nconst PlatformAllyMsal={useMsal:i},PlatformAllyRouter={useLocation:vn},PlatformAllyAuth={isE2EAuthBypassEnabled:_i};\n' + browserCode.code;
const newJs = `index-executive-ally-${hash(bundle).slice(0, 12)}.js`;
await write('dist/assets/' + newJs, bundle, true);
const css = browserOutput.filter(item => item.type === 'asset' && item.fileName.endsWith('.css')).map(item => item.source).join('\n');
if (css) await write('dist/executive-ally.css', css, true);
for (const file of ['dist/index.html', 'dist/admissions/index.html', 'dist/chat/index.html']) {
  let html = once(readImage(file), '/assets/' + oldJs, '/assets/' + newJs);
  if (css) html = once(html, '</head>', `<link rel="stylesheet" href="/executive-ally.css?v=${hash(css).slice(0, 12)}" /></head>`);
  await write(file, html, true);
}

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
let api = readImage('api/platform.js');
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
// Record every bundled source, including the contracts actually consumed.
for (const result of [browserCode, serverOutput[0]]) for (const id of Object.keys(result.modules)) {
  const file = id.split('?')[0];
  if (file !== entry && file.startsWith(root + '/') && !file.includes('/node_modules/')) await source(path.relative(root, file));
}
await source('vendor/alamo-agent-runtime-0.18.4.tgz');
await source('scripts/prepare-executive-ally-release.mjs');
await source('scripts/executive-ally-release-mode.mjs');
await writeFile(path.join(out, 'Dockerfile'), `FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(out, '.dockerignore'), '*\n!Dockerfile\n!overlay/\n!overlay/**\n');
await writeFile(path.join(out, 'receipt.json'), JSON.stringify({ base, rollback: base, sourceCommit: run('git', ['rev-parse', 'HEAD']).trim(),
  oldJs, newJs, sourceHashes: sources, files, reportsEnabled: enabled, previewOnly: preview, ownerPilot: pilot, display, sourceConfigured: false,
  scope: preview ? 'Local fictional display preview only. Unroutable service, fictional participant, source endpoint disabled; never deploy this preview.'
    : pilot ? 'Owner-only production service display configuration. Source endpoint remains disabled without deployment configuration. API membership, source grants, required release checks and signed-in acceptance remain separate.'
      : 'Disabled report UI and source endpoint. Live source readers, old monitoring runtime, all other routes, identity, configuration and data remain unchanged.' }, null, 2));
console.log(JSON.stringify({ out, files: Object.keys(files).length, newJs, enabled, previewOnly: preview, ownerPilot: pilot }));

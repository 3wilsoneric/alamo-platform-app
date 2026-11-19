// Preserve the verified production shell and unrelated report/agent releases.
// This adapter is pinned to the current bundle; a changed boundary stops preparation.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { brotliCompressSync, gzipSync } from 'node:zlib';
const base = process.env.PLATFORM_CARDS_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? '')) throw Error('Pin the current Platform image.');
const live = execFileSync('az',['containerapp','show','-n','alamo-platform-prod-web','-g','alamo-data-rg','--query','properties.template.containers[0].image','-o','tsv'],{encoding:'utf8'}).trim();
if (live !== base) throw Error('Production changed; reconcile before preparing release.');
const out = path.resolve('generated/platform-mobile-review/release');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readImage = name => execFileSync('docker',['run','--rm','--platform','linux/amd64','--entrypoint','cat',base,`/app/${name}`],{maxBuffer:32*1024*1024});
const replace = (text,before,after) => { if(text.split(before).length!==2) throw Error(`Release boundary changed: ${before.slice(0,80)}`); return text.replace(before,after); };
async function write(name,bytes) { const target=path.join(out,'overlay',name); await mkdir(path.dirname(target),{recursive:true}); await Promise.all([writeFile(target,bytes),writeFile(`${target}.gz`,gzipSync(bytes)),writeFile(`${target}.br`,brotliCompressSync(bytes))]); }
const index=readImage('dist/index.html').toString();
const oldJs=index.match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
if (!oldJs) throw Error('Browser entry missing.');
const prior=readImage(`dist/assets/${oldJs}`).toString();
const publicBytes=execFileSync('curl',['-fsSL',`https://www.alamoplatform.com/assets/${oldJs}`],{maxBuffer:32*1024*1024});
if(hash(prior)!==hash(publicBytes)) throw Error('Live bytes differ from pinned image.');
const sources = await Promise.all([
  'src/features/incidents/components/ResidentIncidentHistoryDrawer.tsx',
  'src/features/incidents/pages/IncidentCenterPage.tsx'
].map(name=>readFile(name,'utf8')));
function compile(source) {
  const tree=ts.createSourceFile('component.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const clean=tree.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(tree)).join('\n').replace(/export default function /g,'function ').replace(/export function /g,'function ');
  const compiled=ts.transpileModule(clean,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'V.createElement',jsxFragmentFactory:'V.Fragment',module:ts.ModuleKind.None},reportDiagnostics:true});
  if(compiled.diagnostics?.length||compiled.outputText.includes('React.')) throw Error('Component compilation failed.');
  return compiled.outputText;
}
const start=prior.indexOf('var ql={HIGH:');
const end=prior.indexOf('async function tu(',start);
if(start<0||end<0||prior.indexOf('var ql={HIGH:',start+1)!==-1) throw Error('Incident component boundary changed.');
// Bind the existing runtime owners; do not duplicate fetching, account state,
// facility metadata, date semantics, resident matching, or label formatting.
const bindings=`const {useEffect,useRef,useState}=V;
const Link=Wr,useSearchParams=Qr,ALAMO_FACILITIES=ps,displayIncidentLabel=Rs;
const AlertTriangle=oe,ArrowDown=ne,ChevronDown=ge,ChevronRight=we,Minus=g,RefreshCw=se,X=Ne;
const PLATFORM_DATA_REFRESH_EVENT=Da,fetchCommunitiesDashboard=io,fetchIncidentFeed=po,useIsPhoneLayout=Nl;
const displayDetailValue=Pl,enrichIncidentsWithResidents=Ul,timeAgo=Il,formatDateKey=Bl,getIncidentReceivedDateKey=Rl,getTodayDateKey=zl,matchesSearch=Fl,partitionIncidentsByReviewStage=Wl,formatIncidentDateTime=Ll,incidentsShareResident=Hl;`;
// Verify the refresh icon binding from the old page instead of assuming it.
const refreshIcon=prior.slice(start,end).match(/children:\[\(0,H.jsx\)\((\w+),\{size:11\}\),`Refresh`\]/)?.[1];
if(!refreshIcon) throw Error('Refresh icon binding changed.');
const replacement=`const PlatformIncidentCards=(()=>{${bindings.replace('RefreshCw=se',`RefreshCw=${refreshIcon}`)}\n${sources.map(compile).join('\n')}\nreturn IncidentCenterPage;})();function eu(props){return V.createElement(PlatformIncidentCards,props);}`;
let bundle=prior.slice(0,start)+replacement+prior.slice(end);
bundle=replace(bundle,'{id:`incidents`,label:`Incidents`,path:`/analytics/incidents`}','{id:`incidents`,label:`Incidents`,path:`/incidents`}');
bundle=replace(bundle,'licAccount=licensingAccountOid(),l=e?', 'licAccount=licensingAccountOid(),platformOwner=ws(),l=e?');
bundle=replace(bundle,'"data-platform-header":`true`,className:', '"data-platform-header":`true`,"data-platform-owner":platformOwner&&!e?`true`:`false`,className:');
bundle=replace(bundle,'r=t===`/analytics/community`||t===`/analytics`?', 'r=t.startsWith(`/incidents`)?`incidents`:t===`/analytics/community`||t===`/analytics`?');
const newJs=`index-incident-cards-${hash(bundle).slice(0,12)}.js`;
const css=await readFile('src/features/incidents/incidentCenter.css');
const launcher=await readFile('public/point-of-care-launcher.js');
await rm(path.join(out,'overlay'),{recursive:true,force:true});
await write(`dist/assets/${newJs}`,bundle);
await write('dist/incident-cards.css',css);
await write('dist/point-of-care-launcher.js',launcher);
for(const name of ['dist/index.html','dist/admissions/index.html','dist/chat/index.html']) {
  let html=readImage(name).toString();
  const entryJs=html.match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
  if(entryJs!==oldJs && !(name==='dist/chat/index.html' && entryJs==='index-proforma-carelog-95605ad91fdc.js')) throw Error(`Unexpected entry bundle: ${name}`);
  // Chat still points at the preceding release; update it to the same current
  // shell so its owner marker and menu cannot diverge from the other entries.
  html=replace(html,`/assets/${entryJs}`,`/assets/${newJs}`);
  html=replace(html,'</head>',`<link rel="stylesheet" href="/incident-cards.css?v=${hash(css).slice(0,12)}" /></head>`);
  const launcherPath=html.match(/\/point-of-care-launcher\.js(?:\?[^" ]*)?/)?.[0];
  if(!launcherPath) throw Error(`Launcher missing: ${name}`);
  html=replace(html,launcherPath,`/point-of-care-launcher.js?v=${hash(launcher).slice(0,12)}`);
  await write(name,html);
}
await writeFile(path.join(out,'Dockerfile'),`FROM ${base}\nCOPY --chown=node:node overlay/dist /app/dist\n`);
await writeFile(path.join(out,'receipt.json'),JSON.stringify({base,oldJs,newJs,bundleHash:hash(bundle),sourceHashes:sources.map(hash),cssHash:hash(css),launcherHash:hash(launcher),scope:'Incident cards and owner-only navigation; no server or data changes.'},null,2));
console.log(JSON.stringify({out,newJs}));

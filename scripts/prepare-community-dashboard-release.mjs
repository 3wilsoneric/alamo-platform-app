// Pinned UI overlay: retain the current production shell, auth and unrelated releases.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';
import { brotliCompressSync, gzipSync } from 'node:zlib';
const base = process.env.COMMUNITY_DASHBOARD_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? '')) throw Error('Pin the current Platform image.');
const live = execFileSync('az', ['containerapp','show','-n','alamo-platform-prod-web','-g','alamo-data-rg','--query','properties.template.containers[0].image','-o','tsv'], {encoding:'utf8'}).trim();
if (live !== base) throw Error('Production changed; reconcile before preparation.');
const out = path.resolve('generated/community-dashboard-20261119/release');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readImage = name => execFileSync('docker', ['run','--rm','--platform','linux/amd64','--entrypoint','cat',base,`/app/${name}`], {maxBuffer:32*1024*1024});
const once = (text, before, after) => { if (text.split(before).length !== 2) throw Error(`Release boundary changed: ${before.slice(0,80)}`); return text.replace(before,after); };
async function write(name, bytes, compress = true) {
  const target = path.join(out,'overlay',name); await mkdir(path.dirname(target), {recursive:true}); await writeFile(target,bytes);
  if (compress) await Promise.all([writeFile(`${target}.gz`,gzipSync(bytes)),writeFile(`${target}.br`,brotliCompressSync(bytes))]);
}
function compile(source) {
  const tree=ts.createSourceFile('component.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const clean=tree.statements.filter(node=>!ts.isImportDeclaration(node)).map(node=>node.getText(tree)).join('\n').replace(/export default function /g,'function ').replace(/export function /g,'function ');
  const result=ts.transpileModule(clean,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,jsxFactory:'V.createElement',jsxFragmentFactory:'V.Fragment',module:ts.ModuleKind.None},reportDiagnostics:true});
  if (result.diagnostics?.length || result.outputText.includes('React.')) throw Error('Compilation failed.');
  return result.outputText;
}
const index=readImage('dist/index.html').toString();
const oldJs=index.match(/\/assets\/(index-[\w-]+\.js)/)?.[1];
if (!oldJs) throw Error('Browser entry missing.');
const prior=readImage(`dist/assets/${oldJs}`).toString();
const publicBytes=execFileSync('curl',['-fsSL',`https://www.alamoplatform.com/assets/${oldJs}`],{maxBuffer:32*1024*1024});
if(hash(prior)!==hash(publicBytes)) throw Error('Live browser bytes differ from pinned image.');
const source=await readFile('src/features/reports/components/CommunityReportDashboard.tsx','utf8');
const reader=await readFile('src/features/reports/components/FullReportReader.tsx','utf8');
const chartStart=reader.indexOf('function LineChart('), chartEnd=reader.indexOf('\nfunction ReportBlock(',chartStart);
if(chartStart<0||chartEnd<0) throw Error('Source chart boundary missing.');
const widthHook=await readFile('src/shared/charts/useChartWidth.ts','utf8');
const start=prior.indexOf(',(0,H.jsx)(`div`,{className:`mt-3`,children:(0,H.jsx)(Kh,{items:e.metrics})})');
const end=prior.indexOf(',(0,H.jsxs)(`details`,{"data-report-evidence":',start);
if(start<0||end<0||!prior.slice(start,end).includes('Jh,{block:t}')) throw Error('Community reader boundary changed.');
const original=prior.slice(start+1,end);
const replacement=',e.reportId===`community`?V.createElement(PlatformCommunityDashboard,{report:e}):V.createElement(V.Fragment,null,'+original+')';
const component=`\nconst PlatformCommunityDashboard=(()=>{const {useState,useEffect}=V;\n${compile(widthHook)}\n${compile(reader.slice(chartStart,chartEnd))}\n${compile(source)}\nreturn props=>V.createElement(CommunityReportDashboard,{...props,renderBlock:block=>block.type==='line_chart'?V.createElement(LineChart,{...block,height:220}):V.createElement(Jh,{block})});})();\n`;
const heading=await readFile('src/features/reports/components/ReportHeading.tsx','utf8');
// Keep the canonical heading in this candidate; the production shell calls its
// earlier compiled version, so redirect only that verified call site.
let bundle=prior.slice(0,start)+replacement+prior.slice(end)+component;
bundle=once(bundle,'V.createElement(PlatformReportHeading,{report:e})','V.createElement(CommunityReleaseHeading,{report:e})');
bundle+='\nconst CommunityReleaseHeading=(()=>{'+compile(heading)+';return ReportHeading;})();';
const newJs=`index-community-dashboard-${hash(bundle).slice(0,12)}.js`;
await write(`dist/assets/${newJs}`,bundle);
const css=await readFile('src/features/reports/components/community-report-dashboard.css');
await write('dist/community-report-dashboard.css',css);
for (const name of ['dist/index.html','dist/admissions/index.html','dist/chat/index.html']) {
  let html=once(readImage(name).toString(),`/assets/${oldJs}`,`/assets/${newJs}`);
  html=once(html,'</head>',`<link rel="stylesheet" href="/community-report-dashboard.css?v=${hash(css).slice(0,12)}" /></head>`);
  await write(name,html);
}
// Apply only the already-reviewed section-caption patch, retaining live terminology.
const apiBefore=readImage('server/full-reporting.mjs').toString();
const copyBase=await readFile('generated/community-section-copy-20261119/production-full-reporting.mjs','utf8');
if(apiBefore!==copyBase) throw Error('Report source changed since copy validation.');
const apiAfter=await readFile('generated/community-section-copy-20261119/release/overlay/server/full-reporting.mjs');
await write('server/full-reporting.mjs',apiAfter,false);
await writeFile(path.join(out,'Dockerfile'),`FROM ${base}\nCOPY --chown=node:node overlay/dist /app/dist\nCOPY --chown=node:node overlay/server/full-reporting.mjs /app/server/full-reporting.mjs\n`);
await writeFile(path.join(out,'receipt.json'),JSON.stringify({base,oldJs,newJs,sourceHash:hash(source),bundleHash:hash(bundle),unchangedPrefix:hash(prior.slice(0,start)),unchangedSuffix:hash(prior.slice(end)),originalReaderBody:hash(original),cssHash:hash(css),reportHash:hash(apiAfter)},null,2));
console.log(JSON.stringify({out,oldJs,newJs}));

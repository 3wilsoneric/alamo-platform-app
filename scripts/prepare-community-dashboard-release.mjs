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
const replacement=',e.reportId===`community`?V.createElement(PlatformCommunityDashboard,{report:e}):e.reportId===`overview`?V.createElement(PlatformOverviewDashboard,{report:e,renderBlock:block=>V.createElement(Jh,{block})}):V.createElement(V.Fragment,null,'+original+')';
const component=`\nconst PlatformCommunityDashboard=(()=>{const {useState,useEffect}=V;\n${compile(widthHook)}\n${compile(reader.slice(chartStart,chartEnd))}\n${compile(source)}\nreturn props=>V.createElement(CommunityReportDashboard,{...props,renderBlock:block=>block.type==='line_chart'?V.createElement(LineChart,{...block,height:220}):V.createElement(Jh,{block})});})();\n`;
const heading=await readFile('src/features/reports/components/ReportHeading.tsx','utf8');
// Keep the canonical heading in this candidate; the production shell calls its
// earlier compiled version, so redirect only that verified call site.
let bundle=prior.slice(0,start)+replacement+prior.slice(end)+component;
bundle=once(bundle,'V.createElement(PlatformReportHeading,{report:e})','V.createElement(CommunityReleaseHeading,{report:e})');
bundle+='\nconst CommunityReleaseHeading=(()=>{'+compile(heading)+';return ReportHeading;})();';
// Keep live routing, access, and request lifecycles; only replace these checked presentation boundaries.
const overview=await readFile('src/features/reports/components/OverviewReportDashboard.tsx','utf8');
bundle+='\nconst PlatformOverviewDashboard=(()=>{'+compile(overview)+';return OverviewReportDashboard;})();';
bundle=once(bundle,'function Yh({report:e})','function Yh({report:e,hideHeading:hideHeading=false,onCommunityChange:onCommunityChange,flowYear,onFlowYearChange})');
bundle=once(bundle,'V.createElement(CommunityReleaseHeading,{report:e})','!hideHeading&&V.createElement(CommunityReleaseHeading,{report:e})');
bundle=once(bundle,'"aria-busy":S||w,children:[','"aria-busy":S||w,children:[v?V.createElement(CommunityReleaseHeading,{report:v.report}):V.createElement(`header`,{className:`report-heading`},V.createElement(`h1`,{id:`full-report-title`},n.pathname===`/analytics/residents`?`Clients`:n.pathname===`/analytics/community`?(ps.find(e=>e.facilityId===u)?.shortName??`Community`):`Overview`)),');
bundle=once(bundle,'function rg({embedded:e=!1,active:t=!0}){','function rg({embedded:e=!1,active:t=!0}){const [flowYear,setFlowYear]=V.useState(``);const communityFilterRef=V.useRef(null);');
bundle=once(bundle,'"aria-label":`Report community`,value:u','ref:communityFilterRef,"aria-label":`Report community`,value:u');
bundle=once(bundle,'(Yh,{report:v.report})','(Yh,{report:v.report,hideHeading:true,flowYear,onFlowYearChange:setFlowYear,onCommunityChange:t=>{d(t),p(``),x([]);communityFilterRef.current?.focus();r(`${n.pathname}${t?`?community=${encodeURIComponent(t)}`:``}`)}})');
let residentFlow=await readFile('src/features/admissions/components/ResidentFlowReport.tsx','utf8');
const fetchStart=residentFlow.indexOf('const result = await fetchWithApiAuth(');
const fetchEnd=residentFlow.indexOf('\n        if (!controller.signal.aborted)',fetchStart);
if(fetchStart<0||fetchEnd<0) throw Error('Authenticated flow fetch boundary changed.');
residentFlow=residentFlow.slice(0,fetchStart)+'const result = await to(url, controller.signal);'+residentFlow.slice(fetchEnd);
const flowStart=bundle.indexOf('/* CLIENT_FLOW_START */'), flowEnd=bundle.indexOf('/* CLIENT_FLOW_END */',flowStart);
if(flowStart<0||flowEnd<0) throw Error('Client flow boundary changed.');
bundle=bundle.slice(0,flowStart)+'/* CLIENT_FLOW_START */\nconst ResidentFlowReport=(()=>{const {useState,useEffect,useRef}=V;'+compile(residentFlow)+';return ResidentFlowReport;})();\n'+bundle.slice(flowEnd);
bundle=once(bundle,'(ResidentFlowReport,{facilityId:e.scope.kind===`community`?e.scope.facilityId??null:null})','(ResidentFlowReport,{onCommunityChange,selectedYear:flowYear,onYearChange:onFlowYearChange,facilityId:e.scope.kind===`community`?e.scope.facilityId??null:null})');
bundle=once(bundle,'to:`/incidents`,className:`inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[#82503d] hover:underline`','to:n===`all`?`/incidents`:`/incidents?community=${n}`,className:`inline-flex min-h-11 items-center gap-2 text-[14px] font-semibold text-[#82503d] hover:underline`');
bundle=once(bundle,'`Recent triage`]}),(0,H.jsx)(Du,','`Incidents`]}),V.createElement(`h1`,null,`Incident history`),(0,H.jsx)(Du,');
bundle=once(bundle,'className:`mx-auto max-w-[1432px] pb-10 text-[#16283a]`,children:','"data-incident-history-page":`true`,className:`mx-auto max-w-[1432px] pb-10 text-[#16283a]`,children:');
bundle=once(bundle,'(0,H.jsx)(`h1`,{className:`sr-only`,children:`Licensing reports`})','(0,H.jsx)(`h1`,{children:`Licensing`})');
bundle=once(bundle,'children:[`Licensing · `,l]','children:[l]');
bundle=once(bundle,'. Open a report for its findings, correction plans, and source text.','.');
bundle=once(bundle,'Counts are from these reports. Historical plans do not establish current completion.','Historical correction plans do not confirm completion.');
bundle=once(bundle,'max-w-[1500px] px-4 pb-12 pt-5 sm:px-6 lg:px-8`,children:[(0,H.jsx)(`h1`,{className:`sr-only`,children:`Admissions`})','max-w-[1500px] px-4 pb-12 pt-5 sm:px-6 lg:px-8`,children:[(0,H.jsx)(`h1`,{className:`platform-page-title`,children:`Admissions`})');
bundle=once(bundle,'(0,H.jsx)(`h1`,{id:a,children:`Incident history`})','(0,H.jsx)(`h2`,{id:a,children:`All incidents`})');
const titleMotion=await readFile('src/features/california/components/PageTitleMotion.tsx','utf8');
bundle+='\nconst PlatformPageTitleMotion=(()=>{const {useEffect}=V;'+compile(titleMotion)+';return PageTitleMotion;})();';
bundle=once(bundle,'print:hidden`,children:[(0,H.jsxs)(`nav`,{"aria-label":`Platform pages`','print:hidden`,children:[V.createElement(PlatformPageTitleMotion),(0,H.jsxs)(`nav`,{"aria-label":`Platform pages`');
const newJs=`index-community-dashboard-${hash(bundle).slice(0,12)}.js`;
await write(`dist/assets/${newJs}`,bundle);
const css=Buffer.concat([await readFile('src/features/reports/components/community-report-dashboard.css'),Buffer.from('\n'),await readFile('src/features/reports/components/platform-design-pass.css'),Buffer.from('\n'),await readFile('src/features/california/components/page-title-motion.css')]);
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

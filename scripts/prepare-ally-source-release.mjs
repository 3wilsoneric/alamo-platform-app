// Update the analytical boundary on the current host without rebuilding its UI
// or replacing another application's newer runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { build } from 'vite';
import { analystOverlay, analystPaths, analystSourcePath } from './prepare-proforma-analyst-overlay.mjs';

const base=process.env.PLATFORM_UI_BASE_IMAGE;
assert.match(base??'',/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/,'Choose the reviewed immutable live Platform image.');
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',maxBuffer:32*1024*1024});
const current=()=>run('az',['containerapp','show','-n','alamo-platform-prod-web','-g','alamo-data-rg','--query','properties.template.containers[0].image','-o','tsv']).trim();
assert.equal(current(),base,'Production changed; reconcile its current source before preparation.');
const root=process.cwd(),out=path.resolve('generated/ally-source-release');
const fromImage=file=>run('docker',['run','--rm','--platform','linux/amd64','--network','none','--entrypoint','cat',base,'/app/'+file]);
const hash=value=>createHash('sha256').update(value).digest('hex');
const sourceHashes={},files={};
const source=async file=>{const bytes=await readFile(file);sourceHashes[file]=hash(bytes);return bytes.toString();};
async function write(file,text){const target=path.join(out,'overlay',file);await mkdir(path.dirname(target),{recursive:true});await writeFile(target,text);files[file]=hash(text);}
// The API must already route to the installed analytical boundary. This updater
// is not an alternative first-install or identity-configuration path.
const api=fromImage('api/platform.js');
assert(api.includes('ally-report-source-release.mjs')&&api.includes('/api/platform/ally-source/v1'),'The installed Ally source route must be reviewed.');
await rm(path.join(out,'overlay'),{recursive:true,force:true});
const serverRoot=path.join(root,'server');
const readers=['platform-snapshot','platform-data','pipeline-admissions-summary','admissions-dashboard','licensing-library','workflow-knowledge-source','databricks',
  'workflow/service','workflow/azure-persistence','workflow/catalog'];
const external=new Set(readers.map(name=>path.join(serverRoot,name+'.mjs')));
const bundle=await build({configFile:false,envDir:false,publicDir:false,ssr:{noExternal:['@alamo/agent-runtime']},build:{write:false,minify:false,ssr:'server/ally-report-source-api.mjs',rollupOptions:{
  external(id,importer){return external.has(id)||Boolean(importer&&id.startsWith('.')&&external.has(path.resolve(path.dirname(importer),id)));},
  output:{codeSplitting:false,paths:id=>external.has(id)?'./'+path.relative(serverRoot,id):id}
}}});
const outputs=(Array.isArray(bundle)?bundle:[bundle]).flatMap(result=>result.output);
assert.equal(outputs.length,1);const chunk=outputs[0];assert.equal(chunk.type,'chunk');
for(const file of external)assert(!Object.hasOwn(chunk.modules,file),`Do not bundle the older source owner: ${file}`);
for(const id of Object.keys(chunk.modules)){
  const file=id.split('?')[0];if(file.startsWith(root+'/')&&!file.includes('/node_modules/'))await source(path.relative(root,file));
}
await write('server/ally-report-source-release.mjs',chunk.code);
for(const file of ['server/platform-snapshot.mjs','server/platform-tool-tables.mjs'])await write(file,await source(file));
const originals={};
for(const file of [analystPaths.process,analystPaths.service])originals[file]=fromImage(file);
const existing=JSON.parse(run('docker',['run','--rm','--platform','linux/amd64','--network','none','--entrypoint','node',base,'--input-type=module','-e',
  `import {existsSync,readFileSync} from 'node:fs';const file='/app/${analystPaths.reader}';console.log(JSON.stringify(existsSync(file)?readFileSync(file,'utf8'):null));`]));
if(existing!==null)originals[analystPaths.reader]=existing;
for(const [file,text]of Object.entries(analystOverlay(originals,await source(analystSourcePath))))await write(file,text);
for(const file of ['scripts/prepare-ally-source-release.mjs','scripts/prepare-proforma-analyst-overlay.mjs','package.json','package-lock.json',
  JSON.parse(await readFile('package.json','utf8')).dependencies['@alamo/agent-runtime'].replace(/^file:/,'')])await source(file);
assert.equal(current(),base,'Production changed during preparation.');
await writeFile(path.join(out,'Dockerfile'),`FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(out,'.dockerignore'),'*\n!Dockerfile\n!overlay/\n!overlay/**\n');
await writeFile(path.join(out,'receipt.json'),JSON.stringify({base,rollback:base,sourceCommit:run('git',['rev-parse','HEAD']).trim(),files,sourceHashes,
  proformaBaseHashes:Object.fromEntries(Object.entries(originals).map(([file,text])=>[file,hash(text)])),
  scope:'Analytical source reader and source-owned ProForma read projection only. UI, runtime settings, source grants and app records unchanged. Reader must precede sharded snapshot publication.'},null,2));
console.log(JSON.stringify({out,files:Object.keys(files).length,base}));

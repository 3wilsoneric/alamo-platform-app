import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,readFile,writeFile,cp,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {build} from 'vite';
import {executiveAllyReleaseMode} from './executive-ally-release-mode.mjs';

const base=process.env.PLATFORM_UI_BASE_IMAGE;
assert.match(base??'',/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/);
const root=process.cwd(),out=path.resolve('generated/proforma-ally-release');
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',maxBuffer:32e6,timeout:120000});
const current=()=>run('az',['containerapp','show','-g','alamo-data-rg','-n','alamo-platform-prod-web','--query','properties.template.containers[0].image','-o','tsv','--only-show-errors']).trim();
assert.equal(current(),base,'Live image changed; reconcile first.');
const {display}=executiveAllyReleaseMode(['--owner-pilot']);
const browser=await build({define:{'import.meta.env.VITE_ALLY_REPORTS_ENABLED':JSON.stringify(display.enabled),'import.meta.env.VITE_ALLY_REPORT_PARTICIPANTS':JSON.stringify(display.participants),'import.meta.env.VITE_ALAMOAGENT_API_ORIGIN':JSON.stringify(display.origin),'import.meta.env.VITE_ALAMOAGENT_SCOPE':JSON.stringify(display.scope),'import.meta.env.VITE_E2E_AUTH_BYPASS':JSON.stringify('false'),'import.meta.env.VITE_API_AUTH_REQUIRED':JSON.stringify('true')}});
const chunks=(Array.isArray(browser)?browser:[browser]).flatMap(v=>v.output).filter(v=>v.type==='chunk');
for(const file of ['src/app/auth/authConfig.ts','src/shared/layout/ProtectedAppShell.tsx','src/features/workflow/pages/WorkflowPage.tsx'])assert.equal(chunks.filter(c=>Object.hasOwn(c.modules,path.join(root,file))).length,1);
run(process.execPath,['scripts/stage-spa-route-indexes.mjs']);run(process.execPath,['scripts/compress-browser-dist.mjs']);run(process.execPath,['scripts/prepare-platform-ui-release.mjs']);
await mkdir(out,{recursive:true});await cp('generated/platform-ui-release/overlay',path.join(out,'overlay'),{recursive:true});
const source=path.join(out,'live-source');await mkdir(path.join(source,'server/workflow'),{recursive:true});
const readImage=file=>run('docker',['run','--rm','--platform','linux/amd64','--network','none','--entrypoint','cat',base,'/app/'+file]);
for(const file of ['server/workflow/process-service.mjs','server/workflow/service.mjs','server/workflow-api.mjs'])await writeFile(path.join(source,file),readImage(file));
const sourceRoot=process.env.PROFORMA_SOURCE_ROOT;assert(sourceRoot,'Provide the canonical ProForma source checkout.');
run(process.execPath,[path.join(sourceRoot,'scripts/prepare-guidance-platform.mjs'),source,path.join(out,'guidance')]);
await cp(path.join(out,'guidance/server'),path.join(out,'overlay/server'),{recursive:true});
const host=readImage('server/app-server.mjs'),connect='"connect-src \'self\' https://login.microsoftonline.com"';
if(!host.includes(display.origin)){
 assert.equal(host.split(connect).length,2,'CSP boundary changed.');
 await writeFile(path.join(out,'overlay/server/app-server.mjs'),host.replace(connect,JSON.stringify("connect-src 'self' https://login.microsoftonline.com "+display.origin)));
}
const hash=v=>createHash('sha256').update(v).digest('hex'),files={},sources={};
async function walk(dir){for(const e of await readdir(dir,{withFileTypes:true})){const f=path.join(dir,e.name);if(e.isDirectory())await walk(f);else files[path.relative(path.join(out,'overlay'),f)]=hash(await readFile(f));}}
await walk(path.join(out,'overlay'));
for(const chunk of chunks)for(const id of Object.keys(chunk.modules)){const f=id.split('?')[0];if(f.startsWith(root+'/')&&!f.includes('/node_modules/'))sources[path.relative(root,f)]=hash(await readFile(f));}
const guide=JSON.parse(await readFile(path.join(out,'guidance/manifest.json')));
assert.equal(current(),base,'Live image changed during preparation.');
await writeFile(path.join(out,'Dockerfile'),`FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(out,'.dockerignore'),'*\n!Dockerfile\n!overlay/\n!overlay/**\n');
await writeFile(path.join(out,'receipt.json'),JSON.stringify({base,rollback:base,at:new Date().toISOString(),sourceCommit:run('git',['rev-parse','HEAD']).trim(),files,sources,guidance:guide.files,ownerOnly:true,scope:'Restore current ProForma UI and add delegated published-guidance discovery. Preserve existing server, Carelog and executive services.'},null,2));
console.log(`Prepared ${Object.keys(files).length} files at ${out}`);

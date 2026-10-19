import { execFileSync } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const base = process.env.WORKFLOW_AGENT_BASE_IMAGE;
if (!/^pipelineprodacra6qdvl6ebenac\.azurecr\.io\/alamo-platform@sha256:[a-f0-9]{64}$/.test(base ?? '')) throw new Error('Set the exact current Azure production image.');
const root=process.cwd(), target=path.join(root,'generated/workflow-agent-release/context'), overlay=path.join(target,'overlay');
await mkdir(path.join(overlay,'api'),{recursive:true});
const container=execFileSync('docker',['create','--platform','linux/amd64',base],{encoding:'utf8'}).trim();
try{execFileSync('docker',['cp',`${container}:/app/api/platform.js`,path.join(overlay,'api/platform.js')]);}finally{execFileSync('docker',['rm',container]);}
const file=path.join(overlay,'api/platform.js');let api=await readFile(file,'utf8');
const marker='  const requestPath = String(req.url ?? "").split("?", 1)[0] ?? "";';
if(api.includes('handleWorkflowKnowledgeRequest')||api.split(marker).length!==2)throw new Error('Inspect the current production API before updating it.');
api='import { handleWorkflowKnowledgeRequest } from "../server/workflow-knowledge-api.mjs";\n'+api.replace(marker,marker+'\n  if (requestPath === "/api/platform/workflow-knowledge") { await handleWorkflowKnowledgeRequest(req, res); return; }');
await writeFile(file,api);
for(const name of ['server/workflow-knowledge-api.mjs','server/workflow-knowledge-source.mjs','src/features/workflow/legacy/content/library/documents.v1.json']){
 await mkdir(path.dirname(path.join(overlay,name)),{recursive:true});await cp(path.join(root,name),path.join(overlay,name));
}
await cp(path.join(root,'node_modules/@alamo/agent-workflow-knowledge'),path.join(overlay,'node_modules/@alamo/agent-workflow-knowledge'),{recursive:true});
await cp(path.join(root,'dist'),path.join(overlay,'dist'),{recursive:true});
await writeFile(path.join(target,'Dockerfile'),`FROM ${base}\nCOPY --chown=node:node overlay /app\n`);
await writeFile(path.join(target,'release.json'),JSON.stringify({base,source:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),createdAt:new Date().toISOString(),package:JSON.parse(await readFile(path.join(overlay,'node_modules/@alamo/agent-workflow-knowledge/package.json'),'utf8'))},null,2));
console.log(target);

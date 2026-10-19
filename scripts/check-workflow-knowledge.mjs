import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { generateKeyPair, SignJWT, jwtVerify } from 'jose';
import { createWorkflowKnowledgeClient } from '@alamo/agent-workflow-knowledge';
import { createWorkflowKnowledgeHandler } from '../server/workflow-knowledge-api.mjs';
import { createWorkflowKnowledgeSource } from '../server/workflow-knowledge-source.mjs';
import { EVERYAGENT_TENANT, EVERYAGENT_USERS } from '../shared/everyagent-identity.mjs';
import { assertApiClaimsPermission } from '../server/api-auth.mjs';

const source = createWorkflowKnowledgeSource();
const query = {version:1,operation:'search',query:'what does an assessor do'};
const result = await source.read(query);
assert.equal(result.documents[0].id,'role:assessor');
assert(result.documents.every(doc=>doc.reviewStatus==='draft'||doc.reviewStatus==='review'));
const evaluations=[['assessor handoff','handoff'],['clinical reviewer','review'],['procedure training owner','training'],['assessment source evidence','assessment']];
for(const [question,expected] of evaluations){const answer=await source.read({...query,query:question});assert(answer.documents.some(d=>d.title.toLowerCase().includes(expected)),question);}
assert.equal((await source.read({...query,query:'xyzunfindablequantumrocket'})).documents.length,0);
const hit=result.documents[0];
const read={version:1,operation:'read',documentId:hit.id,expectedRevision:hit.revision};
const full=await source.read(read);assert(full.documents[0].body.includes(hit.excerpts[0].text));
await assert.rejects(source.read({...read,expectedRevision:'0'.repeat(64)}),error=>error.statusCode===409);
const raw=await readFile(new URL('../src/features/workflow/legacy/content/library/documents.v1.json',import.meta.url),'utf8');
const corrupted=JSON.parse(raw);corrupted.records[0].body+=' Unreviewed alteration.';
await assert.rejects(createWorkflowKnowledgeSource({load:async()=>JSON.stringify(corrupted)}).read(query));
const {publicKey,privateKey}=await generateKeyPair('RS256');
const tokenFor=(claims,expiration='5m')=>new SignJWT({tid:EVERYAGENT_TENANT,oid:EVERYAGENT_USERS[0],scp:'access_as_user',...claims}).setProtectedHeader({alg:'RS256'}).setAudience('workflow-test').setExpirationTime(expiration).sign(privateKey);
let denyAfterRead=false, reads=0;
const handler=createWorkflowKnowledgeHandler({source:{read:async input=>{reads++;const value=await source.read(input);if(denyAfterRead)revoked=true;return value;}},authorize:async req=>{
 try{const {payload}=await jwtVerify(String(req.headers.authorization??'').replace(/^Bearer /,''),publicKey,{audience:'workflow-test',algorithms:['RS256']});assertApiClaimsPermission(payload,{requiredScope:'access_as_user',requiredRole:null,permissionMode:'scope-and-role'});return {authenticated:true,claims:revoked?{...payload,oid:'revoked'}:payload};}
 catch{throw Object.assign(new Error('Unauthorized'),{statusCode:401});}
}});
let revoked=false;
const server=createServer((req,res)=>handler(req,Object.assign(res,{status(code){res.statusCode=code;return this},json(value){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));return this}})));
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
const request=(token,input=query)=>fetch(base+'/api/platform/workflow-knowledge',{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(input)});
try{
 for(const token of [null,await tokenFor({oid:'other-user'}),await tokenFor({tid:'other-tenant'}),await tokenFor({scp:'unrelated'}),await tokenFor({},Math.floor(Date.now()/1000)-10)]){
  const before=reads;const response=await request(token);assert([401,403].includes(response.status));assert.equal(reads,before,'Denied users must not read content');assert.equal(response.headers.get('cache-control'),'private, no-store, max-age=0, must-revalidate');
 }
 const token=await tokenFor({});
 for(const extra of [{subjectId:'other-user'},{url:'https://untrusted.test'},{operation:'write'}])assert.equal((await request(token,{...query,...extra})).status,400);
 const client=createWorkflowKnowledgeClient({origin:'https://workflow.example.test',getToken:async()=>({token,expiresOnTimestamp:Date.now()+60000}),fetchImpl:(url,init)=>fetch(new URL(new URL(url).pathname,base),init)});
 assert.equal((await client.read(query)).documents[0].id,'role:assessor');assert.equal((await client.read(read)).documents[0].body,full.documents[0].body);
 assert.equal((await request(token,{...read,expectedRevision:'0'.repeat(64)})).status,409);
 denyAfterRead=true;const denied=await request(token);assert.equal(denied.status,403);assert(!(await denied.text()).includes('Assessor'));
 console.log('Workflow source passed: retrieval cases, exact source excerpts, versions, tamper rejection, signed HTTP owner access, foreign/expired/scope denial, client integration and revocation during read.');
}finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

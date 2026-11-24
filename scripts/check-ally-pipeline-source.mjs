import assert from 'node:assert/strict';
import { createPipelineAnalystSource } from '../server/ally-pipeline-source.mjs';
import { readNativeJsonResponse } from '../server/ally-native-record.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { authorizePlatformReportSource } from '../server/ally-report-source-grants.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';

const id='11111111-1111-1111-1111-111111111111',person='22222222-2222-2222-2222-222222222222';
const env={ALLY_PIPELINE_ORIGIN:'https://pipeline.example.test',PIPELINE_ALLY_SOURCE_SECRET:'fixture-only'};
let status=200, contentType='application/json', read=0;
const data={blocks:[{block_key:'unified',body:'Retained fictional narrative. '.repeat(700),version:4}]};
const source=createPipelineAnalystSource({env,fetchImpl:async(url,init)=>{
  const target=new URL(url), selection=JSON.parse(target.searchParams.get('input'));
  assert.equal(target.origin,env.ALLY_PIPELINE_ORIGIN);assert.equal(target.pathname,'/api/integrations/platform/ally');
  assert.equal(init.method,'GET');assert.equal(init.redirect,'error');assert.equal(init.headers.authorization,'Bearer fixture-only');
  assert.equal(init.headers['x-ally-subject'],person);assert.equal(init.headers['x-ally-tenant'],EVERYAGENT_TENANT);
  assert.equal(selection.pointer,undefined);assert.equal(selection.offset,undefined);
  return new Response(JSON.stringify({schemaVersion:1,owner:'pipeline',view:selection.view??'catalog',complete:true,
    readAt:new Date(Date.UTC(2026,10,24,0,0,read++)).toISOString(),data}),{status,headers:{'content-type':contentType}});
}});
const args={view:'notes',referralId:42,pointer:'/data/blocks/0/body'}, actor={subjectId:person};
let result=await source(args,actor), text=result.text;
while(result.nextOffset!==null){result=await source({...args,offset:result.nextOffset,revision:result.revision},actor);text+=result.text;}
assert.equal(text,data.blocks[0].body,'Long notes remain complete across transport timestamps.');
const previous=result.revision;data.blocks[0].version++;
await assert.rejects(()=>source({...args,offset:8000,revision:previous},actor),/changed/);
for(const patch of [{url:'https://evil.example'},{subjectId:id},{method:'PATCH'},{body:{edit:true}}]) await assert.rejects(()=>source({...args,...patch},actor));
status=403;await assert.rejects(()=>source(args,actor),/403/);status=200;
for (const [code,expected] of [[400,'report_source_query_invalid'],[422,'report_source_query_invalid'],[409,'report_source_revision_changed'],[401,'report_source_access_changed'],[403,'report_source_access_changed'],[404,'report_source_access_changed']]) {
  await assert.rejects(()=>readNativeJsonResponse(new Response('PRIVATE UPSTREAM BODY',{status:code}),'Pipeline'),
    error=>error.statusCode===code&&error.code===expected&&!error.message.includes('PRIVATE'));
}
contentType='text/html';await assert.rejects(()=>source(args,actor),/record/);contentType='application/json';
env.ALLY_PIPELINE_ORIGIN='http://pipeline.example.test';await assert.rejects(()=>source(args,actor),/connection/);env.ALLY_PIPELINE_ORIGIN='https://pipeline.example.test';

const grant={id:'pipeline-fixture',clientId:id,principalId:id,subjectId:person,communityIds:ALAMO_FACILITIES.map(f=>f.facilityId),capabilities:['pipeline-records'],slices:[],detail:true,expiresAt:new Date(Date.now()+60_000).toISOString(),revoked:false};
const input={subjectId:person,scope:{communityIds:[],from:'2026-01-01',through:'2026-11-24'},step:{id:'pipeline-read',capability:'pipeline-records',input:args}};
const authorize=()=>authorizePlatformReportSource({tenantId:EVERYAGENT_TENANT,clientId:id,principalId:id},input,{version:1,grants:[grant]});
const sources=createPlatformReportSources({pipelineRecords:source,summary:async()=>({})});
const catalog=await sources.catalog(authorize());assert.equal(catalog[0].id,'pipeline-records');
const evidence=await sources.read(input,authorize());assert.equal(evidence.requiresDetail,true);assert.equal(evidence.coverage,'partial');assert.equal(JSON.parse(evidence.answer).text.length,8000);
grant.detail=false;assert.throws(authorize);grant.detail=true;
grant.communityIds.pop();assert.throws(authorize);grant.communityIds=ALAMO_FACILITIES.map(f=>f.facilityId);
grant.revoked=true;assert.throws(authorize);
await assert.rejects(()=>readNativeJsonResponse(new Response('sensitive fixture text',{headers:{'content-type':'application/json'}}),'Pipeline'),error=>error.message==='Pipeline returned an invalid source record.');
let cancelled=false;
const oversized=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(4*1024*1024+1));},cancel(){cancelled=true;}});
await assert.rejects(()=>readNativeJsonResponse(new Response(oversized,{headers:{'content-type':'application/json'}}),'Pipeline'),/exceeds/);
assert.equal(cancelled,true,'Oversized streams must be cancelled, not read to completion.');
console.log('Pipeline: exact read-only source, represented identity, full-text continuation, source changes, transport bounds and current organizational grant passed.');

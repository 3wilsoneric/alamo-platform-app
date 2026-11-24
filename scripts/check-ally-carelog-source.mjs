import assert from 'node:assert/strict';
import { createCarelogAnalystSource } from '../server/ally-carelog-source.mjs';
import { projectNativeRecord as projectCarelogRecord } from '../server/ally-native-record.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { authorizePlatformReportSource } from '../server/ally-report-source-grants.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';

const id = '11111111-1111-1111-1111-111111111111';
const person = '22222222-2222-2222-2222-222222222222';
const operation = { path:'/api/clients/{clientId:guid}/history/page', parameters:[
  {name:'clientId',location:'path',type:'uuid',required:true}, {name:'page',location:'query',type:'integer',required:false},
  {name:'query',location:'query',type:'string',required:false},
] };
const record = {page:0,hasMore:true,items:Array.from({length:25},(_,i)=>({id:String(i),text:`Fictional note ${i}`,kind:'Note'}))};
let calls=[],status=200,contentType='application/json';
const env={ALLY_CARELOG_ORIGIN:'https://carelog.example.test',ALLY_CARELOG_AUDIENCE:`api://${id}`,AZURE_CLIENT_ID:id};
const source=createCarelogAnalystSource({env,credentialFor:()=>({getToken:async scope=>{
  assert.equal(scope,`api://${id}/.default`);return {token:'fixture-only',expiresOnTimestamp:Date.now()+60_000};
}}),fetchImpl:async(url,init)=>{
  calls.push(url);assert.equal(init.method,'GET');assert.equal(init.redirect,'error');
  assert.equal(init.headers['X-Ally-Subject'],person);assert.equal(init.headers.authorization,'Bearer fixture-only');
  return new Response(JSON.stringify(url.includes('/catalog?')?{schemaVersion:1,operations:[operation]}:record),{status,headers:{'content-type':contentType}});
}});
const actor={subjectId:person};
const args={view:'read',path:operation.path,parameters:{clientId:id,page:0,query:'notes & follow-up'},pointer:'/items',columns:['id','text']};
assert.equal((await source({view:'catalog',query:'history'},actor)).operations[0].path,operation.path);
const page=await source(args,actor);
assert.equal(page.items.length,20);assert.equal(page.totalResponseRows,25);assert.equal(page.nextOffset,20);assert.equal(page.incomplete,true);
assert.equal(new URL(calls.at(-1)).pathname,`/api/clients/${id}/history/page`);
assert.equal(new URL(calls.at(-1)).searchParams.get('query'),'notes & follow-up');
const next=await source({...args,offset:page.nextOffset,revision:page.revision},actor);
assert.deepEqual([...page.items,...next.items].map(row=>row.id),record.items.map(row=>row.id));
assert.equal(next.nextOffset,null);assert.equal(next.incomplete,true,'A complete response page still does not establish the source population.');
for(const parameters of [{page:0},{clientId:'../private'},{clientId:id,page:'0'},{clientId:id,method:'POST'}])
  await assert.rejects(()=>source({...args,parameters},actor));
for(const path of ['https://evil.example/api','/api/clients/../private','/api/clients/{clientId}/write','/api/tablets/keys'])
  await assert.rejects(()=>source({...args,path},actor));
for(const patch of [{offset:1},{offset:20,revision:'0'.repeat(64)},{pointer:'/missing'},{columns:['missing']}])
  await assert.rejects(()=>source({...args,...patch},actor));
record.items[0].text='Fictional amendment';
await assert.rejects(()=>source({...args,offset:20,revision:page.revision},actor));
status=403;await assert.rejects(()=>source(args,actor),/403/);status=200;
contentType='text/html';await assert.rejects(()=>source(args,actor),/record/);contentType='application/json';

const long={note:'Complete narrative '.repeat(900),hasMore:false};
const first=projectCarelogRecord(long,{path:operation.path,pointer:'/note'});
const last=projectCarelogRecord(long,{path:operation.path,pointer:'/note',offset:8000,revision:first.revision});
const end=projectCarelogRecord(long,{path:operation.path,pointer:'/note',offset:16000,revision:first.revision});
assert.equal(first.text+last.text+end.text,long.note);
assert.equal(projectCarelogRecord({count:7,hasMore:false},{path:operation.path}).incomplete,false);
assert.equal(projectCarelogRecord({items:record.items,hasMore:true},{path:operation.path}).incomplete,true);

const grant={id:'carelog-test',clientId:id,principalId:id,subjectId:person,communityIds:ALAMO_FACILITIES.map(f=>f.facilityId),capabilities:['carelog-records'],slices:[],detail:true,expiresAt:new Date(Date.now()+60_000).toISOString(),revoked:false};
const request={subjectId:person,scope:{communityIds:[],from:'2026-01-01',through:'2026-11-24'},step:{id:'read-care',capability:'carelog-records',input:args}};
const authorize=()=>authorizePlatformReportSource({tenantId:EVERYAGENT_TENANT,clientId:id,principalId:id},request,{version:1,grants:[grant]});
const authorization=authorize();
const sources=createPlatformReportSources({carelog:source});
const evidence=await sources.read(request,authorization);
assert.equal(evidence.requiresDetail,true);assert.equal(evidence.coverage,'partial');assert.equal(JSON.parse(evidence.answer).items.length,20);
grant.detail=false;assert.throws(authorize);grant.detail=true;
grant.revoked=true;assert.throws(authorize);
console.log('Carelog: native catalog, exact parameters, represented identity, read-only transport, source paging, complete text continuation, source changes and permission revocation passed.');

const nested={data:{record:{name:'Fictional client',notes:'before '.repeat(2500)+'transport appointment'+' after'.repeat(2500)},completion:{answered:9}}};
const preview=projectCarelogRecord(nested,{path:'/api/example'});
assert(preview.value.preview.data,'Large records expose navigable content rather than only field names');assert(preview.incomplete);
const matched=projectCarelogRecord(nested,{path:'/api/example',search:'transport'});
assert.equal(matched.matches[0].pointer,'/data/record/notes');assert(matched.matches[0].text.includes('transport appointment'));
const selections=projectCarelogRecord(nested,{paths:['/data/record/name','/data/completion']});
assert.equal(selections.selections[0].value,'Fictional client');assert.equal(selections.selections[1].value.answered,9);
assert.throws(()=>projectCarelogRecord(nested,{paths:['/__proto__']}));assert.throws(()=>projectCarelogRecord(nested,{paths:['/data','/data']}));
assert.throws(()=>projectCarelogRecord(nested,{search:'transport',offset:5}),/continuation/);
console.log('Native record previews, multi-field reads and literal passage search preserve exact pointers and revision binding.');

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createAnalystReader } from '../deploy/proforma-analyst-reader.mjs';
import { analystOverlay,analystPaths } from './prepare-proforma-analyst-overlay.mjs';
import { createProformaAnalystSource } from '../server/ally-proforma-source.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { authorizePlatformReportSource } from '../server/ally-report-source-grants.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';

let revision='a'.repeat(64), changed=false, checks=0, text='A complete retained fictional source. '.repeat(700);
const records=Array.from({length:23},(_,i)=>({id:`draft:${i}`,title:`Fictional procedure ${i}`,type:'procedure',status:i===0?'retracted':'draft',citation:{nodeId:`draft:${i}`,fingerprint:'b'.repeat(64)}}));
const reader=createAnalystReader({load:async()=>({sourceStateFingerprint:revision}),assertCurrent:async()=>{checks++;if(changed)throw Error('source_changed');},sources:()=>({records}),
  originals:async rows=>{assert.equal(rows,records);return {};},retrieve:()=>({evidence:records.slice(0,7),missing:['Drafts are unapproved.'],excluded:[],contextFingerprint:revision,limits:{passages:18}}),
  evidence:async citation=>{assert.deepEqual(citation,records[0].citation);return {title:records[0].title,status:'retracted',excerpt:text};}});
const catalog=await reader({});assert.equal(catalog.documents.length,20);assert.equal(catalog.matchedCount,23);assert.equal(catalog.documents.find(row=>row.id==='draft:0').status,'retracted');
const second=await reader({offset:catalog.nextOffset,revision});assert.equal(second.documents.length,3);assert.equal(second.nextOffset,null);
assert.equal(new Set([...catalog.documents,...second.documents].map(row=>row.id)).size,23);
const search=await reader({view:'search',query:'procedure'});assert.equal(search.evidence.length,4);assert.equal(search.nextOffset,4);assert.equal(search.missing[0],'Drafts are unapproved.');
let full='',offset=0;
do {const result=await reader({view:'read',citation:records[0].citation,offset,...(offset?{revision}:{})});full+=result.excerpt;offset=result.nextOffset;assert.equal(result.status,'retracted');}while(offset!==null);
assert.equal(full,text);assert(checks>=6);
await assert.rejects(()=>reader({offset:20}));
await assert.rejects(()=>reader({revision:'c'.repeat(64)}));
await assert.rejects(()=>reader({view:'read',url:'https://untrusted.example'}));
changed=true;await assert.rejects(()=>reader({query:'procedure'}),/source_changed/);

const originals={
 [analystPaths.process]:"import { knowledgeSources } from './knowledge-sources.mjs';\nfunction create(){\n  const service = {\n  };\n}",
 [analystPaths.service]:"      if (method === 'POST' && pathname === '/processes/guidance') result = await processes.guidance(input);\n    if (changed) {\n      await persistence.write(context.scope, state, loaded.version);\n    }",
};
const code=await readFile(new URL('../deploy/proforma-analyst-reader.mjs',import.meta.url),'utf8');
const overlay=analystOverlay(originals,code);
assert.match(overlay[analystPaths.service],/changed && pathname !== '\/processes\/analyst'/);
assert.deepEqual(analystOverlay(overlay,code),overlay);
assert.throws(()=>analystOverlay({...originals,[analystPaths.service]:'changed boundary'},code));

const id='11111111-1111-4111-8111-111111111111',person='22222222-2222-4222-8222-222222222222';
const grant={id:'proforma-test',clientId:id,principalId:id,subjectId:person,communityIds:ALAMO_FACILITIES.map(f=>f.facilityId),capabilities:['proforma-records'],slices:[],detail:true,expiresAt:new Date(Date.now()+60_000).toISOString(),revoked:false};
const request={subjectId:person,scope:{communityIds:[],from:'2026-01-01',through:'2026-11-24'},step:{id:'source-1',capability:'proforma-records',input:{view:'catalog'}}};
const authorize=()=>authorizePlatformReportSource({tenantId:EVERYAGENT_TENANT,clientId:id,principalId:id},request,{version:1,grants:[grant]});
const env={WORKFLOW_CONTENT_ENABLED:'true'};
const source=createProformaAnalystSource({env,persistence:{kind:'fixture'},createService:()=>async(context,method,path,input)=>{
  assert.deepEqual(context.permissions,['read']);assert.equal(context.scope.tenantId,EVERYAGENT_TENANT);
  assert.equal(context.actor.id,`ally:${EVERYAGENT_TENANT}:${person}`);
  assert.equal(method,'POST');assert.equal(path,'/processes/analyst');assert.deepEqual(input,request.step.input);
  return {schemaVersion:1,producer:'ProForma',revision,documents:[],matchedCount:0,nextOffset:null};
}});
const sources=createPlatformReportSources({proforma:source});
const value=await sources.read(request,authorize());
assert.equal(value.requiresDetail,true);assert.equal(value.coverage,'complete');assert.equal(JSON.parse(value.answer).matchedCount,0);
for(const patch of [{detail:false},{communityIds:[grant.communityIds[0]]},{revoked:true}]) {
  const previous={...grant};Object.assign(grant,patch);assert.throws(authorize);Object.assign(grant,previous);
}
await assert.rejects(()=>source({}, {subjectId:'unverified'}));
env.WORKFLOW_CONTENT_ENABLED='false';await assert.rejects(()=>source({}, {subjectId:person}),/unavailable/);
console.log('ProForma analyst: current/working/published status, catalog paging, exact evidence reads, complete text, revision checks and read-only overlay boundary passed.');

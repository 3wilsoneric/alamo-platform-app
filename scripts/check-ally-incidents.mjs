import assert from 'node:assert/strict';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { authorizePlatformReportSource } from '../server/ally-report-source-grants.mjs';
import { reportHash, validateReportEvidence } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
const id='11111111-1111-4111-8111-111111111111';
const scope={communityIds:['345'],from:'2026-01-01',through:'2026-11-23'};
const grant={id:'test-incidents',clientId:id,principalId:id,subjectId:id,communityIds:['345'],capabilities:['incident-summary','platform-data'],slices:['incident_monthly_by_community_category'],detail:false,expiresAt:'2026-12-23T00:00:00Z',revoked:false};
const registry={version:1,grants:[grant]},identity={tenantId:EVERYAGENT_TENANT,clientId:id,principalId:id};
const step={id:'source-1',capability:'incident-summary',input:{communityIds:['345'],from:'2026-11-22',through:'2026-11-22',priority:'high'}};
const input={version:1,operation:'read',subjectId:id,scope,step};
const authorization=authorizePlatformReportSource(identity,input,registry,Date.parse('2026-11-23T23:00:00Z'));
let calls=0,partial=false,count=2;
const source=createPlatformReportSources({summary:async()=>({toolContext:{manifest:[{slice_name:'incident_monthly_by_community_category',fields:['Facility','Facility_Name','month_bucket','incident_count'],row_count:1}],tables:{}}}),incidents:async options=>{
  calls++;assert.deepEqual(options,{facilityId:'345',from:'2026-11-22',to:'2026-11-22',priority:'high',limit:1});
  return {status:'ready',matchingIncidents:count,generatedAt:'2026-11-23T20:00:00Z',coverage:{status:partial?'partial':'complete'},freshness:{stale:false},incidents:[{residentName:'PRIVATE_PERSON',description:'PRIVATE_NARRATIVE'}],clients:[{id:'PRIVATE_ID'}]};
}});
const catalog=await source.catalog(authorization);assert(catalog.some(c=>c.id==='incident-summary'));
const read=()=>source.read(input,authorization);
const first=validateReportEvidence(await read(),step,scope);
assert.deepEqual(first.dataset.rows,[{community:'Santa Clarita',incidents:2}]);assert.equal(first.period,'2026-11-22–2026-11-22');assert.equal(first.coverage,'complete');
assert.equal(first.requiresDetail,false);assert(!JSON.stringify(first).includes('PRIVATE_'));assert.match(first.note,/not a clinical severity/);
partial=true;count=0;const fallback=await read();assert.equal(fallback.coverage,'partial');assert.match(fallback.note,/not confirmed complete/);assert.equal(fallback.dataset.rows[0].incidents,0);
const before=calls;
for(const args of [{...step.input,communityIds:['337']},{...step.input,communityIds:[]},{...step.input,from:'2025-01-01'},{...step.input,through:'2026-11-24'},{...step.input,from:'2026-02-30'},{...step.input,priority:'critical'},{...step.input,residentId:'PRIVATE_ID'}])await assert.rejects(source.read({...input,step:{...step,input:args}},authorization));
assert.equal(calls,before,'invalid or wider scopes fail before source reads');
assert.throws(()=>authorizePlatformReportSource(identity,input,{version:1,grants:[{...grant,capabilities:['platform-data']}]},Date.parse('2026-11-23')),e=>e.statusCode===403);
assert.throws(()=>authorizePlatformReportSource(identity,{...input,subjectId:'22222222-2222-4222-8222-222222222222'},registry,Date.parse('2026-11-23')),e=>e.statusCode===403);
// Reproduce the actual failed monthly plan. It must become an explicit coverage
// limit, never a fabricated daily count or a 503 reported as a model outage.
const monthly={id:'source-1',capability:'platform-data',input:{slice:'incident_monthly_by_community_category',operation:'rows',dateField:'month_bucket',filters:[{field:'Facility_Name',op:'contains',value:'Santa Clarita'},{field:'month_bucket',op:'gte',value:'2026-11'},{field:'month_bucket',op:'lte',value:'2026-11-23'}],limit:100}};
const limited=validateReportEvidence(await source.read({...input,step:monthly},authorization),monthly,scope);
assert.equal(limited.status,'unavailable');assert.equal(limited.answer,null);assert.equal(limited.dataset,undefined);assert.equal(limited.coverage,'partial');assert.match(limited.note,/specific day/);
console.log('Ally incidents: exact daily filters, priority, scope, aggregate-only output, incomplete/zero distinction, denied grants and failed monthly-plan coverage passed.');

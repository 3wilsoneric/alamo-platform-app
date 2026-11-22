import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from 'jose';
import { createPlatformAgentSourceAuthorizer } from '../server/platform-agent-source-auth.mjs';
import { createPlatformReportSourceHandler } from '../server/ally-report-source-api.mjs';
import { createPlatformReportSources } from '../server/ally-report-source.mjs';
import { readAllyPlatformData } from '../server/ally-data-source.mjs';
import { authorizePlatformReportSource } from '../server/ally-report-source-grants.mjs';
import { EVERYAGENT_TENANT } from '../shared/everyagent-identity.mjs';
import { createExecutiveReportSource } from '@alamo/agent-runtime/server/executive-report-source.mjs';
import { createExecutiveReportStore } from '@alamo/agent-runtime/server/executive-report-store.mjs';
import { createExecutiveReportService } from '@alamo/agent-runtime/server/executive-report-service.mjs';
import { validateReportEvidence, EXECUTIVE_REPORT_SOURCE_PATH } from '@alamo/agent-runtime/shared/executive-report-contracts.mjs';
import { reportViewContext } from '@alamo/agent-runtime/shared/executive-report-views.mjs';
import { ALAMO_FACILITIES } from '../shared/community-names.mjs';

const user='11111111-1111-4111-8111-111111111111', clientId='22222222-2222-4222-8222-222222222222', principalId='33333333-3333-4333-8333-333333333333', audience='44444444-4444-4444-8444-444444444444';
const scope={communityIds:['337'],from:'2026-11-01',through:'2026-11-20'};
const registry={version:1,grants:[{id:'fictional-pilot',clientId,principalId,subjectId:user,communityIds:['337'],capabilities:['platform-data','pipeline-summary','licensing-search'],slices:['incident_detail_history','census_monthly_by_community'],detail:false,expiresAt:new Date(Date.now()+86400000).toISOString(),revoked:false}]};
const rows=[{facility_id:'337',incident_date:'2026-11-20T23:59:59',severity:'medium',private_name:'Synthetic A'}, {facility_id:'345',incident_date:'2026-11-20',severity:'high',private_name:'OTHER_COMMUNITY'}, {facility_id:'337',incident_date:'2026-11-21',severity:'high',private_name:'NEXT_DAY'}, {facility_id:'337',incident_date:'2026-11-01T00:00:00',severity:'low',private_name:'Synthetic B'}];
const published={toolContext:{manifest:[{slice_name:'incident_detail_history',grain:'incident',row_count:4,fields:Object.keys(rows[0]),generated_at:new Date().toISOString()}, {slice_name:'census_monthly_by_community',grain:'community month',row_count:1,fields:['facility_id','month','census']}],tables:{incident_detail_history:rows,census_monthly_by_community:[{facility_id:'337',month:'2026-11',census:40}]}}};
const step={id:'source-1',capability:'platform-data',input:{slice:'incident_detail_history',operation:'count',groupBy:['severity'],dateField:'incident_date'}};
const pipelineSnapshot={status:'connected',generatedAt:new Date().toISOString(),metrics:{activeReferrals:2,awaitingAdmission:900},board:{total:2,truncated:false,columns:[{key:'decision',label:'Decision',count:99}],cards:[{column:'in_progress',status:'Assessment underway',community:'San Pablo'},{column:'decision',status:'Accepted, requirements open',community:'Santa Clarita'}]}};
let reads=0, afterRead=()=>{};
const sources=createPlatformReportSources({summary:async()=>published,data:async(query,options)=>{reads++;const value=await readAllyPlatformData(query,{...options,load:async()=>published,execute:async()=>{throw Error('Offline fixture');}});afterRead();return value;},pipeline:async()=>structuredClone(pipelineSnapshot)});
const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);
const sign=(claims={})=>new SignJWT({tid:EVERYAGENT_TENANT,oid:principalId,azp:clientId,roles:['AlamoAgent.Source.Read'],ver:'2.0',iss:`https://login.microsoftonline.com/${EVERYAGENT_TENANT}/v2.0`,aud:audience,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...claims}).setProtectedHeader({alg:'RS256',kid:'test'}).sign(privateKey);
const handler=createPlatformReportSourceHandler({authorize:createPlatformAgentSourceAuthorizer({audience,keySet:createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'RS256'}]})}),readGrants:async()=>structuredClone(registry),sources});
const server=createServer((req,response)=>{const res={setHeader:(k,v)=>response.setHeader(k,v),status(code){response.statusCode=code;return res;},json(value){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));}};void handler(req,res).catch(e=>response.destroy(e));});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`,token=await sign();
const input={version:1,operation:'read',subjectId:user,scope,step};
const send=(body=input,bearer=token)=>fetch(base+EXECUTIVE_REPORT_SOURCE_PATH,{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
try {
  for(const claims of [{aud:'wrong'},{scp:'access_as_user'},{roles:[]},{oid:user},{tid:user},{exp:1}]) assert([401,403].includes((await send(input,await sign(claims))).status));
  for(const body of [{...input,subjectId:principalId},{...input,scope:{...scope,communityIds:[]}},{...input,step:{...step,input:{...step.input,operation:'rows',groupBy:[]}}},{...input,step:{...step,input:{...step.input,groupBy:['private_name']}}}]) assert.equal((await send(body)).status,403);
  assert.equal(reads,0);
  assert.equal((await send({...input,untrustedAction:'send-email'})).status,400);
  assert.equal((await send('x'.repeat(17000))).status,413);
  const connection=createExecutiveReportSource({origin:'https://source.example.test',getToken:async()=>({token,expiresOnTimestamp:Date.now()+60000}),fetchImpl:(url,init)=>fetch(base+new URL(url).pathname,init)});
  // Use the canonical knowledge reader and its versioned contract, rather than
  // a permissive fake that would accept an invalid cross-application request.
  const knowledgeStep={id:'knowledge',capability:'proforma-search',input:{query:'intake'}};
  assert.equal((await send({...input,step:knowledgeStep})).status,403);
  registry.grants[0].capabilities.push('proforma-search');
  const knowledgeEvidence=validateReportEvidence(await connection.read(user,scope,knowledgeStep),knowledgeStep,scope);
  const knowledge=JSON.parse(knowledgeEvidence.answer);
  assert.equal(knowledgeEvidence.requiresDetail,false);
  assert(knowledge.documents.length>0&&knowledge.documents.length<=5);
  assert(knowledge.documents.every(document=>['draft','review'].includes(document.reviewStatus)&&document.body===null));
  assert(knowledge.documents.every(document=>document.href.includes('revision='+document.revision)));
  assert.match(knowledgeEvidence.note,/not approved clinical policy/);
  assert.equal(knowledgeEvidence.coverage,knowledge.limited?'partial':'complete');
  registry.grants[0].capabilities.pop();
  assert.equal((await send({...input,step:knowledgeStep})).status,403,'removing a capability must revoke knowledge reads');
  const evidence=validateReportEvidence(await connection.read(user,scope,step),step,scope);
  assert.equal(evidence.requiresDetail,false);
  assert.equal(evidence.coverage,'complete');assert.deepEqual(evidence.dataset.rows,[{severity:'medium',result:1},{severity:'low',result:1}]);assert(!evidence.answer.includes('OTHER_COMMUNITY'));assert(!evidence.answer.includes('Synthetic A'));
  const sqlResult=await readAllyPlatformData(step.input,{load:async()=>published,execute:async sql=>{assert(sql.includes('substring(`')||sql.includes('substring(CAST'));return[{severity:'medium',result:1}];},constraints:[{field:'facility_id',op:'in',value:['337']},{field:'incident_date',op:'day-lte',value:'2026-11-20'}]});assert.equal(sqlResult.rows[0].result,1);
  published.toolContext.manifest[0].row_count=10;assert.equal((await connection.read(user,scope,step)).coverage,'partial');published.toolContext.manifest[0].row_count=4;
  // A newly published field must not expand an aggregate-only grant.
  const aggregate=published.toolContext.manifest[1];aggregate.fields.push('private_case_note','private_date_of_birth');
  Object.assign(published.toolContext.tables.census_monthly_by_community[0],{private_case_note:'REDACTION_PROBE',private_date_of_birth:'1980-01-01',undeclared_secret:'UNDECLARED_PROBE'});
  const aggregateStep={id:'source-3',capability:'platform-data',input:{slice:'census_monthly_by_community',operation:'rows'}};
  const aggregateEvidence=await connection.read(user,scope,aggregateStep);
  assert(!JSON.stringify(aggregateEvidence).includes('REDACTION_PROBE'),'aggregate evidence must remove private values from its answer and native dataset');
  assert(!JSON.stringify(aggregateEvidence).includes('UNDECLARED_PROBE'),'undeclared fields must not escape source projection');
  const catalog=await connection.catalog(user,scope),listed=catalog.find(c=>c.id==='platform-data').sources.find(s=>s.id==='census_monthly_by_community');
  assert(!listed.dateFields.includes('private_date_of_birth'),'aggregate catalogs must not expose private query dimensions');
  assert.equal(aggregateEvidence.dataset.columns.find(c=>c.key==='census').type,'number','published numeric measures must remain usable in native charts');
  // Use actual publisher field names, not only normalized development fixtures.
  for(const [slice,row,numeric] of [
    ['current_resident_county_by_community',{Facility:'337',Facility_Name:'San Pablo',client_county:'Contra Costa',resident_count:'7',as_of_date:'2026-11-20'},'resident_count'],
    ['resident_flow_weekly_by_community',{Facility:'337',Facility_Name:'San Pablo',week_start:'2026-11-16',admissions:5,discharges:2,net_change:3},'net_change'],
    ['incident_monthly_by_community_category',{Facility:'337',Facility_Name:'San Pablo',Incident_Category:'Fall',month_bucket:'2026-11',incident_count:2,resident_count:1},'incident_count']
  ]) {
    registry.grants[0].slices.push(slice);
    published.toolContext.manifest.push({slice_name:slice,grain:'published aggregate',row_count:1,fields:[...Object.keys(row),'private_case_note']});
    published.toolContext.tables[slice]=[{...row,private_case_note:'PRIVATE_AGGREGATE_PROBE'}];
    const publishedEvidence=await connection.read(user,scope,{id:'source-4',capability:'platform-data',input:{slice,operation:'rows'}});
    assert.deepEqual(publishedEvidence.dataset.rows,[{...row,[numeric]:Number(row[numeric])}]);
    assert.equal(publishedEvidence.dataset.columns.find(c=>c.key===numeric).type,'number');
    assert(!JSON.stringify(publishedEvidence).includes('PRIVATE_AGGREGATE_PROBE'));
  }
  const county=published.toolContext.tables.current_resident_county_by_community[0];
  const countyStep={id:'source-4',capability:'platform-data',input:{slice:'current_resident_county_by_community',operation:'rows'}};
  for(const value of [null,0]) {
    county.resident_count=value;
    assert.equal((await connection.read(user,scope,countyStep)).dataset.rows[0].resident_count,value,'missing and zero measures remain distinct');
  }
  county.resident_count='';
  await assert.rejects(connection.read(user,scope,countyStep),'blank measures cannot silently become zero');
  county.resident_count='7';
  // Exercise the real source projection, not a browser fixture that already
  // labels its synthetic dataset as chartable.
  const chartSlice='census_weekly_by_community';
  const chartRows=[
    {facility_id:'337',community:'San Pablo',as_of_date:'2026-11-20',census:7},
    {facility_id:'345',community:'Santa Clarita',as_of_date:'2026-11-20',census:19}
  ];
  published.toolContext.manifest.push({slice_name:chartSlice,grain:'community week',row_count:2,fields:Object.keys(chartRows[0])});
  published.toolContext.tables[chartSlice]=chartRows;
  registry.grants[0].slices.push(chartSlice);registry.grants[0].communityIds.push('345');
  const chartScope={...scope,communityIds:['337','345']};
  const chartStep={id:'source-5',capability:'platform-data',input:{slice:chartSlice,operation:'rows',dateField:'as_of_date'}};
  const chartEvidence=validateReportEvidence(await connection.read(user,chartScope,chartStep),chartStep,chartScope);
  assert.equal(chartEvidence.dataset.shape,'categories');
  assert.equal(chartEvidence.dataset.columns[0].key,'community','the chart axis must use names, not facility IDs or dates');
  assert.deepEqual(chartEvidence.dataset.rows,chartRows,'chart selection must not alter source values');
  const chartContext=reportViewContext([{sourceId:chartStep.id,value:chartEvidence}],'fixture','Compare communities in a chart');
  assert(chartContext.catalog.some(view=>view.id==='comparison'),'the real projected source must offer the comparison renderer');
  chartRows[1].as_of_date='2026-11-13';
  assert.equal((await connection.read(user,chartScope,chartStep)).dataset.shape,'records','different census dates cannot be charted as a same-date comparison');
  chartRows[1].community='San Pablo';chartRows[1].facility_id='337';
  const series=await connection.read(user,chartScope,chartStep);
  assert.equal(series.dataset.shape,'series');assert.equal(series.dataset.columns[0].key,'as_of_date');
  chartRows[1].as_of_date=chartRows[0].as_of_date;
  assert.equal((await connection.read(user,chartScope,chartStep)).dataset.shape,'records','duplicate community/date rows cannot imply a single observation');
  chartRows[1].community='';
  assert.equal((await connection.read(user,chartScope,chartStep)).dataset.shape,'records','missing labels are not chart categories');
  published.toolContext.tables[chartSlice]=[];
  assert.equal((await connection.read(user,chartScope,chartStep)).dataset.shape,'records','empty sources remain exact-value tables');
  registry.grants[0].communityIds.pop();
  assert.equal((await send({...input,step:{...aggregateStep,input:{...aggregateStep.input,dateField:'private_date_of_birth'}}})).status,403,'date selectors cannot bypass aggregate dimension limits');
  const pipeline=await connection.read(user,scope,{id:'source-2',capability:'pipeline-summary',input:{}});assert.deepEqual(pipeline.dataset.rows.map(row=>row.count),[0,1,0,0]);assert(!pipeline.answer.includes('900'));
  const identity={tenantId:EVERYAGENT_TENANT,clientId,principalId};const auth=authorizePlatformReportSource(identity,input,registry);
  registry.grants[0].communityIds.push('345');
  const bothScope={...scope,communityIds:['337','345']}, pipelineStep={id:'source-2',capability:'pipeline-summary',input:{}};
  const both=await connection.read(user,bothScope,pipelineStep);
  assert.deepEqual(both.dataset.rows.map(row=>row.count),[0,1,0,1]);
  assert.deepEqual(JSON.parse(both.answer).metrics,{activeReferrals:2,awaitingAdmission:1});
  assert.equal(both.dataset.rows.reduce((sum,row)=>sum+row.count,0),2,'stage counts cannot overlap');
  pipelineSnapshot.board.truncated=true;
  await assert.rejects(connection.read(user,bothScope,pipelineStep),'truncated lists cannot provide a complete active total');
  pipelineSnapshot.board.truncated=false;pipelineSnapshot.metrics.activeReferrals=3;
  await assert.rejects(connection.read(user,bothScope,pipelineStep),'a mismatched published population must fail closed');
  pipelineSnapshot.metrics.activeReferrals=2;
  pipelineSnapshot.board.cards[0].community='Unmapped';
  await assert.rejects(connection.read(user,bothScope,pipelineStep),'unmapped active records cannot silently disappear from a complete count');
  pipelineSnapshot.board.cards[0].community='San Pablo';pipelineSnapshot.board.cards[0].facilityId='345';
  await assert.rejects(connection.read(user,bothScope,pipelineStep),'conflicting community identity cannot choose an authorized scope');
  delete pipelineSnapshot.board.cards[0].facilityId;registry.grants[0].communityIds.pop();

  await assert.rejects(sources.read({...input,step:{...step,input:{slice:'census_monthly_by_community',operation:'sum',measure:'census',groupBy:['month'],dateField:'month'}}},auth),/partial month/);
  await assert.rejects(sources.read({...input,step:{...step,input:{slice:'census_monthly_by_community',operation:'sum',measure:'census',dateField:'month'}}},auth),/across dates/);
  // Saved output must obey the recipient's projection, not merely permission
  // to issue the same query (which returns fewer fields for aggregate readers).
  const reader='55555555-5555-4555-8555-555555555555';
  registry.grants.push({...structuredClone(registry.grants[0]),id:'fictional-reader',subjectId:reader});
  registry.grants[0].detail=true;
  const localRoot=await mkdtemp(path.join(os.tmpdir(),'platform-report-sharing-'));
  try {
    const store=createExecutiveReportStore({azure:false,localRoot});
    const service=createExecutiveReportService({store,source:connection,allowedSubjects:[user,reader],model:{
      plan:async()=>({plan:{steps:[{capability:aggregateStep.capability,input:aggregateStep.input}],gaps:[]}}),
      synthesize:async()=>({findings:[{text:'40 residents.',sourceIds:['source-1']}]})
    }});
    const delegated=oid=>({authenticated:true,mode:'entra-delegated',claims:{tid:EVERYAGENT_TENANT,oid}});
    const report=await service.create(delegated(user),{requestId:randomUUID(),objective:'Show the current census.',scope});
    for(let phase=0;phase<3;phase++) await service.advance({ownerId:user,id:report.id});
    const saved=await service.get(delegated(user),user,report.id);
    assert.equal((await store.read(user,report.id)).value.runs[0].evidence[0].value.requiresDetail,true);
    assert(saved.artifact.html.includes('REDACTION_PROBE'),'fixture must contain the authorized detail before testing sharing');
    const share={ownerId:user,id:report.id,revision:saved.revision,action:'share',readerId:reader};
    await assert.rejects(service.command(delegated(user),share),error=>error.statusCode===404,'a detail report must not be shared to aggregate-only access');
    registry.grants[1].detail=true;
    await service.command(delegated(user),share);
    assert.deepEqual((await service.get(delegated(reader),user,report.id)).artifact,saved.artifact);
    registry.grants[1].detail=false;
    await assert.rejects(service.get(delegated(reader),user,report.id),error=>error.statusCode===404);
    assert.deepEqual(await service.list(delegated(reader)),[]);
    registry.grants[0].detail=false;
    await assert.rejects(service.get(delegated(user),user,report.id),error=>error.statusCode===404);
    assert.deepEqual((await store.read(user,report.id)).value.runs[0].artifact,saved.artifact);
    const aggregateReport=await service.create(delegated(user),{requestId:randomUUID(),objective:'Show aggregate census.',scope});
    for(let phase=0;phase<3;phase++) await service.advance({ownerId:user,id:aggregateReport.id});
    const aggregateSaved=await service.get(delegated(user),user,aggregateReport.id);
    assert(!aggregateSaved.artifact.html.includes('REDACTION_PROBE'));
    await service.command(delegated(user),{...share,id:aggregateReport.id,revision:aggregateSaved.revision});
    assert.deepEqual((await service.get(delegated(reader),user,aggregateReport.id)).artifact,aggregateSaved.artifact);
  } finally {
    await rm(localRoot,{recursive:true,force:true});
    registry.grants.pop();registry.grants[0].detail=false;
  }
  afterRead=()=>{registry.grants[0].revoked=true;};const denied=await send();assert.equal(denied.status,403);assert(!(await denied.text()).includes('medium'));
  console.log('Executive source: signed workload, subject/community grants, date boundaries, partial coverage, aggregate privacy, pipeline scope and revocation passed.');
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

// Exercise actual episode reconciliation and the source-owned view selection.
// A discharged November admission must remain in the county cohort, and source
// person fields must never enter the aggregate answer or on-demand view.
const flowSnapshot={snapshot:{as_of_date:'2026-11-21',generated_at:new Date().toISOString()},reportsSummary:{toolContext:{tables:{
  resident_flow_monthly_by_community:ALAMO_FACILITIES.flatMap(f=>Array.from({length:10},(_,i)=>({facility_id:f.facilityId,month_bucket:`2026-${String(i+1).padStart(2,'0')}`,admissions:0,discharges:0}))),
  resident_episode_history:ALAMO_FACILITIES.flatMap(f=>[
    {episode_id:f.facilityId+'-old',resident_name:'PRIVATE_PERSON_PROBE',facility_id:f.facilityId,admit_date:'2025-12-01',discharge_date:null,admission_county:'Alameda'},
    {episode_id:f.facilityId+'-new',resident_name:'PRIVATE_PERSON_PROBE',facility_id:f.facilityId,admit_date:'2026-11-01',discharge_date:'2026-11-02',admission_county:'Contra Costa County'},
    {episode_id:f.facilityId+'-repeat',resident_name:'PRIVATE_PERSON_PROBE',facility_id:f.facilityId,admit_date:'2026-11-03',discharge_date:null,admission_county:'San Francisco'}]),
  census_weekly_by_community:ALAMO_FACILITIES.map(f=>({facility_id:f.facilityId,census_date:'2026-11-21',census:2}))
}}}};
const flowSources=createPlatformReportSources({snapshot:async()=>flowSnapshot});
const flowScope={communityIds:['337','344'],from:'2026-11-01',through:'2026-11-21'};
const flowAuthorization={communities:flowScope.communityIds,grant:{detail:false},receipt:{revision:'a'.repeat(64)}};
const readView=(view,selectedScope=flowScope)=>flowSources.read({scope:selectedScope,step:{id:'flow',capability:'resident-flow',input:{view}}},{...flowAuthorization,communities:selectedScope.communityIds});
const countyView=await readView('counties');
assert.deepEqual(countyView.dataset.rows,[{county:'Contra Costa',admissions:2},{county:'San Francisco',admissions:2}]);
assert.equal(countyView.dataset.shape,'categories');assert.equal(countyView.dataset.columns[0].key,'county');
assert(!countyView.answer.includes('Alameda'),'current resident counties cannot replace the admission cohort');
assert(!JSON.stringify(countyView).includes('PRIVATE_PERSON_PROBE'));
const occupancy=await readView('occupancy');
assert.deepEqual(occupancy.dataset.rows,[{community:'San Pablo',census:2,operatingCapacity:175,availableBeds:173,capacityAsOf:'2026-07-30'},{community:'Turlock',census:2,operatingCapacity:84,availableBeds:82,capacityAsOf:'2026-07-30'}]);
assert(!JSON.stringify(occupancy).includes('PRIVATE_PERSON_PROBE'));assert(!occupancy.answer.includes('Santa Clarita'));
assert.equal((await readView('occupancy',{...flowScope,through:'2026-11-02'})).period,'Current census as of 2026-11-21','current occupancy is labeled as the source snapshot, not a historical denominator');
const ordinary=await readView('communities');
assert.deepEqual(ordinary.dataset.rows.map(r=>[r.community,r.admissions,r.discharges]),[['San Pablo',2,1],['Turlock',2,1]]);
await assert.rejects(readView('invented'),/supported resident-flow view/);
delete flowSnapshot.reportsSummary.toolContext.tables.resident_episode_history[1].admission_county;
const unavailableCounty=await readView('counties');assert.equal(unavailableCounty.coverage,'partial');assert.deepEqual(unavailableCounty.dataset.rows,[]);
flowSnapshot.snapshot.as_of_date='2026-06-30';
flowSnapshot.reportsSummary.toolContext.tables.census_weekly_by_community=ALAMO_FACILITIES.map(f=>({facility_id:f.facilityId,census_date:'2026-06-30',census:1}));
const historical=await readView('occupancy');assert.equal(historical.coverage,'partial');assert(historical.dataset.rows.every(r=>r.operatingCapacity===null&&r.availableBeds===null),'current operating limits cannot be applied before their effective dates');
console.log('Executive views: scoped admission counties, actual occupancy limits, unavailable history, and aggregate privacy passed.');

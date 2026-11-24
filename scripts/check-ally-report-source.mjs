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
import { reportColumnLabel, reportCellValue } from '../shared/report-display.mjs';
import { analystSourceDefinition } from '../server/ally-analyst-catalog.mjs';

assert.deepEqual(analystSourceDefinition({id:'census_data_quality',fields:['latest_census_month','latest_monthly_census','weekly_census_rows','min_week','max_week','monthly_census_minus_active_roster']}).dateFields,['latest_census_month','min_week','max_week']);

for (const [key,expected] of [['operatingCapacity','Operating capacity'],['occupied_bed_days','Occupied bed-days'],['census_delta','Census delta'],['prn_given_count','PRN given count'],['FacilityID','Community ID']]) assert.equal(reportColumnLabel({key,label:key}),expected);
assert.equal(reportColumnLabel({key:'bedDays',label:'Days occupied in this period'}),'Days occupied in this period','source-authored wording is preserved');
assert.equal(reportColumnLabel({key:'operatingCapacity',label:'  '}),'Operating capacity');
assert.equal(reportColumnLabel({key:'toString'}),'To string');
assert.equal(reportCellValue(150443),'150,443');
assert.equal(reportCellValue(false),'No');
assert.equal(reportCellValue(null),'Not recorded');
assert.equal(reportCellValue('2026-07-30'),'30 Jul 2026');
assert.equal(reportCellValue('2026-07'),'July 2026');

const user='11111111-1111-4111-8111-111111111111', clientId='22222222-2222-4222-8222-222222222222', principalId='33333333-3333-4333-8333-333333333333', audience='44444444-4444-4444-8444-444444444444';
const scope={communityIds:['337'],from:'2026-11-01',through:'2026-11-20'};
const registry={version:1,grants:[{id:'fictional-pilot',clientId,principalId,subjectId:user,communityIds:['337'],capabilities:['platform-data','pipeline-summary','licensing-search'],slices:['incident_detail_history','census_monthly_by_community'],detail:false,expiresAt:new Date(Date.now()+86400000).toISOString(),revoked:false}]};
const rows=[{facility_id:'337',incident_date:'2026-11-20T23:59:59',severity:'medium',private_name:'Synthetic A'}, {facility_id:'345',incident_date:'2026-11-20',severity:'high',private_name:'OTHER_COMMUNITY'}, {facility_id:'337',incident_date:'2026-11-21',severity:'high',private_name:'NEXT_DAY'}, {facility_id:'337',incident_date:'2026-11-01T00:00:00',severity:'low',private_name:'Synthetic B'}];
const published={toolContext:{manifest:[{slice_name:'incident_detail_history',grain:'incident',row_count:4,fields:Object.keys(rows[0]),generated_at:new Date().toISOString()}, {slice_name:'census_monthly_by_community',grain:'community month',row_count:1,fields:['facility_id','month','census']}],tables:{incident_detail_history:rows,census_monthly_by_community:[{facility_id:'337',month:'2026-11',census:40}]}}};
const step={id:'source-1',capability:'platform-data',input:{slice:'incident_detail_history',operation:'count',groupBy:['severity'],dateField:'incident_date'}};
const pipelineSnapshot={status:'connected',generatedAt:new Date().toISOString(),metrics:{activeReferrals:2,awaitingAdmission:900},board:{total:2,truncated:false,columns:[{key:'decision',label:'Decision',count:99}],cards:[{column:'in_progress',status:'Assessment underway',community:'San Pablo'},{column:'decision',status:'Accepted, requirements open',community:'Santa Clarita'}]}};
let reads=0, afterRead=()=>{}, warehouseRows=null;
const sources=createPlatformReportSources({summary:async()=>published,data:async(query,options)=>{reads++;const value=await readAllyPlatformData(query,{...options,load:async()=>published,execute:async()=>{if(warehouseRows)return warehouseRows;throw Error('Offline fixture');}});afterRead();return value;},pipeline:async()=>structuredClone(pipelineSnapshot)});
const {publicKey,privateKey}=await generateKeyPair('RS256');const jwk=await exportJWK(publicKey);
const sign=(claims={})=>new SignJWT({tid:EVERYAGENT_TENANT,oid:principalId,azp:clientId,roles:['AlamoAgent.Source.Read'],ver:'2.0',iss:`https://login.microsoftonline.com/${EVERYAGENT_TENANT}/v2.0`,aud:audience,iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600,...claims}).setProtectedHeader({alg:'RS256',kid:'test'}).sign(privateKey);
const handler=createPlatformReportSourceHandler({authorize:createPlatformAgentSourceAuthorizer({audience,keySet:createLocalJWKSet({keys:[{...jwk,kid:'test',alg:'RS256'}]})}),readGrants:async()=>structuredClone(registry),sources});
const server=createServer((req,response)=>{const res={setHeader:(k,v)=>response.setHeader(k,v),status(code){response.statusCode=code;return res;},json(value){response.setHeader('Content-Type','application/json');response.end(JSON.stringify(value));}};void handler(req,res).catch(e=>response.destroy(e));});
server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`,token=await sign();
const input={version:1,operation:'read',subjectId:user,scope,step};
const clinicalInput={...input,step:{id:'client',capability:'client-records',input:{view:'directory'}}};
const clinicalRegistry=structuredClone(registry);
clinicalRegistry.grants[0].capabilities.push('client-records');
assert.throws(()=>authorizePlatformReportSource({tenantId:EVERYAGENT_TENANT,clientId,principalId},clinicalInput,clinicalRegistry));
clinicalRegistry.grants[0].detail=true;
assert.throws(()=>authorizePlatformReportSource({tenantId:EVERYAGENT_TENANT,clientId,principalId},clinicalInput,clinicalRegistry),'A whole client history can span communities.');
clinicalRegistry.grants[0].communityIds=ALAMO_FACILITIES.map(f=>f.facilityId);
assert.equal(authorizePlatformReportSource({tenantId:EVERYAGENT_TENANT,clientId,principalId},clinicalInput,clinicalRegistry).receipt.detail,true);
const send=(body=input,bearer=token)=>fetch(base+EXECUTIVE_REPORT_SOURCE_PATH,{method:'POST',headers:{Authorization:`Bearer ${bearer}`,'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)});
try {
  for(const claims of [{aud:'wrong'},{scp:'access_as_user'},{roles:[]},{oid:user},{tid:user},{exp:1}]) assert([401,403].includes((await send(input,await sign(claims))).status));
  for(const body of [{...input,subjectId:principalId},{...input,scope:{...scope,communityIds:[]}},{...input,step:{...step,input:{...step.input,operation:'rows',groupBy:[]}}},{...input,step:{...step,input:{...step.input,groupBy:['private_name']}}}]) assert.equal((await send(body)).status,403);
  assert.equal(reads,0);
  const authorizationBatch={...input,operation:'authorize-batch',step:null,checks:[{scope,step:null},{scope,step},{scope:{...scope,communityIds:['345']},step:null},{scope,step:{...step,input:{...step.input,operation:'rows',groupBy:[]}}}]};
  const batchResponse=await send(authorizationBatch);assert.equal(batchResponse.status,200);
  const batch=await batchResponse.json();assert.equal(batch.grants.length,4);assert.deepEqual(batch.grants.slice(0,2),[batch.grant,batch.grant]);assert.deepEqual(batch.grants.slice(2),[null,null]);
  assert.equal((await send({...authorizationBatch,checks:Array(33).fill({scope,step:null})})).status,400);
  assert.equal((await send({...authorizationBatch,checks:[{scope,step:null,ignorePermission:true}]})).status,400);
  registry.grants[0].revoked=true;assert.equal((await send(authorizationBatch)).status,403);registry.grants[0].revoked=false;
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
  assert.deepEqual(evidence.dataset.columns.map(column=>column.label),['Severity','Records']);
  assert.equal(evidence.requiresDetail,false);
  assert.equal(evidence.coverage,'complete');assert.deepEqual(evidence.dataset.rows,[{severity:'medium',result:1},{severity:'low',result:1}]);assert(!evidence.answer.includes('OTHER_COMMUNITY'));assert(!evidence.answer.includes('Synthetic A'));
  const sqlResult=await readAllyPlatformData(step.input,{load:async()=>({...published,toolContext:{...published.toolContext,tables:{}}}),execute:async sql=>{assert(sql.includes('substring(`')||sql.includes('substring(CAST'));return[{severity:'medium',result:1}];},constraints:[{field:'facility_id',op:'in',value:['337']},{field:'incident_date',op:'day-lte',value:'2026-11-20'}]});assert.equal(sqlResult.rows[0].result,1);
  published.toolContext.manifest[0].row_count=10;await assert.rejects(connection.read(user,scope,step));published.toolContext.manifest[0].row_count=4;
  // Native SDK timestamp -> source formatting -> HTTP JSON -> engine contract.
  // The live benchmark exposed Date cells becoming {} during name formatting.
  published.toolContext.manifest[0].row_count=10;
  registry.grants[0].detail=true;
  warehouseRows=[{incident_date:new Date('2026-11-19T23:41:07.123Z'),severity:'medium'}];
  const datedStep={id:'source-2',capability:'platform-data',input:{slice:'incident_detail_history',operation:'rows',columns:['incident_date','severity'],dateField:'incident_date'}};
  const dated=validateReportEvidence(await connection.read(user,scope,datedStep),datedStep,scope);
  assert.equal(dated.dataset.rows[0].incident_date,'2026-11-19T23:41:07.123Z');
  assert.equal(JSON.parse(dated.answer).rows[0].incident_date,dated.dataset.rows[0].incident_date);
  warehouseRows=null;registry.grants[0].detail=false;published.toolContext.manifest[0].row_count=4;
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
    const publishedEvidence=await connection.read(user,{...scope,through:'2026-11-30'},{id:'source-4',capability:'platform-data',input:{slice,operation:'rows'}});
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

  assert.equal((await send({...input,step:{id:'workspace-detail',capability:'pipeline-summary',input:{view:'current-workspaces'}}})).status,403);
  registry.grants[0].detail=true;
  Object.assign(pipelineSnapshot.board.cards[0],{clientName:'Synthetic A',owner:'Owner A',daysOpen:12,daysSinceUpdate:2,plannedAdmissionDate:null,pipelineUrl:'https://alamo-pipeline.com/?referralId=1',managementProfile:{overview:'PRIVATE_ASSESSMENT'}});
  const detailStep={id:'workspace-detail',capability:'pipeline-summary',input:{view:'current-workspaces',query:'Owner A',stage:'assessment'}};
  const workspace=await connection.read(user,scope,detailStep);
  assert.equal(workspace.requiresDetail,true);assert.equal(workspace.dataset.rows.length,1);
  assert.equal(workspace.dataset.rows[0].client,'Synthetic A');assert(!workspace.answer.includes('PRIVATE_ASSESSMENT'));
  registry.grants[0].detail=false;
  const historyStep={id:'history',capability:'pipeline-summary',input:{view:'monthly-history'}};
  assert.equal((await connection.read(user,scope,historyStep)).status,'unavailable','portfolio history cannot answer a community-scoped request');
  pipelineSnapshot.generatedAt='2026-11-24T15:00:00Z';
  pipelineSnapshot.history={coverageStartMonth:'2026-09',monthly:[{month:'2026-09',received:9,accepted:6,declined:1,admitted:4},{month:'2026-10',received:10,accepted:7,declined:2,admitted:5},{month:'2026-11',received:8,accepted:5,declined:1,admitted:3}]};
  const savedCommunities=[...registry.grants[0].communityIds];registry.grants[0].communityIds=ALAMO_FACILITIES.map(f=>f.facilityId);
  const historicalScope={communityIds:registry.grants[0].communityIds,from:'2026-09-01',through:'2026-10-31'};
  const pipelineHistory=await connection.read(user,historicalScope,historyStep);
  assert.equal(pipelineHistory.coverage,'complete');assert.equal(pipelineHistory.dataset.rows.length,2);assert.equal(pipelineHistory.dataset.rows[1].admitted,5);
  assert.equal((await connection.read(user,{...historicalScope,from:'2026-01-01'},historyStep)).coverage,'partial');
  assert.equal((await connection.read(user,{...historicalScope,from:'2026-10-15'},historyStep)).status,'unavailable');
  registry.grants[0].communityIds=savedCommunities;

  const partialMonth=await sources.read({...input,step:{...step,input:{slice:'census_monthly_by_community',operation:'sum',measure:'census',groupBy:['month'],dateField:'month'}}},auth);
  assert.equal(partialMonth.status,'unavailable');assert.equal(partialMonth.coverage,'partial');assert.equal(partialMonth.answer,null);assert.equal(partialMonth.dataset,undefined);assert.match(partialMonth.note,/partial month/);
  await assert.rejects(sources.read({...input,step:{...step,input:{slice:'census_monthly_by_community',operation:'sum',measure:'census',dateField:'month'}}},auth),/across dates/);
  const originalMonthlyRows=published.toolContext.tables.census_monthly_by_community, originalMonthlyCount=aggregate.row_count;
  // Narrow month comparisons remain valid within a page ending mid-month.
  published.toolContext.tables.census_monthly_by_community = [
    {facility_id:'337',month:'2026-08',census:37},
    {facility_id:'337',month:'2026-09',census:38},
    {facility_id:'337',month:'2026-10',census:39},
    {facility_id:'337',month:'2026-11',census:40}
  ];
  aggregate.row_count=4;
  const monthStep={id:'months',capability:'platform-data',input:{slice:'census_monthly_by_community',operation:'rows',columns:['month','census'],dateField:'month',filters:[{field:'month',op:'gte',value:'2026-09'},{field:'month',op:'lte',value:'2026-10'}]}};
  const broadScope={...scope,from:'2026-01-01',through:'2026-11-24'};
  const monthAnswer=await connection.read(user,broadScope,monthStep);
  assert.equal(monthAnswer.status,'verified');
  assert.equal(monthAnswer.period,'2026-09-01–2026-10-31');
  assert.deepEqual(monthAnswer.dataset.rows,[{month:'2026-09',census:38},{month:'2026-10',census:39}]);
  assert.equal(monthAnswer.dataset.shape,'series');
  const cut=await connection.read(user,{...broadScope,from:'2026-09-15'},monthStep);
  assert.equal(cut.status,'unavailable','query dates cannot expand the authorized interval');
  const projectedAggregate=await connection.read(user,broadScope,{...monthStep,input:{...monthStep.input,operation:'average',measure:'census'}});
  assert.equal(projectedAggregate.status,'verified');assert.equal(projectedAggregate.dataset.rows[0].result,38.5,'redundant projection cannot change aggregate population');
  await assert.rejects(connection.read(user,broadScope,{...monthStep,input:{...monthStep.input,operation:'average',measure:'census',columns:['nonexistent']}}),error=>error.statusCode===403,'redundant projection cannot bypass the grant field boundary');
  const {columns:_columns,...repaired}=monthStep.input;
  const repairedAnswer=await connection.read(user,broadScope,{...monthStep,input:{...repaired,operation:'average',measure:'census'}});
  assert.equal(repairedAnswer.dataset.rows[0].result,38.5,'valid repaired query reads the same bounded population');
  const measureOrder=await connection.read(user,broadScope,{...monthStep,input:{...repaired,operation:'average',measure:'census',orderBy:[{field:'census',direction:'desc'}]}});
  assert.equal(measureOrder.status,'verified');assert.equal(measureOrder.dataset.rows[0].result,38.5);
  const badOrder=await connection.read(user,broadScope,{...monthStep,input:{...repaired,operation:'statistics',measure:'census',orderBy:[{field:'census',direction:'desc'}]}});
  assert.equal(badOrder.status,'unavailable');assert.match(badOrder.note,/returned fields/);
  assert(!JSON.stringify(monthAnswer).includes('private_case_note'),'private schema coverage cannot escape the authorized projection');

  published.toolContext.tables.census_monthly_by_community=originalMonthlyRows;aggregate.row_count=originalMonthlyCount;
  const originalDetail=registry.grants[0].detail;
  registry.grants[0].detail=true;registry.grants[0].slices.push('services_provided');
  published.toolContext.manifest.push({slice_name:'services_provided',grain:'resident_service_month',row_count:2,min_period:'2026-03-01',max_period:'2026-04-01',fields:['Facility','month_bucket','service_date','service_minutes','service_visits']});
  published.toolContext.tables.services_provided=[{Facility:'337',month_bucket:'2026-03',service_date:'2026-03-01',service_minutes:60,service_visits:3},{Facility:'337',month_bucket:'2026-04',service_date:'2026-04-01',service_minutes:80,service_visits:4}];
  const archivedStep={id:'archive',capability:'platform-data',input:{slice:'services_provided',operation:'sum',measure:'service_visits',filters:[{field:'month_bucket',op:'eq',value:'2026-04'}]}};
  const archived=await connection.read(user,broadScope,archivedStep);
  assert.equal(archived.status,'verified');assert.equal(archived.dataset.rows[0].result,4);
  const lateArchive=await connection.read(user,broadScope,{...archivedStep,input:{...archivedStep.input,filters:[{field:'month_bucket',op:'eq',value:'2026-10'}]}});
  assert.equal(lateArchive.status,'unavailable');assert.match(lateArchive.note,/unavailable, not zero/);
  const falseDaily=await connection.read(user,broadScope,{...archivedStep,input:{...archivedStep.input,dateField:'service_date'}});
  assert.equal(falseDaily.status,'unavailable');assert.match(falseDaily.note,/not an individual visit/);
  registry.grants[0].detail=originalDetail;registry.grants[0].slices.pop();published.toolContext.manifest.pop();delete published.toolContext.tables.services_provided;

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
assert.deepEqual(occupancy.dataset.rows,[{community:'San Pablo',census:2,operatingCapacity:175,availableBeds:173,occupancyPercent:1.1,capacityAsOf:'2026-07-30'},{community:'Turlock',census:2,operatingCapacity:84,availableBeds:82,occupancyPercent:2.4,capacityAsOf:'2026-07-30'}]);
assert(!JSON.stringify(occupancy).includes('PRIVATE_PERSON_PROBE'));assert(!occupancy.answer.includes('Santa Clarita'));
assert.equal((await readView('occupancy',{...flowScope,through:'2026-11-02'})).period,'Current census as of 2026-11-21','current occupancy is labeled as the source snapshot, not a historical denominator');
const ordinary=await readView('communities');
assert.deepEqual(ordinary.dataset.rows.map(r=>[r.community,r.admissions,r.discharges]),[['San Pablo',2,1],['Turlock',2,1]]);
assert.deepEqual(JSON.parse(ordinary.answer).sites.map(site=>[site.completedStayCount,site.averageCompletedStayDays,site.medianCompletedStayDays]),[[1,1,1],[1,1,1]],'the canonical flow already owns completed-stay statistics; do not approximate from a bounded row sample');
const flowCatalog=await createPlatformReportSources({snapshot:async()=>flowSnapshot,summary:async()=>({})}).catalog({...flowAuthorization,grant:{detail:false,capabilities:['resident-flow'],slices:[]}});
assert.match(flowCatalog[0].description,/averageCompletedStayDays.*medianCompletedStayDays/,'derived completed-stay measures must be discoverable before guessing a new query');
await assert.rejects(readView('invented'),/supported resident-flow view/);
delete flowSnapshot.reportsSummary.toolContext.tables.resident_episode_history[1].admission_county;
const unavailableCounty=await readView('counties');assert.equal(unavailableCounty.coverage,'partial');assert.deepEqual(unavailableCounty.dataset.rows,[]);
flowSnapshot.snapshot.as_of_date='2026-06-30';
flowSnapshot.reportsSummary.toolContext.tables.census_weekly_by_community=ALAMO_FACILITIES.map(f=>({facility_id:f.facilityId,census_date:'2026-06-30',census:1}));
const historical=await readView('occupancy');assert.equal(historical.coverage,'partial');assert(historical.dataset.rows.every(r=>r.operatingCapacity===null&&r.availableBeds===null),'current operating limits cannot be applied before their effective dates');
console.log('Executive views: scoped admission counties, actual occupancy limits, unavailable history, and aggregate privacy passed.');

// The real weekly briefing owns schedule membership and date boundaries. Ally
// receives community totals only, never its client/owner/contact fields.
const schedule = {
  status: 'connected', generatedAt: '2026-11-23T14:00:00Z',
  metrics: {activeReferrals:3}, board: { total:3, truncated:false, cards: [
    {column:'decision',status:'Accepted, requirements open',community:'San Pablo',plannedAdmissionDate:null,flags:{}},
    {column:'in_progress',status:'Assessment underway',community:'San Pablo',plannedAdmissionDate:null,flags:{}},
    {column:'decision',status:'Accepted, requirements open',community:'Santa Clarita',plannedAdmissionDate:null,flags:{}}
  ] }, history: { monthly: [] },
  briefing: { status: 'ready', timezone: 'America/Los_Angeles', windowEnd: '2026-11-23',
    weekStart: '2026-11-23', weekEnd: '2026-11-29', coverage: { moveIns: true },
    recentReferrals: [], upcomingAssessments: [], admittedLastWeek: [], movingThrough: [], weeklyTrend: [],
    plannedMoveIns: [
      ['San Pablo', '2026-11-23', 'Accepted'], ['San Pablo', '2026-11-29', 'Accepted'],
      ['Turlock', '2026-11-24', 'Accepted'], ['Santa Clarita', '2026-11-25', 'Accepted'],
      ['San Pablo', '2026-11-22', 'Accepted'], ['San Pablo', '2026-11-30', 'Accepted'],
      ['San Pablo', '2026-11-24', 'Cancelled'], ['San Pablo', '2026-11-25', 'Denied']
    ].map(([community, date, status], i) => ({ community, plannedAt: date+'T00:00:00', status,
      clientName: 'PRIVATE_SCHEDULE_CLIENT', owner: 'PRIVATE_OWNER', referralId: 9000+i,
      pipelineUrl: 'https://example.test/private', readiness: 'ready' })) }
};
const scheduleSnapshot = { snapshot: { as_of_date: '2026-11-23' }, reportsSummary: { toolContext: { tables: {
  community_operating_summary: ALAMO_FACILITIES.map(f => ({ facility_id: f.facilityId, census: 1 }))
} } } };
let scheduleNow = Date.parse('2026-11-23T16:00:00Z');
const scheduledSources = createPlatformReportSources({ pipeline: async()=>schedule, snapshot: async()=>scheduleSnapshot, now: ()=>scheduleNow });
const plannedStep = { id: 'planned', capability: 'pipeline-summary', input: { view: 'planned-admissions' } };
const readPlanned = (ids=['337','344']) => scheduledSources.read({ scope: {...flowScope, communityIds:ids}, step: plannedStep },
  { ...flowAuthorization, communities:ids });
const planned = validateReportEvidence(await readPlanned(), plannedStep, flowScope);
assert.equal(planned.period, '2026-11-23–2026-11-29');
assert.equal(planned.coverage, 'complete');
assert.deepEqual(planned.dataset.rows, [{community:'San Pablo',plannedAdmissions:2,awaitingDate:1},{community:'Turlock',plannedAdmissions:1,awaitingDate:0}]);
assert.equal(JSON.parse(planned.answer).total, 3);
assert.equal(JSON.parse(planned.answer).awaitingDate, 1, 'only accepted active workspaces without dates belong in the unknown-week count');
assert.match(planned.note, /not confirmed admissions/);
assert(!JSON.stringify(planned).match(/PRIVATE_|9000|example\.test|Santa Clarita/), 'only scoped aggregate schedule data may leave Platform');
assert.deepEqual((await readPlanned(['342'])).dataset.rows, [{community:"Victoria's House",plannedAdmissions:0,awaitingDate:0}], 'covered zero is distinct from missing schedule coverage');
schedule.briefing.coverage.moveIns = false;
await assert.rejects(readPlanned(), /complete planned-admission schedule/);
schedule.briefing.coverage.moveIns = true;
schedule.briefing.plannedMoveIns.push({...schedule.briefing.plannedMoveIns[0],community:'Unknown'});
await assert.rejects(readPlanned(), /community scope/);
schedule.briefing.plannedMoveIns.pop();
scheduleNow = Date.parse('2026-11-30T16:00:00Z');
assert.equal((await readPlanned()).coverage, 'partial', 'a prior-week publication cannot claim to answer this week');
assert.match((await readPlanned()).note, /does not cover the current week/);
await assert.rejects(scheduledSources.read({scope:flowScope,step:{...plannedStep,input:{view:'invented'}}},flowAuthorization), /supported pipeline view/);
console.log('Planned admission view: canonical weekly schedule, scoped counts, zero/unknown coverage, boundaries, exclusions and private-field removal passed.');

// Source-owned catalog and analytical queries retain detail and date boundaries.
const analystSummary={toolContext:{manifest:[
  {slice_name:'resident_profile',grain:'current resident',row_count:3,fields:['Facility','resident_name','Age'],generated_at:'2026-11-23T13:00:00Z'},
  {slice_name:'community_operating_summary',grain:'community',row_count:1,fields:['Facility','Facility_Name','average_age'],generated_at:'2026-11-23T13:00:00Z'},
  {slice_name:'notes_summary',grain:'resident note',row_count:1,fields:['Facility','note_date','note_text'],generated_at:'2026-11-23T13:00:00Z'}
],tables:{resident_profile:[{Facility:'337',resident_name:'Fictional A',Age:20},{Facility:'337',resident_name:'Fictional B',Age:null},{Facility:'345',resident_name:'OTHER_COMMUNITY',Age:100}],community_operating_summary:[{Facility:'337',Facility_Name:'San Pablo',average_age:44.9}],notes_summary:[{Facility:'337',note_date:'2026-11-20',note_text:'Fictional note'}]}}};
const analystSources=createPlatformReportSources({summary:async()=>analystSummary,data:(q,o)=>readAllyPlatformData(q,{...o,execute:async()=>{throw Error('Offline warehouse');}})});
const analystAuth={communities:['337'],grant:{capabilities:['platform-data','data-catalog'],slices:['resident_profile','community_operating_summary','notes_summary'],detail:true},receipt:{revision:'a'.repeat(64)}};
const statisticStep={id:'source-1',capability:'platform-data',input:{slice:'resident_profile',operation:'statistics',measure:'Age'}};
const statisticEvidence=await analystSources.read({scope,step:statisticStep},analystAuth);
const badDate=await analystSources.read({scope,step:{...statisticStep,input:{...statisticStep.input,dateField:'Age'}}},analystAuth);
assert.equal(badDate.status,'unavailable');assert.match(badDate.note,/listed date dimension/);
assert.deepEqual(statisticEvidence.dataset.rows,[{records:2,known:1,missing:1,mean:20,median:20,minimum:20,maximum:20}]);
assert(!JSON.stringify(statisticEvidence).includes('OTHER_COMMUNITY'));
const discovered=JSON.parse((await analystSources.read({scope,step:{id:'catalog',capability:'data-catalog',input:{query:'age'}}},analystAuth)).answer);
const longSearch=await analystSources.read({scope,step:{id:'catalog',capability:'data-catalog',input:{query:'x'.repeat(241)}}},analystAuth);
assert.equal(longSearch.status,'unavailable');assert.match(longSearch.note,/1–240 characters/,'invalid model search text is correctable feedback, not a fake source outage');
assert.equal(longSearch.answer,null);
assert(discovered.sources.some(s=>s.id==='resident_profile'&&s.numericFields.includes('Age')));
const aggregateAuth={...analystAuth,grant:{...analystAuth.grant,detail:false,slices:['community_operating_summary']}};
const aggregateSources=await analystSources.catalog(aggregateAuth);
assert.deepEqual(aggregateSources.find(s=>s.id==='platform-data').sources.map(s=>s.id),['community_operating_summary']);
const ageEvidence=await analystSources.read({scope,step:{id:'age',capability:'platform-data',input:{slice:'community_operating_summary',operation:'rows',columns:['Facility_Name','average_age']}}},aggregateAuth);
assert.equal(ageEvidence.dataset.rows[0].average_age,44.9);assert.equal(ageEvidence.dataset.columns[1].label,'Average age');
await assert.rejects(analystSources.read({scope,step:{id:'notes',capability:'platform-data',input:{slice:'notes_summary',operation:'count',dateField:null}}},analystAuth),/require a date field/);
console.log('Analyst discovery, exact missing-age statistics, readable averages, authorized source visibility and mandatory date scope passed.');
const noteSearch={id:'notes',capability:'platform-data',input:{slice:'notes_summary',operation:'count',filters:[{field:'note_text',op:'contains',value:'transport'}]}};
const noMatchingNotes=await analystSources.read({scope,step:noteSearch},analystAuth);
assert.equal(noMatchingNotes.status,'verified');assert.equal(noMatchingNotes.dataset.rows[0].result,0);
analystSummary.toolContext.tables.notes_summary[0].note_text=null;
const unknownMatchingNotes=await analystSources.read({scope,step:noteSearch},analystAuth);
assert.equal(unknownMatchingNotes.status,'unavailable');assert.equal(unknownMatchingNotes.answer,null);assert.equal(unknownMatchingNotes.dataset,undefined);
assert.match(unknownMatchingNotes.note,/cannot be determined.*not a zero result/);
const noteCount=await analystSources.read({scope,step:{...noteSearch,input:{slice:'notes_summary',operation:'count'}}},analystAuth);
assert.equal(noteCount.dataset.rows[0].result,1,'missing text does not erase the existence of the note');
analystSummary.toolContext.tables.notes_summary[0].note_text='SOURCE_TEXT_PRIVATE '.repeat(6000);
const oversized=await analystSources.read({scope,step:{id:'notes',capability:'platform-data',input:{slice:'notes_summary',operation:'rows',limit:1}}},analystAuth);
assert.equal(oversized.status,'unavailable');assert.equal(oversized.answer,null);assert.match(oversized.note,/fewer rows and columns/);assert(!JSON.stringify(oversized).includes('SOURCE_TEXT_PRIVATE'));
console.log('Oversized source selections produce bounded refinement feedback without exposing their body or inventing an empty result.');


// The source must not normalize/copy every private row just to list datasets.
const leanPublication={toolContext:{manifest:[{slice_name:'community_operating_summary',grain:'community',row_count:1,fields:['Facility','Facility_Name','census'],generated_at:'2026-11-23T13:00:00Z'}],tables:{community_operating_summary:[{Facility:'337',Facility_Name:'J.C. Wallace',census:7}]}}};
Object.defineProperty(leanPublication,'unrelatedClinicalRows',{enumerable:true,get(){throw Error('Full publication was traversed');}});
const leanSource=createPlatformReportSources({snapshot:async()=>({reportsSummary:leanPublication}),data:(query,options)=>readAllyPlatformData(query,{...options,execute:async()=>{throw Error('Complete snapshot must be sufficient');}})});
const leanAuth={communities:['337'],grant:{capabilities:['platform-data'],slices:['community_operating_summary'],detail:false},receipt:{revision:'a'.repeat(64)}};
assert.equal((await leanSource.catalog(leanAuth))[0].sources.length,1);
const leanResult=await leanSource.read({scope,step:{id:'lean',capability:'platform-data',input:{slice:'community_operating_summary',operation:'rows',columns:['Facility_Name','census']}}},leanAuth);
const {normalizeKnownCommunityNames}=await import('../shared/community-names.mjs');
assert.equal(leanResult.dataset.rows[0].Facility_Name,normalizeKnownCommunityNames('J.C. Wallace'));
assert.equal(leanResult.dataset.rows[0].census,7);
assert(!leanResult.answer.includes('unrelatedClinicalRows'));
console.log('Catalog and bounded results skip unrelated clinical rows while preserving readable community names.');

const labelFilter=await leanSource.read({scope,step:{id:'filtered',capability:'platform-data',input:{slice:'community_operating_summary',operation:'count',filters:[{field:'Facility_Name',op:'eq',value:normalizeKnownCommunityNames('J.C. Wallace')}]}}},leanAuth);
assert.equal(labelFilter.dataset.rows[0].result,1,'canonical community filters work before as well as after projection');

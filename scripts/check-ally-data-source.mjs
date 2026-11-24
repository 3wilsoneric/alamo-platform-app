import assert from "node:assert/strict";
import { compileAllyPlatformDataQuery, listAllyPlatformDataSources, readAllyPlatformData } from "../server/ally-data-source.mjs";

const summary = { toolContext: {
  manifest: [{ slice_name: "notes_summary", grain: "resident_note_detail", row_count: 4,
    min_period: "2026-01", max_period: "2026-10", fields: ["Facility", "Res_Number", "note_date", "note_text"] },
  { slice_name: "unreviewed_table", grain: "unknown", row_count: 1, fields: ["secret"] }],
  tables: { notes_summary: [
    { Facility: "337", Res_Number: "10", note_date: "2026-10-01", note_text: "Follow-up planned" },
    { Facility: "337", Res_Number: "10", note_date: "2026-10-02", note_text: "Medication review" }
  ] }
} };
const catalog = listAllyPlatformDataSources(summary);
assert.equal(catalog.length, 1);
assert.equal(catalog[0].sourceRows, 4);
assert.equal(catalog[0].snapshotRows, 2);
assert.throws(() => compileAllyPlatformDataQuery({ slice: "unreviewed_table" }, { id: "unreviewed_table", fields: ["secret"] }), /listed Platform source/);
const safe = compileAllyPlatformDataQuery({ slice: "notes_summary", filters: [{ field: "note_text", op: "contains", value: "'; DROP TABLE foo;--" }] }, catalog[0]);
assert.doesNotMatch(safe.sql, /DROP TABLE/);
assert.match(safe.sql, /unbase64/);
assert.throws(() => compileAllyPlatformDataQuery({ slice: "notes_summary", filters: [{ field: "note_text", op: "gte", value: "A" }] }, catalog[0]), /bounded source filters/);

const load = async () => summary;
const fail = async () => { throw Error("Warehouse unavailable"); };
const rows = await readAllyPlatformData({ slice: "notes_summary", filters: [{ field: "Res_Number", op: "eq", value: "10" }], limit: 1 }, { load, execute: fail });
assert.equal(rows.returnedRows, 1);
assert.equal(rows.hasMore, true);
assert.match(rows.coverage, /partial: 2 of 4/);
await assert.rejects(readAllyPlatformData({ slice: "notes_summary", operation: "count", filters: [{ field: "Facility", op: "eq", value: "337" }] }, { load, execute: fail }), /incomplete published sample/);
const warehouse = await readAllyPlatformData({ slice: "notes_summary", operation: "count" }, { load, execute: async sql => {
  assert.match(sql, /v_tool_notes_summary/); return [{ result: 4 }];
} });
assert.equal(warehouse.coverage, "source-query");
assert.equal(warehouse.rows[0].result, 4);
const allowedFields=['Facility','note_date'];
const restricted=await readAllyPlatformData({slice:'notes_summary',operation:'rows'}, {load,execute:async sql=>{
  assert.match(sql,/SELECT `Facility`, `note_date` FROM/);assert.doesNotMatch(sql,/SELECT \*/);
  return [{Facility:'337',note_date:'2026-10-01',note_text:'PRIVATE_PROBE',undeclared:'UNDECLARED_PROBE'}];
},allowedFields});
assert.deepEqual(restricted.rows,[{Facility:'337',note_date:'2026-10-01'}]);assert.deepEqual(restricted.source.fields,allowedFields);
const restrictedFallback=await readAllyPlatformData({slice:'notes_summary',operation:'rows'}, {load,execute:fail,allowedFields});
assert.deepEqual(restrictedFallback.rows,summary.toolContext.tables.notes_summary.map(row=>({Facility:row.Facility,note_date:row.note_date})));
await assert.rejects(readAllyPlatformData({slice:'notes_summary',filters:[{field:'note_text',op:'contains',value:'private'}]}, {load,execute:fail,allowedFields}),/bounded source filters/);
await assert.rejects(readAllyPlatformData({slice:'notes_summary'}, {load,allowedFields:['unregistered_field']}),/authorized source fields/);

// Actual publisher shape: raw manifest names and normalized snapshot rows.
const operating = {toolContext:{manifest:[{slice_name:'community_operating_summary',grain:'community',row_count:2,
  fields:['Facility','Facility_Name','census','private_note']}],tables:{community_operating_summary:[
  {facility_id:'337',facility_name:'San Pablo',census:153,private_note:'PRIVATE_PROBE'},
  {facility_id:'345',facility_name:'Santa Clarita',census:136,private_note:'OTHER_COMMUNITY'}
]}}};
const scoped = {load:async()=>operating,execute:fail,allowedFields:['Facility','Facility_Name','census'],constraints:[{field:'Facility',op:'in',value:['337']}]};
const fixed = await readAllyPlatformData({slice:'community_operating_summary',operation:'rows'},scoped);
assert.deepEqual(fixed.rows,[{Facility:'337',Facility_Name:'San Pablo',census:153}]);
assert(!JSON.stringify(fixed).includes('PRIVATE_PROBE'));assert(!JSON.stringify(fixed).includes('OTHER_COMMUNITY'));
const grouped = await readAllyPlatformData({slice:'community_operating_summary',operation:'sum',measure:'census',groupBy:['Facility_Name']},scoped);
assert.deepEqual(grouped.rows,[{Facility_Name:'San Pablo',result:153}]);
operating.toolContext.tables.community_operating_summary[0].Facility='345';
await assert.rejects(readAllyPlatformData({slice:'community_operating_summary',operation:'count'},scoped),/dimensions conflict/);
delete operating.toolContext.tables.community_operating_summary[0].Facility;
delete operating.toolContext.tables.community_operating_summary[0].facility_id;
await assert.rejects(readAllyPlatformData({slice:'community_operating_summary',operation:'count'},scoped),/required query field/);
console.log("Ally Platform data catalog, safe query compilation, source read, and partial snapshot fallback passed.");

const profiles={toolContext:{manifest:[{slice_name:'resident_profile',grain:'current resident',row_count:5,fields:['Facility','Res_Number','Age','resident_name']}],tables:{resident_profile:[
  {Facility:'337',Res_Number:'1',Age:20,resident_name:'Synthetic A'},
  {Facility:'337',Res_Number:'2',Age:40,resident_name:'Synthetic B'},
  {Facility:'337',Res_Number:'3',Age:60,resident_name:'Synthetic C'},
  {Facility:'337',Res_Number:'4',Age:null,resident_name:'Synthetic D'},
  {Facility:'345',Res_Number:'1',Age:100,resident_name:'OTHER_COMMUNITY'}
]}}};
const profileOptions={load:async()=>profiles,execute:fail,constraints:[{field:'Facility',op:'in',value:['337']}]};
for(const [operation,expected] of [['average',40],['median',40],['minimum',20],['maximum',60],['distinct',3]]) {
  const read=await readAllyPlatformData({slice:'resident_profile',operation,measure:'Age'},profileOptions);
  assert.deepEqual(read.rows,[{result:expected}]);
}
const statistics=await readAllyPlatformData({slice:'resident_profile',operation:'statistics',measure:'Age'},profileOptions);
assert.deepEqual(statistics.rows,[{records:4,known:3,missing:1,mean:40,median:40,minimum:20,maximum:60}]);
const emptyStatistics=await readAllyPlatformData({slice:'resident_profile',operation:'statistics',measure:'Age',filters:[{field:'Age',op:'number-gte',value:'120'}]},profileOptions);
assert.deepEqual(emptyStatistics.rows,[{records:0,known:0,missing:0,mean:null,median:null,minimum:null,maximum:null}]);
const selected=await readAllyPlatformData({slice:'resident_profile',operation:'rows',columns:['Age'],orderBy:[{field:'Age',direction:'desc'}],limit:2},profileOptions);
assert.deepEqual(selected.rows,[{Age:60},{Age:40}]);assert.equal(selected.hasMore,true);
const groupedSorted=await readAllyPlatformData({slice:'resident_profile',operation:'count',groupBy:['Age'],orderBy:[{field:'Age',direction:'desc'}],limit:1},profileOptions);
assert.deepEqual(groupedSorted.rows,[{Age:60,result:1}]);
const redundant=await readAllyPlatformData({slice:'resident_profile',operation:'count',columns:['Age'],limit:1},profileOptions);
const countSort={slice:'resident_profile',operation:'count',groupBy:['Age'],orderBy:[{field:'count',direction:'desc'}],limit:100};
const countProfiles=structuredClone(profiles);countProfiles.toolContext.tables.resident_profile[0].Age=60;
const sortedCounts=await readAllyPlatformData(countSort,{...profileOptions,load:async()=>countProfiles});
assert.deepEqual(sortedCounts.rows.map(row=>row.result),[2,1,1],'count alias sorts aggregate counts, not input ages');
assert.match(compileAllyPlatformDataQuery(countSort,listAllyPlatformDataSources(profiles)[0],profileOptions.constraints).sql,/ORDER BY `result` DESC/,'SQL and snapshot use the same unambiguous count alias');
assert.deepEqual(redundant.rows,[{result:4}],'projection and output limit cannot truncate the scoped input population');
assert.deepEqual(redundant.query.columns,['result']);
const ranked=compileAllyPlatformDataQuery({slice:'resident_profile',operation:'average',measure:'Age',groupBy:['Facility'],columns:['Age'],orderBy:[{field:'Age',direction:'desc'}]},listAllyPlatformDataSources(profiles)[0],profileOptions.constraints);
assert.match(ranked.sql,/ORDER BY `result` DESC/);assert.deepEqual(ranked.columns,['Facility','result']);
for(const query of [{operation:'count',columns:['password']},{operation:'statistics',measure:'Age',orderBy:[{field:'Age',direction:'desc'}]}])await assert.rejects(readAllyPlatformData({slice:'resident_profile',...query},profileOptions));
const numeric=compileAllyPlatformDataQuery({slice:'resident_profile',operation:'statistics',measure:'Age',filters:[{field:'Age',op:'number-lte',value:'50'}]},listAllyPlatformDataSources(profiles)[0],profileOptions.constraints);
assert.match(numeric.sql,/COUNT\(\*\) AS records/);assert.match(numeric.sql,/PERCENTILE_CONT\(0\.5\)/);assert.match(numeric.sql,/try_cast\(`Age` AS DOUBLE\) <= 50/);assert.match(numeric.sql,/`Facility`/);
for(const query of [{columns:['password']},{orderBy:[{field:'Age; DROP TABLE x',direction:'desc'}]},{filters:[{field:'Age',op:'number-gte',value:'0 OR 1=1'}]}]) await assert.rejects(readAllyPlatformData({slice:'resident_profile',...query},profileOptions));
console.log('Analyst statistics, missing ages, scope, projected columns, numeric filters, ranking and SQL injection boundaries passed.');

// Publisher null-to-zero coercion must never become a fabricated zero age.
const publishedProfiles=structuredClone(profiles);
publishedProfiles.toolContext.manifest[0].generated_at='2026-11-23T13:00:00Z';
publishedProfiles.toolContext.tables.resident_profile=profiles.toolContext.tables.resident_profile.map(({Facility,Res_Number,Age,resident_name})=>({facility_id:Facility,res_number:Res_Number,age:Age??0,resident_name}));
let warehouseReads=0;
const faithfulOptions={...profileOptions,load:async()=>publishedProfiles,execute:async()=>{warehouseReads++;return statistics.rows;}};
const faithful=await readAllyPlatformData({slice:'resident_profile',operation:'statistics',measure:'Age'},faithfulOptions);
assert.equal(warehouseReads,1);assert.equal(faithful.readMode,'governed-view');assert.deepEqual(faithful.rows,statistics.rows);
await assert.rejects(readAllyPlatformData({slice:'resident_profile',operation:'average',measure:'Age'},{...faithfulOptions,execute:fail}),/missing value from zero/);
const complete=structuredClone(profiles);complete.toolContext.manifest[0].generated_at='2026-11-23T13:00:00Z';
let unnecessaryReads=0;
const fast=await readAllyPlatformData({slice:'resident_profile',operation:'statistics',measure:'Age'},{...profileOptions,load:async()=>complete,execute:async()=>{unnecessaryReads++;throw Error('Must use complete faithful snapshot');}});
assert.equal(unnecessaryReads,0);assert.deepEqual(fast.rows,statistics.rows);assert.equal(fast.readMode,'published-snapshot');
console.log('Complete faithful snapshots avoid the warehouse; lossy zero ages require the full view and fail closed on outage.');
const lossless = structuredClone(publishedProfiles);
lossless.toolContext.manifest[0].nullable_fields = ['Age'];
lossless.toolContext.tables.resident_profile[0].age = 0;
lossless.toolContext.tables.resident_profile[3].age = null;
const losslessOptions = { ...profileOptions, load: async () => lossless, snapshotOnly: true, execute: async () => assert.fail('Prepared facts must never query the warehouse') };
const nullable = await readAllyPlatformData({ slice: 'resident_profile', operation: 'statistics', measure: 'Age' }, losslessOptions);
assert.deepEqual(nullable.rows, [{ records: 4, known: 3, missing: 1, mean: 100 / 3, median: 40, minimum: 0, maximum: 60 }]);
await assert.rejects(readAllyPlatformData({ slice: 'resident_profile', operation: 'statistics', measure: 'Age' }, { ...losslessOptions, load: async () => publishedProfiles }), /lossless published answer/);
lossless.toolContext.manifest[0].row_count = 6;
await assert.rejects(readAllyPlatformData({ slice: 'resident_profile', operation: 'statistics', measure: 'Age' }, losslessOptions), /lossless published answer/);
const otherCommunity=await readAllyPlatformData({slice:'resident_profile',operation:'statistics',measure:'Age'},{...faithfulOptions,constraints:[{field:'Facility',op:'in',value:['345']}],execute:async()=>{throw Error('An unrelated community must not force a warehouse read.');}});
assert.equal(otherCommunity.readMode,'published-snapshot');assert.deepEqual(otherCommunity.rows,[{records:1,known:1,missing:0,mean:100,median:100,minimum:100,maximum:100}]);
const flags={toolContext:{manifest:[{slice_name:'mar_exception_detail_90d',grain:'event',row_count:1,fields:['Facility','is_refusal'],generated_at:'2026-11-23T13:00:00Z'}],tables:{mar_exception_detail_90d:[{facility_id:'337',is_refusal:true}]}}};
const flagQuery={slice:'mar_exception_detail_90d',operation:'count',filters:[{field:'is_refusal',op:'eq',value:'1'}]};
const flagResult=await readAllyPlatformData(flagQuery,{load:async()=>flags,execute:async()=>[{result:1}]});
assert.equal(flagResult.readMode,'governed-view');assert.deepEqual(flagResult.rows,[{result:1}]);
await assert.rejects(readAllyPlatformData(flagQuery,{load:async()=>flags,execute:fail}),/coerced the original numeric flag/);

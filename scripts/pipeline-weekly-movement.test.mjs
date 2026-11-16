import assert from 'node:assert/strict';
import test from 'node:test';
import { pipelineWeeklyMovement } from '../server/pipeline-weekly-movement.mjs';
const communities = [{community_id:'337',community_name:'San Pablo'},{community_id:'338',community_name:'Santa Clarita'}];
const snapshot = rows => ({reportsSummary:{toolContext:{tables:{resident_flow_weekly_by_community:rows}}}});
const row = (id, admissions, discharges) => ({week_start:'2026-11-09',facility_id:id,admissions,discharges,resident_names:'MUST NOT LEAK'});
test('published counts match community totals and do not copy names', () => {
 const [week] = pipelineWeeklyMovement(snapshot([row('337',3,1),row('338','2','4')]),communities,'2026-11-16');
 assert.equal(week.complete,true); assert.equal(week.week_end,'2026-11-15');
 assert.equal(week.communities.reduce((n,r)=>n+r.admissions,0),5);
 assert.equal(week.communities.reduce((n,r)=>n+r.discharges,0),5);
 assert.equal(JSON.stringify(week).includes('MUST NOT LEAK'),false);
});
test('missing, duplicate, invalid and partial rows cannot claim complete flow', () => {
 for(const rows of [[row('337',0,0)],[row('337',0,0),row('337',0,0),row('338',0,0)],[row('337',-1,1),row('338',0,0)],[row('337',null,1),row('338',0,0)]]) {
  const [week]=pipelineWeeklyMovement(snapshot(rows),communities,'2026-11-16'); assert.equal(week.complete,false);
  assert.ok(week.communities.some(row=>row.admissions===null));
 }
 assert.equal(pipelineWeeklyMovement(snapshot([row('337',0,0),row('338',0,0)]),communities,'2026-11-15')[0].complete,false);
 assert.deepEqual(pipelineWeeklyMovement({},communities,'2026-11-16'),[]);
});

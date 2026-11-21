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
const count = await readAllyPlatformData({ slice: "notes_summary", operation: "count", filters: [{ field: "Facility", op: "eq", value: "337" }] }, { load, execute: fail });
assert.equal(count.rows[0].result, 2);
assert.match(count.coverage, /partial/);
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
console.log("Ally Platform data catalog, safe query compilation, source read, and partial snapshot fallback passed.");

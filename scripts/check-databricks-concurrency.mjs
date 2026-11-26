import assert from 'node:assert/strict';
import {test,mock} from 'node:test';

// Fake SDK only: no network, no credentials.
const clients=[],executed=[];
mock.module('@databricks/sql',{namedExports:{DBSQLClient:class {
  constructor(){this.closed=false;this.connects=0;this.sessions=[];clients.push(this);}
  async connect(options){this.connects++;this.options=options;return this;}
  async openSession(config){
    const client=this,session={closed:false,busy:false,config,async executeStatement(sql,options){
      assert.equal(session.closed,false,'A closed session is never reused.');
      assert.equal(session.busy,false,'A session runs one statement at a time.');
      session.busy=true;executed.push({sql,options});
      await new Promise(resolve=>setTimeout(resolve,sql==='slow'?20:sql==='hang'?400:1));
      assert.equal(client.closed,false,'A concurrent request must not close this connection.');
      return {cancelled:false,async fetchAll(){if(sql==='fail')throw Error('SQL failure');return [{result:sql}];},async cancel(){this.cancelled=true;},async close(){session.busy=false;}};
    },async close(){this.closed=true;}};
    this.sessions.push(session);return session;
  }
  async close(){this.closed=true;for(const session of this.sessions)session.closed=true;}
}}});
process.env.DATABRICKS_HOST='warehouse.example.invalid';
process.env.DATABRICKS_HTTP_PATH='/sql/1.0/warehouses/fictional';
process.env.DATABRICKS_CLIENT_ID='fixture-client';
process.env.DATABRICKS_CLIENT_SECRET='fixture-not-a-real-credential';
process.env.DATABRICKS_STATEMENT_TIMEOUT_SECONDS='45';
const {queryDatabricks,queryDatabricksOAuth,closeDatabricksPools,createQueryResultCache,getDatabricksQueryTimings}=await import('../server/databricks.mjs');
const sessions=()=>clients.flatMap(client=>client.sessions);

test('concurrent reads share one pooled connection on independent sessions; nothing closes another request',async()=>{
  const rows=await Promise.all([queryDatabricksOAuth('slow'),queryDatabricksOAuth('fast')]);
  assert.deepEqual(rows,[[{result:'slow'}],[{result:'fast'}]]);
  assert.equal(clients.length,1);assert.equal(clients[0].connects,1,'one connect/OAuth handshake');
  assert.equal(sessions().length,2);assert(sessions().every(session=>!session.closed&&!session.busy),'healthy sessions return to the pool');
  assert.equal(sessions()[0].config.configuration.STATEMENT_TIMEOUT,'45','warehouse statement timeout is set per session');
  assert.equal(executed[0].options.queryTimeout,45);
});

test('warm reads reuse a session; a failed statement discards only its session',async()=>{
  assert.deepEqual(await queryDatabricksOAuth('warm'),[{result:'warm'}]);
  assert.equal(sessions().length,2,'no new session or connection for a warm read');
  assert.equal(getDatabricksQueryTimings().at(-1).reusedSession,true);
  await assert.rejects(queryDatabricksOAuth('fail'),/SQL failure/);
  assert.equal(sessions().filter(session=>session.closed).length,1,'the failed session is closed');
  assert.equal(clients[0].closed,false,'the shared connection stays open');
  assert.deepEqual(await queryDatabricksOAuth('after'),[{result:'after'}]);
});

test('a statement past the client timeout is cancelled and its session discarded',async()=>{
  process.env.DATABRICKS_CLIENT_TIMEOUT_MS='50';
  try { await assert.rejects(queryDatabricksOAuth('hang'),error=>error.code==='databricks_statement_timeout'); }
  finally { delete process.env.DATABRICKS_CLIENT_TIMEOUT_MS; }
  await new Promise(resolve=>setTimeout(resolve,450));
  assert.deepEqual(await queryDatabricksOAuth('next'),[{result:'next'}]);
  assert.equal(clients[0].closed,false);
});

test('a configuration change retires the old pool; shutdown closes everything',async()=>{
  process.env.DATABRICKS_CLIENT_ID='fixture-client-2';
  assert.deepEqual(await queryDatabricksOAuth('rotated'),[{result:'rotated'}]);
  await new Promise(resolve=>setTimeout(resolve,5));
  assert.equal(clients.length,2);assert.equal(clients[0].closed,true,'old identity connection is closed after release');
  await closeDatabricksPools();
  assert(clients.every(client=>client.closed));
});

test('result cache: keyed by SQL and revision, copies only, opt-in',async()=>{
  const before=executed.length;
  const first=await queryDatabricks('cached',{cacheRevision:'2026-11-25T00:00:00Z'});
  first[0].result='mutated';
  assert.deepEqual(await queryDatabricks('cached',{cacheRevision:'2026-11-25T00:00:00Z'}),[{result:'cached'}]);
  assert.equal(executed.length,before+1,'warm identical query is served from cache');
  await queryDatabricks('cached',{cacheRevision:'2026-11-26T00:00:00Z'});
  await queryDatabricks('cached');
  assert.equal(executed.length,before+3,'a new revision or no revision always executes');
  let clock=0,runs=0;const cache=createQueryResultCache({now:()=>clock,ttlMs:1000});
  const run=async()=>{runs++;return [{n:runs}];};
  await Promise.all([cache('q',{revision:'r'},run),cache('q',{revision:'r'},run)]);assert.equal(runs,1,'concurrent identical queries share one execution');
  clock=999;await cache('q',{revision:'r'},run);assert.equal(runs,1);
  clock=1000;await cache('q',{revision:'r'},run);assert.equal(runs,2,'entries expire at the TTL');
  await closeDatabricksPools();
});

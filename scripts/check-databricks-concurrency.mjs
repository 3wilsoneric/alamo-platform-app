import assert from 'node:assert/strict';
import {test,mock} from 'node:test';

const clients=[];
mock.module('@databricks/sql',{namedExports:{DBSQLClient:class {
  constructor(){this.closed=false;this.sessions=[];clients.push(this);}
  async connect(){return this;}
  async openSession(){
    const client=this,session={closed:false,async executeStatement(sql){
      await new Promise(resolve=>setTimeout(resolve,sql==='slow'?20:1));
      assert.equal(client.closed,false,'A concurrent request must not close this connection.');
      return {async fetchAll(){return [{result:sql}];},async close(){}};
    },async close(){this.closed=true;}};
    this.sessions.push(session);return session;
  }
  async close(){this.closed=true;for(const session of this.sessions)session.closed=true;}
}}});
process.env.DATABRICKS_HOST='warehouse.example.invalid';
process.env.DATABRICKS_HTTP_PATH='/sql/1.0/warehouses/fictional';
process.env.DATABRICKS_CLIENT_ID='fixture-client';
process.env.DATABRICKS_CLIENT_SECRET='fixture-not-a-real-credential';
const {queryDatabricksOAuth}=await import('../server/databricks.mjs');
test('concurrent warehouse reads own independent connections and clean up both',async()=>{
  const rows=await Promise.all([queryDatabricksOAuth('slow'),queryDatabricksOAuth('fast')]);
  assert.deepEqual(rows,[[{result:'slow'}],[{result:'fast'}]]);
  assert.equal(clients.length,2);assert(clients.every(client=>client.closed&&client.sessions.every(session=>session.closed)));
});

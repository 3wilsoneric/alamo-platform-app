import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {BlobClient} from '@azure/storage-blob';
import {readSourceGrantDocument, createSourceGrantReader} from '../server/platform-agent-source-grants.mjs';

let value=Buffer.from(JSON.stringify({version:1,grants:[]}));
const server=createServer((req,res)=>{
  const match=/bytes=(\d+)-(\d+)/.exec(req.headers['x-ms-range']??req.headers.range??'');
  const from=match?Number(match[1]):0,through=match?Math.min(Number(match[2]),value.length-1):value.length-1;
  const body=value.subarray(from,through+1);
  res.writeHead(match?206:200,{'Content-Type':'application/json','Content-Length':body.length,'Content-Range':`bytes ${from}-${through}/${value.length}`,'ETag':'"fixture"'});
  res.end(req.method==='HEAD'?undefined:body);
});
server.listen(0,'127.0.0.1');await once(server,'listening');
const client=new BlobClient(`http://127.0.0.1:${server.address().port}/synthetic/grants/report.json`,undefined,{allowInsecureConnection:true,retryOptions:{maxTries:1}});
try {
  assert.deepEqual(await readSourceGrantDocument(client),{version:1,grants:[]},'a small Azure blob is not a 65,537-byte padded document');
  value=Buffer.from(JSON.stringify({version:1,grants:[]}).padEnd(65_536,' '));
  assert.equal((await readSourceGrantDocument(client)).version,1,'the exact allowed byte count is readable');
  value=Buffer.concat([value,Buffer.from(' ')]);
  await assert.rejects(readSourceGrantDocument(client),/too large/);
  const stream=Readable.from([Buffer.alloc(40_000),Buffer.alloc(40_000)]);
  await assert.rejects(readSourceGrantDocument({download:async()=>({readableStreamBody:stream})}),/too large/,'missing size metadata cannot bypass the streamed limit');
  assert.equal(stream.destroyed,true);
  value=Buffer.from('{');await assert.rejects(readSourceGrantDocument(client),SyntaxError);
  console.log('Source grants: real Azure SDK small/exact/oversized reads, streamed bounds and invalid JSON passed.');
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

// One reusable SDK connection must not become a permission cache.
const env={PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT:'source',PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER:'grants',AZURE_CLIENT_ID:'identity'};
let connections=0,downloads=0,registry={version:1,grants:[]},unavailable=false;
const read=createSourceGrantReader({env,createContainer:(account,container,identity)=>{
  connections++;
  return {getBlobClient:blobName=>({download:async()=>{
    downloads++; if(unavailable)throw Error('Unavailable');
    return {readableStreamBody:Readable.from([Buffer.from(JSON.stringify({...registry,account,container,identity,blobName}))])};
  }})};
}});
await Promise.all([read('report'),read('workflow')]);
assert.equal(connections,1);assert.equal(downloads,2);
registry={version:1,grants:[{revoked:true}]};
assert.equal((await read('report')).grants[0].revoked,true,'revocation is visible on the next download');
assert.equal(connections,1);assert.equal(downloads,3);
unavailable=true;await assert.rejects(read('report'),/Unavailable/,'no fallback to a previously downloaded registry');unavailable=false;
for(const [key,value] of [['AZURE_CLIENT_ID','new-identity'],['PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER','new-container'],['PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT','new-account']]){
  env[key]=value;await read('report');
}
assert.equal(connections,4,'identity and storage configuration cannot reuse the old connection');
env.AZURE_STORAGE_ACCOUNT=env.PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT;env.AZURE_STORAGE_CONTAINER=env.PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER;
await assert.rejects(read('report'),/separate private container/);
delete env.AZURE_CLIENT_ID;await assert.rejects(read('report'),/Configure/);
console.log('Source connection reuse: fresh concurrent reads, revocation, outage, identity/config changes and private-container boundary passed.');

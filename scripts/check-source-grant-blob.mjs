import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {BlobClient} from '@azure/storage-blob';
import {readSourceGrantDocument, readSourceGrantBlobConditional, createSourceGrantReader} from '../server/platform-agent-source-grants.mjs';

let value=Buffer.from(JSON.stringify({version:1,grants:[]})),etag='"fixture"',bodies=0;
const server=createServer((req,res)=>{
  if(req.headers['if-none-match']===etag){res.writeHead(304,{'ETag':etag});res.end();return;}
  bodies++;
  const match=/bytes=(\d+)-(\d+)/.exec(req.headers['x-ms-range']??req.headers.range??'');
  const from=match?Number(match[1]):0,through=match?Math.min(Number(match[2]),value.length-1):value.length-1;
  const body=value.subarray(from,through+1);
  res.writeHead(match?206:200,{'Content-Type':'application/json','Content-Length':body.length,'Content-Range':`bytes ${from}-${through}/${value.length}`,'ETag':etag});
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
  value=Buffer.from(JSON.stringify({version:1,grants:[]}));bodies=0;
  const first=await readSourceGrantBlobConditional(client,null);
  assert.equal(first.etag,'"fixture"');assert.equal(bodies,1);
  assert.deepEqual(await readSourceGrantBlobConditional(client,first.etag),{notModified:true,etag:'"fixture"',document:null},'an unchanged registry is a 304 with no body');
  assert.equal(bodies,1);
  etag='"changed"';const changed=await readSourceGrantBlobConditional(client,first.etag);
  assert.equal(changed.notModified,false);assert.equal(changed.etag,'"changed"');assert.equal(bodies,2,'a changed ETag downloads the new registry');
  value=Buffer.from('{');etag='"invalid"';await assert.rejects(readSourceGrantDocument(client),SyntaxError);
  console.log('Source grants: real Azure SDK small/exact/oversized reads, streamed bounds and invalid JSON passed.');
} finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}

// The SDK connection is reused. The registry copy is bounded by max age and
// identity, never served after an outage, and revalidated on demand.
const env={PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT:'source',PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER:'grants',AZURE_CLIENT_ID:'identity'};
let connections=0,downloads=0,conditional=0,registry={version:1,grants:[]},unavailable=false,clock=1_000_000,blobEtag='"v1"';
const read=createSourceGrantReader({env,now:()=>clock,createContainer:(account,container,identity)=>{
  connections++;
  return {getBlobClient:blobName=>({download:async(_offset,_count,options)=>{
    downloads++; if(unavailable)throw Error('Unavailable');
    if(options?.conditions?.ifNoneMatch){conditional++;if(options.conditions.ifNoneMatch===blobEtag)throw Object.assign(Error('Not modified'),{statusCode:304});}
    return {etag:blobEtag,readableStreamBody:Readable.from([Buffer.from(JSON.stringify({...registry,account,container,identity,blobName}))])};
  }})};
}});
await Promise.all([read('report'),read('report'),read('workflow')]);
assert.equal(connections,1);assert.equal(downloads,2,'concurrent reads of one registry share a single download');
const cached=await read('report');cached.grants.push('mutated');
assert.equal(downloads,2,'a fresh copy is served without storage I/O');
assert.deepEqual((await read('report')).grants,[],'callers receive independent copies');
registry={version:1,grants:[{revoked:true}]};
assert.deepEqual((await read('report')).grants,[],'within max age the cached copy may be served');
assert.deepEqual((await read('report',{revalidate:true})).grants,[],'an unchanged ETag keeps the copy (304)');
assert.equal(conditional,1);assert.equal(downloads,3);
blobEtag='"v2"';
assert.equal((await read('report',{revalidate:true})).grants[0].revoked,true,'revalidation sees a revocation immediately');
assert.equal(conditional,2);assert.equal(downloads,4);
registry={version:1,grants:[]};blobEtag='"v3"';
clock+=29_999;assert.equal((await read('report')).grants[0].revoked,true,'served below the 30 s bound');
clock+=1;assert.deepEqual((await read('report')).grants,[],'expired copies are revalidated');
unavailable=true;
await assert.rejects(read('report',{revalidate:true}),/Unavailable/,'no fallback to a previously downloaded registry');
await assert.rejects(read('report'),/Unavailable/,'an outage discards the cached copy');
unavailable=false;
for(const [key,value] of [['AZURE_CLIENT_ID','new-identity'],['PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER','new-container'],['PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT','new-account']]){
  env[key]=value;const before=downloads;const document=await read('report');
  assert.equal(downloads,before+1,'a new storage identity never reuses a cached registry');assert.equal(document[key==='AZURE_CLIENT_ID'?'identity':key.endsWith('CONTAINER')?'container':'account'],value);
}
assert.equal(connections,4,'identity and storage configuration cannot reuse the old connection');
env.AZURE_STORAGE_ACCOUNT=env.PLATFORM_AGENT_SOURCE_STORAGE_ACCOUNT;env.AZURE_STORAGE_CONTAINER=env.PLATFORM_AGENT_SOURCE_STORAGE_CONTAINER;
await assert.rejects(read('report'),/separate private container/);
delete env.AZURE_CLIENT_ID;await assert.rejects(read('report'),/Configure/);
console.log('Source grant cache: single-flight, copies, 30 s bound, ETag 304/change, revocation on revalidate, outage, identity/config changes and private-container boundary passed.');

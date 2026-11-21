import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {Readable} from 'node:stream';
import {BlobClient} from '@azure/storage-blob';
import {readSourceGrantDocument} from '../server/platform-agent-source-grants.mjs';

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

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { createCarebookStorage, assertCarebookIdentity, validateCarebookManifest, handleCarebookSourceRequest, CAREBOOK_SOURCE_PREFIX as prefix } from '../../server/carebook-source-api.mjs';
const sha = x => createHash('sha256').update(x).digest('hex');
const auth = { authenticated:true, mode:'entra-service-principal', claims:{appid:'synthetic-client',roles:['Carebook.Sync.Read.All']} };
const resident = Buffer.from(JSON.stringify({contractVersion:1,facilityId:'337',residentId:'100',identity:{firstName:'Invented resident'}}));
const manifest = {contractVersion:1,asOf:'2026-10-25',publishedAt:'2026-10-25T12:15:00Z',facilities:['337','342','343','344','345'],domains:'Profile Allergy Diagnosis Contact Note Incident ServiceSummary ServicePlan Admission Absence RoomMove Immunization'.split(' '),unavailable:['Vital'],members:['337','342','343','344','345'].map((f,i)=>({facilityId:f,residentId:String(100+i),sha256:i?'b'.repeat(64):sha(resident)}))};
const raw=Buffer.from(JSON.stringify(manifest)),id=sha(raw);
test('production managed-identity storage does not require or fall back to a client secret',()=>{
 const seen=[];
 const types={ManagedIdentityCredential:class {constructor(id){seen.push(id)}},ClientSecretCredential:class {constructor(){throw Error('Unexpected secret credential')}},BlobServiceClient:class {constructor(url){seen.push(url)} getContainerClient(container){return {container}}}};
 const env={AZURE_STORAGE_AUTH_MODE:'managed-identity',AZURE_STORAGE_ACCOUNT:'inventedstore',AZURE_STORAGE_CONTAINER:'source',AZURE_CLIENT_ID:'invented-runtime'};
 assert.deepEqual(createCarebookStorage(env,types),{container:'source'});
 assert.deepEqual(seen,['invented-runtime','https://inventedstore.blob.core.windows.net']);
 assert.throws(()=>createCarebookStorage({...env,AZURE_CLIENT_ID:''},types));
 assert.throws(()=>createCarebookStorage({...env,AZURE_STORAGE_AUTH_MODE:'unknown'},types));
});
async function request(path,{identity=auth,read}={}) {
 const res={headers:{},setHeader(k,v){this.headers[k]=v},status(n){this.code=n;return this},json(x){this.body=x;return this},send(x){this.body=x;return this}};
 await handleCarebookSourceRequest({method:'GET',url:prefix+path,headers:{host:'localhost'}},res,{clientId:'synthetic-client',authorize:async()=>identity,read:read??(async name=>name==='latest.json'?Buffer.from(JSON.stringify({snapshotId:id})):name===`snapshots/${id}.json`?raw:gzipSync(resident))}); return res;
}
test('only dedicated application identity and role, never delegated staff sessions',()=>{
 assert.doesNotThrow(()=>assertCarebookIdentity(auth,'synthetic-client'));
 for(const a of [{...auth,mode:'entra-user'}, {...auth,claims:{...auth.claims,scp:'read'}}, {...auth,claims:{...auth.claims,appid:'other'}}, {...auth,claims:{...auth.claims,roles:[]}}]) assert.throws(()=>assertCarebookIdentity(a,'synthetic-client'));
});
test('manifest bytes and every facility/domain are required',()=>{
 assert.equal(validateCarebookManifest(raw,id).members.length,5);
 assert.throws(()=>validateCarebookManifest(raw,'a'.repeat(64)));
 for(const m of [{...manifest,members:manifest.members.slice(1)},{...manifest,domains:['Profile']},{...manifest,members:[...manifest.members,manifest.members[0]]}]) { const b=Buffer.from(JSON.stringify(m));assert.throws(()=>validateCarebookManifest(b,sha(b))); }
});
test('latest and exactly bound resident bytes have no-store and publication identity',async()=>{
 const latest=await request('/latest');assert.equal(latest.code,200);assert.deepEqual(latest.body,raw);assert.match(latest.headers['Cache-Control'],/no-store/);
 const r=await request(`/${id}/residents/${sha(resident)}`);assert.equal(r.code,200);assert.equal(r.headers['X-Carebook-Snapshot'],id);
});
test('denied and unknown members never read source bodies; errors never disclose clinical text',async()=>{
 let calls=0;const denied=await request('/latest',{identity:{...auth,mode:'entra-user'},read:async()=>{calls++;throw Error('Invented clinical secret')}});assert.equal(denied.code,403);assert.equal(calls,0);
 assert.equal((await request(`/${id}/residents/${'c'.repeat(64)}`)).code,404);
 const failed=await request('/latest',{read:async()=>{throw Error('Invented clinical secret')}});assert.equal(failed.code,502);assert.doesNotMatch(JSON.stringify(failed.body),/Invented/);
 assert.equal((await request('/../../private')).code,404);
});
test('corrupt member and decompression bomb fail before response',async()=>{
 for(const bad of [gzipSync(Buffer.from('wrong')),gzipSync(Buffer.alloc(33*1024*1024,65))]) {
 const r=await request(`/${id}/residents/${sha(resident)}`,{read:async name=>name.endsWith('.gz')?bad:raw});assert.equal(r.code,502);assert.doesNotMatch(JSON.stringify(r.body),/Invented/);
 }
});

import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';import {AsyncLocalStorage} from 'node:async_hooks';
const js=ts.transpileModule(fs.readFileSync('src/lib/class-photo-drive.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
function load(auth,fetch){const exports={};vm.runInNewContext(js,{exports,require:id=>id==='node:async_hooks'?{AsyncLocalStorage}:{getGoogleDriveAccessToken:auth},process:{env:{}},fetch,Headers,Response,URL,URLSearchParams,AbortController,AbortSignal,setTimeout,clearTimeout});return exports;}
let release,fetches=0;const oauth=new Promise(resolve=>release=resolve);const service=load(()=>oauth,async()=>{fetches++;return Response.json({files:[]});});
const start=Date.now();await assert.rejects(()=>service.withClassPhotoDriveDeadline(25,()=>service.listClassAlbums()));assert.ok(Date.now()-start<500);release('secret');await new Promise(r=>setTimeout(r,20));assert.equal(fetches,0,'timed-out auth cannot issue late Drive requests');await service.listClassAlbums();assert.equal(fetches,1,'timeout does not evict shared token');
let signal;const stuck=load(async()=> 'secret',async(url,init)=>{signal=init.signal;return new Promise(()=>{});});await assert.rejects(()=>stuck.withClassPhotoDriveDeadline(25,()=>stuck.listClassAlbums()));assert.equal(signal.aborted,true);
const body=load(async()=> 'secret',async()=>({ok:true,status:200,json:()=>new Promise(()=>{}),text:()=>new Promise(()=>{})}));await assert.rejects(()=>body.withClassPhotoDriveDeadline(25,()=>body.listClassAlbums()));
let writes=0;const delayed=load(async()=> 'secret',async()=>{writes++;return Response.json({files:[]});});await assert.rejects(()=>delayed.withClassPhotoDriveDeadline(25,async()=>{await new Promise(r=>setTimeout(r,60));await delayed.listClassAlbums();}));await new Promise(r=>setTimeout(r,80));assert.equal(writes,0,'late task resumes under aborted context');
console.log('class photo total deadline tests passed');
let refreshes=0;const recovery={};
vm.runInNewContext(js,{exports:recovery,require:id=>id==='node:async_hooks'?{AsyncLocalStorage}:{getGoogleDriveAccessToken:()=>++refreshes===1?new Promise(()=>{}):Promise.resolve('recovered')},process:{env:{}},fetch:async()=>Response.json({files:[]}),Headers,Response,URL,URLSearchParams,AbortController,AbortSignal:{timeout:()=>AbortSignal.timeout(25)},setTimeout,clearTimeout});
const keepAlive=setTimeout(()=>{},1000);
try {await assert.rejects(()=>recovery.listClassAlbums());await new Promise(resolve=>setTimeout(resolve,30));
await recovery.listClassAlbums();assert.equal(refreshes,2,'Stalled shared OAuth is cleared rather than poisoning the cache for 45 minutes');}
finally {clearTimeout(keepAlive);}


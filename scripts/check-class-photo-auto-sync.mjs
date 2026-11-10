import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
let effect,interval,calls=0,refreshes=0;const doc={visibilityState:'visible'};
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/class-photo-auto-sync.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,AbortController,document:doc,setInterval:fn=>{interval=fn;return 1},clearInterval:()=>{},fetch:async(url,options)=>{calls++;assert.equal(url,'/api/class-photos/class-id/sync');assert.equal(JSON.parse(options.body).fichaToken,'own-token');return {ok:true,json:async()=>({added:3,pending:calls<3})}},require:name=>name==='react'?{useEffect:fn=>effect=fn}:{useRouter:()=>({refresh:()=>refreshes++})}});
mod.exports.ClassPhotoAutoSync({classIds:['class-id'],fichaToken:'own-token'});const cleanup=effect();
for(let tick=0;tick<5;tick++)await new Promise(setImmediate);
assert.equal(calls,3,'Continue pending imports until the server reports complete');assert.equal(refreshes,2,'Show early progress and final result without refreshing every batch');
doc.visibilityState='hidden';interval();await new Promise(setImmediate);assert.equal(calls,3,'Hidden fichas do not continue polling');cleanup();
console.log('Large album sync continuation, progress refresh and hidden-tab throttling passed.');

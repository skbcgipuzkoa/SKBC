import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
let response=null,fail=false;const calls=[];
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('src/app/api/class-photos/[classId]/[fileId]/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,Response,URL,Set,require(name){assert.equal(name,'@/lib/class-photos');return{authorizeClassPhoto:async input=>{calls.push(input);if(fail)throw new Error('Private OAuth error');return response}}}});
const get=()=>mod.exports.GET(new Request('https://skbc.vercel.app/api/class-photos/c/p?ficha=private-token'),{params:Promise.resolve({classId:'c',fileId:'p'})});
let result=await get();assert.equal(result.status,404);
assert.equal(calls[0].fichaToken,'private-token');
response=new Response('image bytes',{headers:{'Content-Type':'image/jpeg'}});result=await get();
assert.equal(result.status,200);assert.equal(await result.text(),'image bytes');
assert.match(result.headers.get('Cache-Control'),/private.*no-store/);assert.equal(result.headers.get('X-Content-Type-Options'),'nosniff');assert.equal(result.headers.get('Referrer-Policy'),'no-referrer');
for(const type of ['text/html','image/svg+xml','application/octet-stream']){response=new Response('<script>bad</script>',{headers:{'Content-Type':type}});assert.equal((await get()).status,404);}
fail=true;result=await get();assert.equal(result.status,503);assert.doesNotMatch(await result.text(),/OAuth|token/);assert.match(result.headers.get('Cache-Control'),/no-store/);
console.log('Private photo route: scoped auth, streaming, no-store, MIME allowlist and sanitized errors passed.');

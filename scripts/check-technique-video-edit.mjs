import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const source=readFileSync('src/app/actions.ts','utf8');
const start=source.indexOf('export async function updateTechniqueAction(');
const end=source.indexOf('export async function updateKenshiAction(',start);
const js=ts.transpileModule(source.slice(start,end).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function run(fields={},options={}){
  const writes=[],revalidated=[];
  let queries=0;
  const db={from(){queries++;const q={select(){return q},eq(){return q},maybeSingle(){return Promise.resolve({data:{summary_es:'summary'},error:options.readError??null})},update(payload){writes.push(payload);return q},then(resolve){return Promise.resolve({error:options.dbError??null}).then(resolve)}};return q}};
  const action=new Function('hasInternalAccess','redirect','createAdminClient','normalizeTechniqueCategoryInput','revalidatePath','console',`${js};return updateTechniqueAction`)(async()=>options.auth!==false,path=>{throw {redirect:path}},()=>db,value=>value,path=>revalidated.push(path),{error(){}});
  const form=new FormData();
  for(const [key,value] of Object.entries({legacyId:'L1',returnPath:'/tecnicas?kind=kata',name:'Tenchiken',grade:'5 KYU',category:'hokei',summaryEs:'summary',...fields}))form.set(key,value);
  try{await action(form);assert.fail('Expected redirect')}catch(error){assert.ok(error.redirect);return {location:error.redirect,writes,revalidated,queries}}
}
let result=await run({videoUrl:' https://example.com/video?id=1 ',videoTitle:' Tenchiken '});
assert.equal(result.writes[0].video_url,'https://example.com/video?id=1');
assert.equal(result.writes[0].video_title,'Tenchiken');
assert.match(result.location,/saved=technique/);
assert.ok(result.revalidated.includes('/tecnicas'));
for(const videoUrl of ['javascript:alert(1)','data:text/html,x','/relative','ftp://example.com/video','https://','https:example.com','not a link']){
  result=await run({videoUrl});assert.equal(result.writes.length,0);assert.match(result.location,/error=technique-video/);assert.match(result.location,/edit=L1/);assert.match(result.location,/kind=kata/);
}
result=await run({videoUrl:'http://example.com/watch',videoTitle:''});assert.equal(result.writes[0].video_url,'http://example.com/watch');assert.equal(result.writes[0].video_title,null);
result=await run({videoUrl:'  ',videoTitle:' '});assert.equal(result.writes[0].video_url,null);assert.equal(result.writes[0].video_title,null);
result=await run();assert.ok(!Object.hasOwn(result.writes[0],'video_url'));assert.ok(!Object.hasOwn(result.writes[0],'video_title'));
result=await run({videoUrl:'https://example.com'},{auth:false});assert.equal(result.writes.length,0);assert.equal(result.queries,0);
result=await run({videoUrl:'https://example.com'},{dbError:new Error('write failed')});assert.match(result.location,/error=technique/);assert.doesNotMatch(result.location,/saved=/);
result=await run({videoUrl:'https://example.com'},{readError:new Error('read failed')});assert.equal(result.writes.length,0);assert.match(result.location,/error=technique/);
assert.ok(result.location.includes('edit=L1'));
console.log('Technique video editing action checks passed');

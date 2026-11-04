import assert from 'node:assert/strict';
import {sameTechniqueVideoIdentity} from '../src/lib/technique-video-identity.ts';
import {loadAllPages} from '../src/lib/load-all-pages.ts';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
const base={name:'Ténchiken dai 1',base_name:'Tenchiken',category:'hokei',content_type:'KATA_TANEN',variant:null,variant_note:null};
assert.ok(sameTechniqueVideoIdentity(base,{...base,name:' TENCHIKEN  dai 1 '}));
for(const [key,value] of Object.entries({name:'Tenchiken dai 2',base_name:'Other',category:'juho',content_type:'KATA_SOTAI',variant:'ura',variant_note:'izquierda'}))assert.ok(!sameTechniqueVideoIdentity(base,{...base,[key]:value}),key);
assert.ok(!sameTechniqueVideoIdentity(base,{...base,name:'Tenchiken dai-1'}));
const source=readFileSync('src/app/actions.ts','utf8');
const start=source.indexOf('export async function updateTechniqueAction('),end=source.indexOf('export async function updateKenshiAction(',start);
const js=ts.transpileModule(source.slice(start,end).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function run(fields={},options={}){
  const current={...base,id:'current',legacy_id:'L1',summary_es:'summary',grade:'5 KYU'};
  const rows=[current,...Array.from({length:1002},(_,i)=>({...current,id:`s${i}`,legacy_id:`S${i}`,grade:'4 KYU'})),{...current,id:'wrong',variant:'ura'}];
  const writes=[],ranges=[],revalidated=[];
  const db={from(){let payload,from=0,to=999;const filters=[];const q={select(){return q},eq(key,value){filters.push(row=>row[key]===value);return q},in(key,values){filters.push(row=>values.includes(row[key]));return q},order(){return q},range(a,b){from=a;to=b;ranges.push([a,b]);return q},returns(){return q},maybeSingle(){return Promise.resolve({data:current,error:null})},update(value){payload=value;return q},then(resolve){if(payload){writes.push({payload,ids:rows.filter(row=>filters.every(fn=>fn(row))).map(row=>row.id)});return Promise.resolve({error:options.failBulk&&writes.length>1?new Error('bulk failed'):options.failLocal?new Error('local failed'):null}).then(resolve)}return Promise.resolve({data:rows.slice(from,to+1),error:options.failRead?new Error('read failed'):null}).then(resolve)}};return q}};
  const action=new Function('hasInternalAccess','redirect','createAdminClient','normalizeTechniqueCategoryInput','revalidatePath','console','sameTechniqueVideoIdentity','loadAllPages',`${js};return updateTechniqueAction`)(async()=>options.auth!==false,path=>{throw {redirect:path}},()=>db,value=>value,path=>revalidated.push(path),{error(){}},sameTechniqueVideoIdentity,loadAllPages);
  const form=new FormData();
  for(const [key,value] of Object.entries({legacyId:'L1',returnPath:'/tecnicas?kind=kata',name:base.name,baseName:base.base_name,grade:'5 KYU',category:base.category,contentType:base.content_type,summaryEs:'summary',videoUrl:'https://example.com/video',videoTitle:'Title',applyVideoAllGrades:'on',...fields}))form.set(key,value);
  try{await action(form);assert.fail('redirect expected')}catch(error){assert.ok(error.redirect);return {location:error.redirect,writes,ranges,revalidated}}
}
let result=await run();
assert.equal(result.writes.length,12);
assert.equal(result.writes.slice(1).flatMap(write=>write.ids).length,1002);
assert.ok(result.writes.slice(1).every(write=>!write.ids.includes('wrong')&&write.ids.length<=100));
assert.ok(result.writes.slice(1).every(write=>Object.keys(write.payload).sort().join(',')==='updated_at,video_title,video_url'));
assert.deepEqual(result.ranges,[[0,999],[1000,1999]]);
assert.match(result.location,/videoLinked=1003/);
assert.match(result.location,/saved=technique/);
for(const fields of [{name:'New name'},{variant:'ura'},{videoUrl:''},{videoUrl:'javascript:alert(1)'}]){result=await run(fields);assert.equal(result.writes.length,0);assert.match(result.location,/error=/)}
result=await run({applyVideoAllGrades:''});assert.equal(result.writes.length,1);assert.equal(result.ranges.length,0);
result=await run({}, {auth:false});assert.equal(result.writes.length,0);assert.equal(result.ranges.length,0);
result=await run({}, {failRead:true});assert.equal(result.writes.length,0);assert.doesNotMatch(result.location,/saved=/);
result=await run({}, {failBulk:true});assert.match(result.location,/error=technique-video-bulk-partial/);assert.doesNotMatch(result.location,/saved=/);assert.ok(result.revalidated.includes('/tecnicas'));
result=await run({}, {failLocal:true});assert.equal(result.writes.length,1);assert.doesNotMatch(result.location,/saved=/);
console.log('Technique video bulk checks passed');

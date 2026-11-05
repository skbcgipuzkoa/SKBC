import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { resolveExamEligibilityTime } from '../src/lib/exam-eligibility-time.ts';
import { evaluateExamOutlook } from '../src/lib/exam-outlook.ts';
import { attributeExamCall,isIsoDate } from '../src/lib/exam-call.ts';
const iso=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const member={id:'5',display_name:'Synthetic',legacy_id:'5',class:'adults',status:'active',grade:'5 KYU',joined_on:'2020-01-01',last_exam_on:'2026-02-10'};
const base={today:'2026-11-05',attendance:[],history:[],curriculum:[],requirements:[],calls:['2026-12-05','2027-06-26'],closures:[]};
for(const id of ['5','27']){
 const normal={...member,id,last_exam_cycle_on:'2025-12-01'};
 assert.equal(iso(resolveExamEligibilityTime(normal,12).eligibilityDate),'2026-12-01');
 assert.equal(evaluateExamOutlook({...base,member:normal}).callDate,'2026-12-05');
 assert.equal(normal.last_exam_on,'2026-02-10');
}
for(const cycle of [undefined,'2026-02-10']){
 const unknownOrRetake={...member,last_exam_cycle_on:cycle};
 assert.equal(iso(resolveExamEligibilityTime(unknownOrRetake,12).eligibilityDate),'2027-02-10');
 assert.equal(evaluateExamOutlook({...base,member:unknownOrRetake}).callDate,'2027-06-26');
}
assert.equal(iso(resolveExamEligibilityTime({joined_on:'2026-01-10',last_exam_on:null,last_exam_cycle_on:'2025-12-01'},12).eligibilityDate),'2026-07-10');
let writes=[];
const db={from:table=>{assert.equal(table,'member_exam_cycle_attributions');return{upsert:async data=>{writes.push(data);return {error:null}}}}};
const module={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/exam-cycle-attribution.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:module.exports,Map,Set,require:name=>name.endsWith('exam-call')?{attributeExamCall,isIsoDate}:name.endsWith('admin')?{createAdminClient:()=>db}:{}});
for(const isRetake of [false,true]) await module.exports.recordExamCycleAttribution({memberId:'synthetic',actualExamOn:'2026-02-10',isRetake,source:'test-confirmed'});
assert.equal(writes[0].reference_on,'2025-12-01');assert.equal(writes[1].reference_on,'2026-02-10');
assert(writes.every(row=>row.actual_exam_on==='2026-02-10'));
const mapped=new Map([['5:2026-02-10',writes[0]]]);
assert.equal(module.exports.withExamCycleAttribution(member,mapped).last_exam_cycle_on,'2025-12-01');
assert.equal(module.exports.withExamCycleAttribution({...member,last_exam_on:'2026-02-11'},mapped).last_exam_cycle_on,'2025-12-01');
for (const actual of ['2026-01-21','2026-02-10']) {
 const ekaitz=module.exports.withExamCycleAttribution({...member,id:'6',last_exam_on:actual},new Map());
 assert.equal(ekaitz.last_exam_on,actual,'Keep the actual exam date');
 assert.equal(ekaitz.last_exam_cycle_on,'2025-12-01','Club winter rule applies without individual attribution');
 assert.equal(evaluateExamOutlook({...base,member:ekaitz}).callDate,'2026-12-05');
 const retake=module.exports.withExamCycleAttribution({...member,id:'6',last_exam_on:actual},new Map([[`6:${actual}`,{...writes[1],reference_on:actual,is_retake:true}]]));
 assert.equal(retake.last_exam_cycle_on,actual,'Explicit retake must retain its actual cycle');
 assert.equal(evaluateExamOutlook({...base,member:retake}).callDate,'2027-06-26');
}
assert.equal(module.exports.withExamCycleAttribution({...member,last_exam_on:null},new Map()).last_exam_cycle_on,null);
assert.equal(module.exports.withExamCycleAttribution({...member,last_exam_on:'2026-03-10'},new Map()).last_exam_cycle_on,null);
const migration=fs.readFileSync('supabase/migrations/20261105000200_exam_cycle_attribution.sql','utf8');
assert.match(migration,/legacy_id in \('5', '27'\) and last_exam_on = date '2026-02-10'/);
assert.doesNotMatch(migration,/update\s+(public\.)?members|\bdrop\b/i);
console.log('Cycle attribution: all January/February history targets previous December by default; explicit retakes retain actual cycles; actual dates and first-exam rule preserved');
// Real asynchronous attribution provider: scoped chunks and exact actual-date keys.
const scopes=[];let chosen=[];
const readDb={from:()=>({select(){return this},in(column,ids){assert.equal(column,'member_id');chosen=ids;scopes.push(ids);return this},order(){return this},range(){return this},returns:async()=>({data:chosen.map(id=>({member_id:id,actual_exam_on:'2026-02-10',call_month:'2025-12',is_retake:false,reference_on:'2025-12-01',source:'synthetic'})),error:null})})};
const readModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/exam-cycle-attribution.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:readModule.exports,Map,Set,require:name=>name.endsWith('exam-call')?{attributeExamCall,isIsoDate}:name.endsWith('admin')?{createAdminClient:()=>readDb}:{loadAllPages:async page=>{const result=await page(0,999);if(result.error)throw result.error;return result.data}}});
assert.equal((await readModule.exports.loadExamCycleAttributions([])).size,0);assert.equal(scopes.length,0);
const rows=await readModule.exports.loadExamCycleAttributions(Array.from({length:201},(_,i)=>String(i)));
assert.equal(rows.size,201);assert.deepEqual(scopes.map(ids=>ids.length),[100,100,1]);
assert.equal(rows.get('27:2026-02-10').reference_on,'2025-12-01');
console.log('Real attribution provider uses scoped batches with no per-member queries');


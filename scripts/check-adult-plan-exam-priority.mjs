import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const cache = new Map();
let mockClient;
function load(name) { if(name==='admin') return {createAdminClient:()=>mockClient}; if(cache.has(name)) return cache.get(name); const module={exports:{}}; const source=readFileSync(new URL(`../src/lib/${name}.ts`,import.meta.url),'utf8'); vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module,exports:module.exports,require:(path)=>load(path.split('/').at(-1)),Map,Set,Date,console}); cache.set(name,module.exports);return module.exports; }
const { examPriorityBenefit, projectedExamPlan, matchExamRequirement } = load('adult-plan-exam-priority');
const curriculum=[{id:'g',name:'Goho',category:'goho',content_type:null},{id:'j',name:'Juho',category:'juho',content_type:null},{id:'k',name:'Kata',category:'kata',content_type:'KATA_TANEN'}];
const pupil=(id,counts,requiredRepetitions=2)=>({id,name:id,curriculum,repetitions:new Map(counts),requiredRepetitions,proximity:1});
const ana=pupil('Ana',[['g',1],['j',1],['k',1]]);
assert.equal(examPriorityBenefit('g',[ana]).missingRepetitions,1);
assert.equal(projectedExamPlan(['g'],[ana]).completedNames.length,0);
assert.equal(projectedExamPlan(['g','j'],[ana]).completedNames[0],'Ana');
assert.equal(projectedExamPlan(['g','j'],[pupil('Sin kata',[['g',1],['j',1]])]).completedNames.length,0);
assert.equal(projectedExamPlan(['g','j','k'],[pupil('Sin kata',[['g',1],['j',1]])]).completedNames[0],'Sin kata');
assert.equal(examPriorityBenefit('g',[pupil('Tres',[['g',1]],3)]).completedItems,0);
assert.equal(examPriorityBenefit('g',[ana,pupil('Luis',[['g',0]])]).beneficiaries,2);
assert.equal(examPriorityBenefit('unknown',[ana]).score,0);
assert.equal(matchExamRequirement('2 DAN',[{grade_pattern:'* KYU',adult_required_repetitions:3},{grade_pattern:'* DAN',adult_required_repetitions:4}]).adult_required_repetitions,4);
assert.equal(matchExamRequirement('MINARAI',[]).adult_required_repetitions,2);
console.log('Adult exam priority regression checks passed.');

const {selectTechniquesForGroup}=load('adult-plan');
const tech=(id,category,order,extra={})=>({id,name:id,grade:'4 KYU',category,content_type:null,force_next:false,program_order:order,plan_repetitions:0,plan_last_trained_on:null,...extra});
const candidates=[tech('old-g','goho',1),tech('g','goho',20),tech('other-g','goho',2),tech('j','juho',20),tech('old-j','juho',1),tech('other-j','juho',2),tech('k','kata',1,{content_type:'KATA_TANEN'})];
let selected=selectTechniquesForGroup('4 KYU',null,candidates,'2026-11-01',[ana]);
assert.equal(selected.length,5);
assert.equal(selected.filter(row=>row.technique.category==='goho').length,2);
assert.equal(selected.filter(row=>row.technique.category==='juho').length,2);
assert.ok(selected.some(row=>row.technique.id==='g'));
assert.ok(selected.some(row=>row.technique.id==='j'));
assert.ok(selected.some(row=>row.technique.id==='k'));
selected=selectTechniquesForGroup('4 KYU',null,candidates.map(row=>row.id==='other-g'?{...row,force_next:true}:row),'2026-11-01',[ana]);
assert.equal(selected[0].technique.id,'other-g');
assert.equal(selectTechniquesForGroup('4 KYU',null,candidates,'2026-11-01',[])[0].technique.id,'old-g');
console.log('Adult selection force, balance and variety passed.');

const {generateAdultTechnicalPlan}=load('adult-plan');
async function generatorFixture(failHistory=false, attendanceKnown=true) {
 const writes=[], requests=[];
 const tables={classes:[{id:'class',class_date:'2026-11-01',class_group:'adults',closed:false,plan_generated:false,class_type:null}],class_technical_groups:[{id:'group',class_id:'class',grade:'5 KYU',active:true}],technical_plans:[],techniques:candidates.map(row=>({...row,active:true,active_in_planning:true})),members:[{id:'Ana',legacy_id:'1',display_name:'Ana',grade:'5 KYU',status:'active',class:'adults',joined_on:'2020-01-01',last_exam_on:null,missing_attendance:0},{id:'Mixed',legacy_id:'2',display_name:'Mixed',grade:'4 KYU',status:'active',class:'adults',joined_on:'2020-01-01',missing_attendance:0}],attendance_logs:[{member_id:'Ana',class_id:'class',trained_grade:'5 KYU',official_grade:'5 KYU'},{member_id:'Mixed',class_id:'class',trained_grade:'5 KYU',official_grade:'4 KYU'}],skbc_exam_requirements:[{member_class:'adults',active:true,grade_pattern:'*',adult_required_repetitions:2,min_months:12}],member_technical_history:[]};
 if(!attendanceKnown) tables.attendance_logs=[];
 // Ana needs exactly g and j; all other curriculum is already reviewed.
 for(const row of candidates) for(let i=0;i<(row.id==='g'||row.id==='j'?1:row.id==='k'?1:2);i++)tables.member_technical_history.push({member_id:'Ana',technique_id:row.id,technique_name:row.name,completed:true,class_date:'2026-10-01'});
 // Future history must not erase Ana's real deficit as of the class.
 tables.member_technical_history.push({member_id:'Ana',technique_id:'g',technique_name:'g',completed:true,class_date:'2026-12-01'});
 mockClient={from(table){let rows=[...(tables[table]??[])],single=false,error=null;const query={select(){return query},eq(key,value){rows=rows.filter(row=>row[key]===value);return query},neq(key,value){rows=rows.filter(row=>row[key]!==value);return query},lte(key,value){requests.push({table,key,value});rows=rows.filter(row=>row[key]<=value);return query},or(){return query},order(){return query},range(from,to){rows=rows.slice(from,to+1);return query},limit(n){rows=rows.slice(0,n);return query},returns(){return query},single(){single=true;return query},insert(data){writes.push({table,data});return query},update(data){writes.push({table,data});return query},then(resolve,reject){return Promise.resolve({data:single?rows[0]:rows,error:table==='member_technical_history'&&failHistory?new Error('history unavailable'):error}).then(resolve,reject)}};return query}};
 if(failHistory){await assert.rejects(generateAdultTechnicalPlan('class'),/history unavailable/);assert.equal(writes.length,0);return;}
 await generateAdultTechnicalPlan('class');
 const plan=writes.find(write=>write.table==='technical_plans').data;
 assert.equal(plan.length,5);
 assert.ok(plan.some(row=>row.focus.includes('Ana')),'persist projected combined closure name');
 assert.ok(plan.every(row=>!row.focus.includes('Mixed')),'working in another grade cannot promote curriculum target');
 assert.ok(plan.every(row=>row.focus.includes(attendanceKnown?'asistentes registrados':'asistencia aun no confirmada')));
 assert.ok(requests.some(row=>row.table==='member_technical_history'&&row.key==='class_date'&&row.value==='2026-11-01'));
 assert.ok(requests.some(row=>row.table==='technical_plans'&&row.key==='class_date'));
 assert.ok(writes.every(write=>['technical_plans','classes'].includes(write.table)),'generation cannot record actual pupil progress');
}
await generatorFixture();
await generatorFixture(true);
await generatorFixture(false,false);
console.log('Generator context, future cutoff, persisted projection and query failure checks passed.');


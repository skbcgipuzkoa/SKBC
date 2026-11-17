import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = path => readFileSync(new URL('../'+path, import.meta.url), 'utf8');
function functions(path, names, bindings) {
  const text=source(path), ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
  const declarations=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&names.includes(n.name?.text)).map(n=>n.getText(ast));
  assert.equal(declarations.length,names.length);
  const code=ts.transpileModule(declarations.join('\n').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const context=vm.createContext({...bindings,Map,Set,Date,console});
  vm.runInContext(code+'\nthis.result={'+names.join(',')+'};',context);
  return context.result;
}
function database(rows) {
  let sequence=0;
  const events=[];
  const db={events,rows,fail:null,from(table){
    const filters=[];let mode='select',payload,single=false;
    const query={select(){return query;},eq(k,v){filters.push(r=>r[k]===v);return query;},in(k,v){filters.push(r=>v.includes(r[k]));return query;},order(){return query;},returns(){return query;},single(){single=true;return query;},maybeSingle(){single=true;return query;},range(){return query;},like(){return query;},update(v){mode='update';payload=v;return query;},delete(){mode='delete';return query;},insert(v){mode='insert';payload=v;return query;},upsert(v){mode='upsert';payload=v;return query;},then(resolve,reject){return Promise.resolve().then(()=>{
      events.push({table,mode,payload});
      if(db.fail?.(table,mode))return {data:null,error:new Error('injected failure')};
      const data=rows[table]??(rows[table]=[]),matches=r=>filters.every(f=>f(r));let found=data.filter(matches);
      if(mode==='delete')rows[table]=data.filter(r=>!matches(r));
      if(mode==='update')found.forEach(r=>Object.assign(r,payload));
      if(mode==='insert'||mode==='upsert')for(const row of Array.isArray(payload)?payload:[payload])data.push({id:'generated-'+(++sequence),...row});
      if(table==='member_technique_assignments'&&mode==='select')found=found.map(r=>({...r,technical_plans:rows.technical_plans.find(p=>p.id===r.plan_id)??null,techniques:rows.techniques.find(t=>t.id===r.technique_id)??null,members:{grade:'1 DAN'}}));
      return {data:single?(found[0]??null):found,error:null};
    }).then(resolve,reject);}};return query;
  }};return db;
}
const apply=functions('src/lib/attendance-individual-work.ts',['applyIndividualWork'],{}).applyIndividualWork;
const rows={classes:[{id:'class',class_group:'adults',closed:false,class_date:'2026-11-17'}],attendance_logs:[{id:'attendance',class_id:'class',member_id:'member',official_grade:'1 DAN',trained_grade:'1 DAN',use_for_history:true,members:{class:'adults'}}],technical_plans:['tanen','sotai'].map(id=>({id:'plan-'+id,class_id:'class',technique_id:id,technique_name:'Giwa ken dai ichi',content_type:'KATA_'+id.toUpperCase(),group_grade:'1 DAN',completed:true,used_for_history:true,class_date:'2026-11-17'})),techniques:['tanen','sotai'].map(id=>({id,name:'Giwa ken dai ichi',content_type:'KATA_'+id.toUpperCase(),repetitions:10})),member_technical_history:[],member_technique_assignments:[],dojo_technical_history:[],attendance_technical_overrides:[]};
const db=database(rows);let work=new Map([['attendance',{mode:'adjust',removedIds:['sotai'],addedIds:[]}]]),failProfiles=true;
const adultNames=['closeAdultClass','rebuildAdultClass','clearGeneratedClassTechnicalHistory','getTechnicalOverrides','generateAssignments','isReviewForAttendant','generateDojoHistory','individualTechnique','generateMemberHistory','normalize','buildGeneratedLegacyId'];
const adult=functions('src/lib/adult-class-close.ts',adultNames,{createAdminClient:()=>db,withIndividualWorkSnapshot:async(_id,fn)=>fn(),applyIndividualWork:apply,loadIndividualWork:async()=>work,recalculateClassExamStatus:async()=>{if(failProfiles)throw Error('profiles failed');}});
await assert.rejects(adult.closeAdultClass('class',async()=>{}),/profiles failed/);
assert.equal(rows.classes[0].closed,false,'Failed first close remains retryable');
assert.equal(rows.member_technical_history.length,1);
assert.equal(rows.member_technical_history[0].content_type,'KATA_TANEN');
// Change the individual selection after a partial first close and retry.
work=new Map([['attendance',{mode:'adjust',removedIds:['tanen'],addedIds:[]}]]);failProfiles=false;
await adult.closeAdultClass('class',async()=>{});
assert.deepEqual(rows.member_technical_history.map(r=>r.technique_id),['sotai']);
assert.equal(rows.member_technical_history[0].content_type,'KATA_SOTAI');
assert.equal(rows.classes[0].closed,false,'Outer profiles/rankings still pending');
assert.equal(rows.classes[0].status,'pending');
await adult.closeAdultClass('class',async()=>{});
assert.equal(rows.member_technical_history.length,1,'Retry does not duplicate history');
assert.deepEqual(rows.techniques.map(t=>t.repetitions),[10,10],'Retries preserve imported metrics');
const invalidated=[];
const finish=functions('src/lib/class-closure-progress.ts',['finishClassClosureProgress'],{createAdminClient:()=>db,revalidatePath:(...args)=>invalidated.push(args)}).finishClassClosureProgress;
// Even clients without a progress token must finalize the class.
await finish('',['class']);
assert.equal(rows.classes[0].closed,true);assert.equal(rows.classes[0].status,'completed');
assert(invalidated.some(([path])=>path==='/ficha/[token]'));
rows.classes[0].closed=false;rows.classes[0].status='pending';
db.fail=(table,mode)=>table==='classes'&&mode==='update';
await assert.rejects(finish('progress',['class']),/injected failure/);
assert.equal(rows.classes[0].closed,false);
assert(!db.events.some(e=>e.table==='class_closure_progress'&&e.mode==='delete'),'Failed finalization retains progress');
// Child history helper must not close before profile/ranking finalization.
db.fail=null;
const child=functions('src/app/actions.ts',['closeChildClassWithHistory'],{withIndividualWorkSnapshot:async(_id,fn)=>fn(),rebuildChildSyllabusHistory:async()=>{}}).closeChildClassWithHistory;
rows.classes[0].class_group='kids';await child(db,'class');
assert.equal(rows.classes[0].closed,false);assert.equal(rows.classes[0].status,'pending');
await finish('',['class']);assert.equal(rows.classes[0].closed,true);
console.log('PASS: child/adult pending closure, failed profile update, individual variant replacement, retries, metric baseline and ficha invalidation');
const childRows={classes:[{id:'kids',class_group:'kids',class_date:'2026-11-17'}],child_class_plans:[{class_id:'kids',syllabus_item_ids:['tanen','sotai']}],attendance_logs:[{id:'attendance',class_id:'kids',member_id:'member'}],child_class_group_work:[],child_syllabus_items:[{id:'tanen',title:'Giwa ken dai ichi',category:'hokei'},{id:'sotai',title:'Giwa ken dai ichi',category:'hokei'},{id:'extra',title:'Extra kata',category:'hokei'}],child_syllabus_history:[{id:'old',class_id:'kids',member_id:'member',syllabus_item_id:'sotai'}],child_attendance_work_overrides:[]};
const childDb=database(childRows);
const rebuild=functions('src/app/actions.ts',['rebuildChildSyllabusHistory'],{CHILD_TARGETED_SYLLABUS_PREFIX:'SKBC_SYLLABUS_ITEM:',loadAllPages:async loader=>{const result=await loader(0,999);if(result.error)throw result.error;return result.data;},loadIndividualWork:async()=>new Map([['attendance',{mode:'adjust',removedIds:['sotai'],addedIds:['extra']}]]),applyIndividualWork:apply,normalizeChildWorkMode:value=>value}).rebuildChildSyllabusHistory;
await rebuild(childDb,'kids');
assert.deepEqual(childRows.child_syllabus_history.map(r=>r.syllabus_item_id).sort(),['extra','tanen']);
// Missing plan contents must fail before deleting the saved history.
childRows.child_class_plans[0].syllabus_item_ids=['missing'];const prior=JSON.stringify(childRows.child_syllabus_history);
await assert.rejects(rebuild(childDb,'kids'),/No se encuentra el contenido infantil missing/);
assert.equal(JSON.stringify(childRows.child_syllabus_history),prior);
console.log('PASS: real child history rebuild preserves additions, excludes removed variant and refuses missing plan contents');

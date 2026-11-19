// PostgreSQL integration test. Optional dependency: @electric-sql/pglite@0.3.14.
// Set SKBC_PGLITE_MODULE to its dist/index.js (default: OS temp/skbc-visitor-sql-tests).
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import vm from 'node:vm';
import {AsyncLocalStorage} from 'node:async_hooks';
import ts from 'typescript';
const {PGlite}=await import(pathToFileURL(process.env.SKBC_PGLITE_MODULE??join(tmpdir(),'skbc-visitor-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);
const pg=new PGlite();
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function load(path,names,bindings={}){
 const text=read(path),ast=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true);
 const selected=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&(!names||names.includes(n.name?.text))).map(n=>n.getText(ast));
 const code=ts.transpileModule(selected.join('\n').replace(/export /g,''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 const context=vm.createContext({...bindings,Date,Map,Set,console});vm.runInContext(code+';this.api={'+(names??ast.statements.filter(n=>ts.isFunctionDeclaration(n)).map(n=>n.name.text)).join(',')+'};',context);return context.api;
}
await pg.exec(`
create role anon;create role authenticated;create role service_role;
create type member_class as enum ('adults','kids');
create table dojos(slug text primary key,archived_at timestamptz);
create table members(id uuid primary key,display_name text,first_name text,last_name text,class member_class,grade text,status text default 'active',joined_on date default '2020-01-01',last_exam_on date,next_exam_on date,exam_notice text,semaphore text,attendance_count integer,attendance_percentage numeric,minimum_attendance integer,total_cycle_sessions integer,missing_attendance integer,updated_at timestamptz);
create table dojo_memberships(member_id uuid references members(id),dojo_slug text references dojos(slug),status text default 'active');
create table classes(id uuid primary key,legacy_id text,class_date date,class_group member_class,dojo_slug text references dojos(slug),status text default 'pending',closed boolean default false,updated_at timestamptz,individual_work_closing_until timestamptz);
create table attendance_logs(id uuid primary key default gen_random_uuid(),legacy_id text unique,class_id uuid references classes(id),member_id uuid references members(id),attended_on date,official_grade text,trained_grade text,technical_role text default 'student',technical_note text,use_for_history boolean default true);
create table techniques(id uuid primary key,name text,grade text,category text,content_type text);
create table technical_plans(id uuid primary key,class_id uuid references classes(id),legacy_id text,technical_group_id uuid,class_date date,group_grade text,target_grade text,technique_id uuid references techniques(id),technique_grade text,technique_base text,technique_name text,category text,content_type text,proposal_type text,focus text,completed boolean,notes text,used_for_history boolean,updated_at timestamptz);
create table member_technique_assignments(id uuid primary key default gen_random_uuid(),legacy_id text unique,class_id uuid,plan_id uuid,technique_id uuid,member_id uuid,assigned_on date,group_grade text,active boolean,completed boolean,counts_as_progression boolean,counts_as_review boolean,counts_for_stats boolean,notes text,created_by text);
create table member_technical_history(id uuid primary key default gen_random_uuid(),legacy_id text unique,class_id uuid,class_date date,assignment_id uuid,member_id uuid references members(id),member_grade_at_time text,technical_group_id uuid,group_grade text,target_grade text,technique_id uuid,technique_name text,technique_grade text,category text,content_type text,proposal_type text,completed boolean,counts_as_progression boolean default false,counts_as_review boolean default false,counts_for_stats boolean,notes text,created_by text);
create table dojo_technical_history(id uuid primary key default gen_random_uuid(),legacy_id text unique,class_id uuid,class_date date,technical_group_id uuid,group_grade text,target_grade text,technique_id uuid,technique_grade text,technique_base text,technique_name text,category text,content_type text,proposal_type text,focus text,completed boolean,counts_repetition boolean,notes text);
create table attendance_technical_overrides(attendance_id uuid,plan_id uuid,include_in_history boolean,class_id uuid);
create table attendance_individual_work(attendance_id uuid,mode text,removed_ids uuid[],added_ids uuid[],class_id uuid);
create table class_closure_progress(id text);
`);
// Execute the actual SQL used in production, including visitor attribution triggers.
for(const migration of ['20261114122100_dojo_visits.sql','20261114122200_gainberri_visits.sql','20261114122600_class_visitors.sql'])await pg.exec(read('supabase/migrations/'+migration));
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const db={fail:null,from(table){let mode='select',payload,conflict,filters=[],order='',range='',single=false,columns='';const q={
 select(value){columns=value;return q;},eq(key,value){filters.push([key,'=',value]);return q;},gt(key,value){filters.push([key,'>',value]);return q;},gte(key,value){filters.push([key,'>=',value]);return q;},lte(key,value){filters.push([key,'<=',value]);return q;},in(key,values){filters.push([key,'in',values]);return q;},or(value){filters.push(['individual_work_closing_until','lock',value.split('.lte.')[1]]);return q;},order(key,opts){order=' order by '+quote(key)+(opts?.ascending===false?' desc':'');return q;},range(from,to){range=` limit ${to-from+1} offset ${from}`;return q;},returns(){return q;},single(){single=true;return q;},maybeSingle(){single=true;return q;},update(value){mode='update';payload=value;return q;},delete(){mode='delete';return q;},insert(value){mode='insert';payload=value;return q;},upsert(value,opts){mode='upsert';payload=value;conflict=opts?.onConflict;return q;},then(resolve,reject){return Promise.resolve().then(async()=>{
 try{
 if(db.fail?.(table,mode,payload,filters))throw Error('injected profile failure');
 const args=[],param=value=>{args.push(Array.isArray(value)?'{'+value.join(',')+'}':value);return '$'+args.length;};
 const where=()=>filters.length?' where '+filters.map(([key,op,value])=>op==='in'?(value.length?quote(key)+' in ('+value.map(param).join(',')+')':'false'):op==='lock'?'('+quote(key)+' is null or '+quote(key)+' <= '+param(value)+')':quote(key)+' '+op+' '+param(value)).join(' and '):'';
 let sql;
 if(mode==='select')sql='select * from '+quote(table)+where()+order+range;
 else if(mode==='delete')sql='delete from '+quote(table)+where()+' returning *';
 else if(mode==='update')sql='update '+quote(table)+' set '+Object.entries(payload).map(([key,value])=>quote(key)+'='+param(value)).join(',')+where()+' returning *';
 else {const rows=Array.isArray(payload)?payload:[payload],keys=Object.keys(rows[0]);sql='insert into '+quote(table)+' ('+keys.map(quote).join(',')+') values '+rows.map(row=>'('+keys.map(key=>param(row[key]??null)).join(',')+')').join(',');if(mode==='upsert')sql+=' on conflict ('+quote(conflict)+') do update set '+keys.filter(key=>key!==conflict).map(key=>quote(key)+'=excluded.'+quote(key)).join(',');sql+=' returning *';}
 let {rows}=await pg.query(sql,args);
 rows=rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value instanceof Date ? (/(_on|_date)$/.test(key)?value.toISOString().slice(0,10):value.toISOString()) : value])));
 if(mode==='select'&&table==='attendance_logs'&&columns.includes('members('))rows=await Promise.all(rows.map(async row=>({...row,members:(await pg.query('select * from members where id=$1',[row.member_id])).rows[0]})));
 if(mode==='select'&&table==='member_technique_assignments'&&columns.includes('technical_plans('))rows=await Promise.all(rows.map(async row=>({...row,technical_plans:(await pg.query('select * from technical_plans where id=$1',[row.plan_id])).rows[0],techniques:(await pg.query('select * from techniques where id=$1',[row.technique_id])).rows[0],members:(await pg.query('select * from members where id=$1',[row.member_id])).rows[0]})));
 return {data:single?(rows[0]??null):rows,error:null,count:rows.length};
 }catch(error){return {data:null,error};}
 }).then(resolve,reject);}};return q;},async rpc(name,values){try{const args=Object.values(values).map(value=>Array.isArray(value)?'{'+value.join(',')+'}':value);const result=await pg.query('select * from public.'+quote(name)+'('+Object.keys(values).map((key,index)=>quote(key)+'=> $'+(index+1)).join(',')+')',args);return {data:result.rows,error:null};}catch(error){return {data:null,error};}}};
const createAdminClient=()=>db;
const {loadAllPages}=load('src/lib/load-all-pages.ts',['loadAllPages']);
const heldSnapshots=new AsyncLocalStorage();
const {withIndividualWorkSnapshot,withIndividualWorkSnapshots}=load('src/lib/individual-work-snapshot.ts',['withIndividualWorkSnapshot','withIndividualWorkSnapshots'],{createAdminClient,heldSnapshots});
const {applyIndividualWork,loadIndividualWork}=load('src/lib/attendance-individual-work.ts',['applyIndividualWork','loadIndividualWork'],{createAdminClient});
const {evaluateExamTechnicalReadiness}=load('src/lib/exam-technical-readiness.ts',null);
const excluded=new Set(['getExamRequirement','calculateEngagementStatus','countExpectedTrainingSessions','getExamCalls']);
const statusAst=ts.createSourceFile('status.ts',read('src/lib/member-exam-status.ts'),ts.ScriptTarget.Latest,true);
const statusNames=statusAst.statements.filter(n=>ts.isFunctionDeclaration(n)&&!excluded.has(n.name.text)).map(n=>n.name.text);
const today=new Date(),day=new Date(today.getFullYear(),today.getMonth(),today.getDate()).toISOString().slice(0,10),tomorrow=new Date(today.getTime()+86400000).toISOString().slice(0,10);
// Fixed calendar/requirements fixture; actual attendance, technical readiness,
// semaphore calculation and member updates execute against PostgreSQL below.
const status=load('src/lib/member-exam-status.ts',statusNames,{createAdminClient,loadAllPages,evaluateExamTechnicalReadiness,ADULT_GRADES:['MINARAI','5 KYU','4 KYU','3 KYU','2 KYU','1 KYU','1 DAN'],getExamRequirement:async()=>({min_months:12,attendance_ratio:1,adult_required_repetitions:1,technical_blocks_exam:true}),calculateEngagementStatus:async()=>({attendanceCredit:0,internationalKyuAdvanceMonths:0,notice:'',points180:0}),countExpectedTrainingSessions:async()=>1,getExamCalls:async()=>[{call_date:tomorrow}],resolveExamEligibilityTime:()=>({cycleStartDate:new Date('2020-01-01'),eligibilityDate:new Date(today.getTime()-86400000),isFirstExam:false})});
const invalidated=[];
const {finishClassClosureProgress}=load('src/lib/class-closure-progress.ts',['finishClassClosureProgress'],{createAdminClient,revalidatePath:(...args)=>invalidated.push(args)});
const adult=load('src/lib/adult-class-close.ts',null,{createAdminClient,loadAllPages,withIndividualWorkSnapshot,applyIndividualWork,loadIndividualWork,recalculateClassExamStatus:status.recalculateClassExamStatus});
const {saveClassAttendanceRows}=load('src/lib/class-attendance-save.ts',['saveClassAttendanceRows'],{createAdminClient,withIndividualWorkSnapshot});
const {savePortalAttendance}=load('src/lib/portal-attendance-save.ts',['savePortalAttendance'],{createAdminClient,withIndividualWorkSnapshot,recalculateMemberExamStatus:status.recalculateMemberExamStatus});
const {closePortalAdultClass}=load('src/lib/portal-adult-class-close.ts',['closePortalAdultClass'],{createAdminClient,withIndividualWorkSnapshot,closeAdultClass:adult.closeAdultClass,finishClassClosureProgress});
await pg.exec("insert into dojos(slug) values ('gainberri'),('seishin')");
const technique=randomUUID();await pg.query("insert into techniques(id,name,grade,category) values ($1,'Technique','4 KYU','goho')",[technique]);
for(const [host,origin] of [['seishin','gainberri'],['gainberri','seishin']]){
 const classId=randomUUID(),visitor=randomUUID(),resident=randomUUID();
 for(const [id,dojo] of [[visitor,origin],[resident,host]]){await pg.query("insert into members(id,display_name,first_name,class,grade) values ($1,$2,$2,'adults','5 KYU')",[id,dojo]);await pg.query('insert into dojo_memberships(member_id,dojo_slug) values ($1,$2)',[id,dojo]);}
 await pg.query("insert into classes(id,legacy_id,class_date,class_group,dojo_slug) values ($1,$2,$3,'adults',$4)",[classId,classId,day,host]);
 for(let i=0;i<2;i++)await pg.query("insert into technical_plans(id,class_id,class_date,group_grade,target_grade,technique_id,technique_name,technique_grade,category,proposal_type,completed,used_for_history) values ($1,$2,$3,'5 KYU','4 KYU',$4,'Technique','4 KYU','goho','PROGRAMA',true,true)",[randomUUID(),classId,day,technique]);
 await status.recalculateMemberExamStatus(visitor);
 assert.equal((await pg.query('select semaphore from members where id=$1',[visitor])).rows[0].semaphore,'INACTIVO');
 const add=()=>db.rpc('add_class_visitors',{p_host:host,p_class:classId,p_origin:origin,p_members:[visitor,visitor]});
 for(let i=0;i<2;i++){const result=await add();assert.ifError(result.error);}
 const original=(await pg.query('select * from attendance_logs where class_id=$1 and member_id=$2',[classId,visitor])).rows[0];
 await pg.query("update attendance_logs set technical_note='preserve visitor note' where id=$1",[original.id]);
 const stale=await saveClassAttendanceRows(classId,[{legacy_id:'NEW-ASIS-'+classId+'-'+visitor,class_id:classId,member_id:visitor,attended_on:day,official_grade:'5 KYU',trained_grade:'5 KYU',technical_role:'student',use_for_history:true}]);assert.ifError(stale.error);assert.equal(stale.data[0].id,original.id);
 assert.equal((await pg.query('select technical_note,visit_id from attendance_logs where id=$1',[original.id])).rows[0].technical_note,'preserve visitor note');
 const residentInput={legacy_id:'NEW-ASIS-'+classId+'-'+resident,class_id:classId,member_id:resident,attended_on:day,official_grade:'5 KYU',trained_grade:'5 KYU',technical_role:'student',use_for_history:true};
 const concurrent=await Promise.all([saveClassAttendanceRows(classId,[residentInput]),saveClassAttendanceRows(classId,[residentInput])]);
 assert(concurrent.some(result=>!result.error));assert.equal((await pg.query('select count(*)::int as n from attendance_logs where class_id=$1 and member_id=$2',[classId,resident])).rows[0].n,1,'Concurrent additions must not duplicate attendance');
 if(host==='seishin')await savePortalAttendance(host,classId,[resident],[resident]);
 else {const result=await saveClassAttendanceRows(classId,[{legacy_id:'NEW-ASIS-'+classId+'-'+resident,class_id:classId,member_id:resident,attended_on:day,official_grade:'5 KYU',trained_grade:'5 KYU',technical_role:'student',use_for_history:true}]);assert.ifError(result.error);}
 assert.equal((await pg.query('select count(*)::int as n from attendance_logs where class_id=$1 and member_id=$2',[classId,visitor])).rows[0].n,1,'Stale portal form must preserve later visitor');
 db.fail=(table,mode)=>table==='members'&&mode==='update';
 await assert.rejects(adult.closeAdultClass(classId,async()=>{}),/injected profile failure/);
 assert.equal((await pg.query('select closed from classes where id=$1',[classId])).rows[0].closed,false);
 db.fail=null;
 const worked=(await pg.query('select id from technical_plans where class_id=$1',[classId])).rows.map(row=>row.id);
 if(host==='seishin')await closePortalAdultClass(host,classId,worked);else{await withIndividualWorkSnapshots([classId],async()=>{await adult.closeAdultClass(classId,async()=>{});const competing=await heldSnapshots.run(new Set(),()=>saveClassAttendanceRows(classId,[residentInput]));assert(competing.error,'A separate attendance request cannot enter the rebuild/finalize gap');await finishClassClosureProgress('',[classId]);});}
 await adult.closeAdultClass(classId); // Rebuild/retry must replace, never append.
 const history=(await pg.query('select * from member_technical_history where class_id=$1 and member_id=$2',[classId,visitor])).rows;
 assert.equal(history.length,1,'Duplicate plan entries and repeated closure count once');assert.equal(history[0].progress_dojo_slug,origin);assert.equal(history[0].counts_as_progression,true);
 assert.equal((await pg.query('select count(*)::int as n from attendance_logs where class_id=$1 and member_id=$2',[classId,visitor])).rows[0].n,1);
 const profile=(await pg.query('select semaphore,attendance_count from members where id=$1',[visitor])).rows[0];assert.equal(profile.attendance_count,1);assert.equal(profile.semaphore,'VERDE');
 // A review must not satisfy a ficha's progression requirement or its semaphore.
 await pg.query('update member_technical_history set counts_as_progression=false,counts_as_review=true where class_id=$1 and member_id=$2',[classId,visitor]);await status.recalculateMemberExamStatus(visitor);
 assert.equal((await pg.query('select semaphore from members where id=$1',[visitor])).rows[0].semaphore,'ROJO');
 await adult.closeAdultClass(classId);
 assert.equal((await pg.query('select semaphore from members where id=$1',[visitor])).rows[0].semaphore,'VERDE');
 assert.equal((await pg.query('select count(*)::int as n from members where id=$1',[visitor])).rows[0].n,1);
 assert(invalidated.some(([path])=>path==='/ficha/[token]'));
 const late=await saveClassAttendanceRows(classId,[{...residentInput,member_id:randomUUID(),legacy_id:randomUUID()}]);assert(late.error,'Stale attendance must not insert after final closure');
 if(host==='seishin'){
   await pg.query("update classes set closed=false,status='pending' where id=$1",[classId]);
   await savePortalAttendance(host,classId,[resident],[resident,visitor]);
   assert.equal((await pg.query('select count(*)::int as n from attendance_logs where class_id=$1 and member_id=$2',[classId,visitor])).rows[0].n,0);
   db.fail=(table,mode,payload,filters)=>table==='members'&&mode==='update'&&filters.some(([key,op,value])=>key==='id'&&value===visitor);
   await assert.rejects(closePortalAdultClass(host,classId,worked),/injected profile failure/);
   assert.equal((await pg.query('select count(*)::int as n from member_technical_history where class_id=$1 and member_id=$2',[classId,visitor])).rows[0].n,1,'Failed removal recalculation retains the visitor identity for retry');
   db.fail=null;
   await closePortalAdultClass(host,classId,worked);
   assert.equal((await pg.query('select count(*)::int as n from member_technical_history where class_id=$1 and member_id=$2',[classId,visitor])).rows[0].n,0);
   assert.equal((await pg.query('select semaphore from members where id=$1',[visitor])).rows[0].semaphore,'INACTIVO');
 }
 console.log('PASS PostgreSQL:',origin,'->',host,'attendance identity, stale lists, origin, deduped techniques, retry, member status and progression predicate');
}
const groupedIds=[randomUUID(),randomUUID()];
for(const id of groupedIds)await pg.query("insert into classes(id,class_date,class_group,dojo_slug) values ($1,$2,'kids','gainberri')",[id,day]);
await assert.rejects(withIndividualWorkSnapshots([...groupedIds,groupedIds[0]],async()=>{await withIndividualWorkSnapshot(groupedIds[0],async()=>{});throw Error('group failure');}),/group failure/);
assert.equal((await pg.query('select count(*)::int as n from classes where id=any($1::uuid[]) and individual_work_closing_until is not null',['{'+groupedIds.join(',')+'}'])).rows[0].n,0);
console.log('PASS PostgreSQL: grouped child/adult locks are reentrant and release all classes on failure');
await pg.close();

import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import vm from 'node:vm';
import ts from 'typescript';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
function moduleOf(path,bindings={}){const code=ts.transpileModule(read(path),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;const exports={};const scope=vm.createContext({exports,Date,Map,Set,console,...bindings});vm.runInContext(code,scope);return exports;}
const core=moduleOf('src/lib/ficha-activity.ts');
const token='test-ficha',sessionId=randomUUID();const sample={id:randomUUID(),kind:'time',section:'progress',seconds:15};
assert(core.parseFichaActivity({token,sessionId,events:[sample]}));
for(const bad of [{...sample,seconds:16},{...sample,seconds:-1},{...sample,kind:'video',seconds:1},{...sample,section:'constructor'},{...sample,resourceId:'https://private/token'},{...sample,label:'secret\ntext'}])assert.equal(core.parseFichaActivity({token,sessionId,events:[bad]}),null);
assert.equal(core.parseFichaActivity({token,sessionId,events:Array(21).fill(sample)}),null);
assert.equal(core.activeElapsedSeconds(1000,2000,1000,true,true),1);
for(const args of [[1000,2000,1000,false,true],[1000,2000,1000,true,false],[1000,92000,0,true,true],[1000,70000,69000,true,true]])assert.equal(core.activeElapsedSeconds(...args),0);
const row={id:sample.id,member_id:'member',session_id:sessionId,kind:'time',section:'progress',active_seconds:15,resource_id:null,resource_label:null,created_at:'2026-11-19T10:00:00Z'};
const summary=core.summarizeFichaActivity([row,row,{...row,id:randomUUID(),kind:'video',active_seconds:0,resource_label:'Giwa · Tan-en'},{...row,id:randomUUID(),kind:'technique',active_seconds:0,resource_label:'Giwa · Sotai'}]);
assert.equal(summary.seconds,15);assert.equal(summary.sessions,1);assert.equal(summary.videoCount,1);assert.equal(summary.techniqueCount,1);
assert.notEqual(core.activityTechniqueLabel({name:'Giwa',content_type:'KATA_TANEN'}),core.activityTechniqueLabel({name:'Giwa',content_type:'KATA_SOTAI'}));
// Execute the actual browser effect with a deterministic clock and DOM surface.
let now=1000,cleanup,focused=true,visible='visible';const timers=new Map(),listeners=new Map(),requests=[],beacons=[];let timerId=0;
class TestElement{constructor(data={}){this.dataset=data;}closest(selector){if(selector.includes('data-ficha-video'))return this.dataset.fichaVideo?this:null;if(selector.includes('data-ficha-technique'))return this.dataset.fichaTechnique?this:null;if(selector.includes('data-ficha-section'))return new TestElement({fichaSection:'progress'});return null;}}
class TestDetails extends TestElement{}
let point=new TestElement({fichaTechnique:randomUUID(),fichaLabel:'Giwa · Tan-en'});
const add=(name,fn)=>{const list=listeners.get(name)??[];list.push(fn);listeners.set(name,list);},remove=(name,fn)=>listeners.set(name,(listeners.get(name)??[]).filter(v=>v!==fn));
const window={innerWidth:800,innerHeight:900,setInterval:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},addEventListener:add,removeEventListener:remove};
const document={get visibilityState(){return visible;},get hidden(){return visible==='hidden';},hasFocus:()=>focused,elementFromPoint:()=>point,addEventListener:add,removeEventListener:remove};
const storage=new Map();const sessionStorage={getItem:key=>storage.get(key),setItem:(key,value)=>storage.set(key,value)};
const Clock=class extends Date{static now(){return now;}};
let failNext=false;
const tracker=moduleOf('src/components/ficha-activity-tracker.tsx',{Date:Clock,crypto:{randomUUID},window,document,Element:TestElement,HTMLDetailsElement:TestDetails,sessionStorage,navigator:{sendBeacon:(url,body)=>{beacons.push(body);return true;}},Blob,clearInterval:id=>timers.delete(id),fetch:async(url,options)=>{requests.push(JSON.parse(options.body));if(failNext){failNext=false;return {ok:false,status:503};}return {ok:true,status:204};},require:name=>name==='react'?{useEffect:fn=>{cleanup=fn();}}:core});
tracker.FichaActivityTracker({token});await new Promise(setImmediate);
const tick=()=>timers.get(1).fn();const send=async()=>{timers.get(2).fn();await new Promise(setImmediate);};
for(let n=0;n<5;n++){now+=1000;tick();}await send();
const total=()=>requests.flatMap(body=>body.events).filter(event=>event.kind==='time').reduce((sum,event)=>sum+event.seconds,0);
assert.equal(total(),5);assert(requests.flatMap(body=>body.events).some(event=>event.kind==='technique'));
visible='hidden';for(let n=0;n<5;n++){now+=1000;tick();}await send();assert.equal(total(),5);
visible='visible';focused=false;for(let n=0;n<5;n++){now+=1000;tick();}await send();assert.equal(total(),5);
focused=true;now+=91000;tick();await send();assert.equal(total(),5);
for(const fn of listeners.get('pointerdown')??[])fn();now+=1000;tick();failNext=true;await send();const failedIds=requests.at(-1).events.map(event=>event.id);await send();assert.deepEqual(requests.at(-1).events.map(event=>event.id),failedIds,'Retry must reuse event IDs');
const video=new TestElement({fichaTechnique:point.dataset.fichaTechnique,fichaLabel:'Giwa · Tan-en',fichaVideo:'Giwa · Tan-en'});for(const fn of listeners.get('click')??[])fn({target:video});await new Promise(setImmediate);assert(requests.flatMap(body=>body.events).some(event=>event.kind==='video'&&event.label==='Giwa · Tan-en'));
cleanup();assert.equal(timers.size,0);
console.log('PASS: payload bounds, variant identity, event deduplication, actual tracker pause/resume/idle, dwell, video clicks and retry IDs');
// Actual PostgreSQL constraints/RPC: install optional @electric-sql/pglite@0.3.14
// under OS temp/skbc-visitor-sql-tests, or set SKBC_PGLITE_MODULE.
const {PGlite}=await import(pathToFileURL(process.env.SKBC_PGLITE_MODULE??join(tmpdir(),'skbc-visitor-sql-tests/node_modules/@electric-sql/pglite/dist/index.js')).href);const pg=new PGlite();
await pg.exec("create role anon;create role authenticated;create role service_role;create table members(id uuid primary key,status text);");
await pg.exec(read('supabase/migrations/202611190001_ficha_activity.sql'));
const member=randomUUID(),other=randomUUID();await pg.query("insert into members values ($1,'active'),($2,'active')",[member,other]);
const record=async(memberId,sid,events)=>pg.query('select record_ficha_activity($1::uuid,$2::uuid,$3::jsonb)',[memberId,sid,JSON.stringify(events)]);
await record(member,sessionId,[sample]);await record(member,sessionId,[sample]);
assert.equal((await pg.query('select active_seconds from member_ficha_activity_sessions where id=$1',[sessionId])).rows[0].active_seconds,15);
assert.equal((await pg.query('select count(*)::int as n from member_ficha_activity_events')).rows[0].n,1);
await assert.rejects(record(other,sessionId,[{...sample,id:randomUUID()}]),/owner mismatch/);
await record(member,sessionId,[{...sample,id:randomUUID()}]);
await assert.rejects(record(member,sessionId,[{...sample,id:randomUUID(),seconds:1}]),/Impossible active duration/);
assert.equal((await pg.query('select count(*)::int as n from member_ficha_activity_events')).rows[0].n,2,'Invalid duration rolls back inserted event');
await assert.rejects(record(member,randomUUID(),Array(21).fill(sample)),/Invalid activity batch/);
const policies=await pg.query("select relname,relrowsecurity from pg_class where relname in ('member_ficha_activity_events','member_ficha_activity_sessions')");assert(policies.rows.every(row=>row.relrowsecurity));
assert.equal((await pg.query("select has_function_privilege('anon','public.record_ficha_activity(uuid,uuid,jsonb)','EXECUTE') as allowed")).rows[0].allowed,false);
const oldSession=randomUUID();await pg.query("insert into member_ficha_activity_sessions(id,member_id,started_at) values($1,$2,now()-interval '91 days')",[oldSession,member]);await pg.query("insert into member_ficha_activity_events(id,session_id,member_id,kind,section) values($1,$2,$3,'section','overview')",[randomUUID(),oldSession,member]);
await record(member,randomUUID(),[{id:randomUUID(),kind:'video',section:'progress',seconds:0,label:'Giwa · Sotai'}]);
assert.equal((await pg.query('select count(*)::int as n from member_ficha_activity_sessions where id=$1',[oldSession])).rows[0].n,0);
assert.equal((await pg.query('select count(*)::int as n from member_ficha_activity_events where session_id=$1',[oldSession])).rows[0].n,0);
await pg.close();console.log('PASS PostgreSQL: exact telemetry migration, idempotent retries, session ownership, time budget, rollback, RLS and 90-day retention');
// Endpoint privacy: only admin can query status; students can submit their own
// bounded events but never receive activity rows or aggregated statistics.
const routeText=read('src/app/api/ficha/activity/route.ts');
const routeAst=ts.createSourceFile('route.ts',routeText,ts.ScriptTarget.Latest,true);
const declarations=routeAst.statements.filter(node=>ts.isFunctionDeclaration(node)).map(node=>node.getText(routeAst)).join('\n').replace(/export /g,'');
const endpointCode=ts.transpileModule(declarations,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let internal=false,dbTouched=0,rpcPayload;
const apiDb={from:table=>{dbTouched++;const q={select:()=>q,eq:()=>q,limit:async()=>({error:null}),maybeSingle:async()=>({data:{id:'member'},error:null})};return q;},rpc:async(name,payload)=>{rpcPayload=payload;return {error:null};}};
const apiScope=vm.createContext({NextResponse:Response,hasInternalAccess:async()=>internal,createAdminClient:()=>apiDb,parseFichaActivity:core.parseFichaActivity});
vm.runInContext(endpointCode+';this.api={GET,POST};',apiScope);
assert.equal((await apiScope.api.GET()).status,401);assert.equal(dbTouched,0);
const post=()=>new Request('https://skbc.test/api/ficha/activity',{method:'POST',body:JSON.stringify({token,sessionId,events:[sample]})});
assert.equal((await apiScope.api.POST(post())).status,204);assert.equal(rpcPayload.p_member,'member');assert(!JSON.stringify(rpcPayload).includes(token));
internal=true;dbTouched=0;assert.equal((await apiScope.api.POST(post())).status,204);assert.equal(dbTouched,0,'Admin browsing is never recorded');
assert.equal((await apiScope.api.GET()).status,200);
assert(read('src/app/actividad-fichas/page.tsx').includes('if (!(await hasInternalAccess())) redirect("/skbc-interno")'));
assert(!read('src/app/ficha/[token]/page.tsx').includes('member_ficha_activity_events'));
console.log('PASS: activity dashboard/status are admin-only, browser submissions return no metrics, and admin previews are excluded');

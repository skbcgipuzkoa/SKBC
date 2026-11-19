import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
const text=read('src/app/actions.ts');const ast=ts.createSourceFile('actions.ts',text,ts.ScriptTarget.Latest,true);
const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='createClassAction');assert(fn);
const code=ts.transpileModule(fn.getText(ast).replace('export ',''),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
async function run({dojo=false,group='combined',failPlan=false}={}) {
 const events=[];let count=0;
 const db={from:table=>({insert:payload=>{events.push(['insert',table,payload.class_group]);return {select:()=>({single:async()=>({data:{id:'class-'+(++count),legacy_id:'NEW-'+count},error:null})})};}})};
 const context=vm.createContext({Date,console:{...console,error:()=>{}},hasInternalAccess:async()=>true,parseDateInput:v=>v,normalizeClass:v=>v==='kids'?'kids':v==='combined'?null:'adults',isSpecialClassType:()=>false,emptyToNull:v=>v||null,createAdminClient:()=>db,generateAdultTechnicalGroups:async id=>events.push(['groups',id]),generateAdultTechnicalPlan:async id=>{events.push(['plan',id]);if(failPlan)throw Error('plan failed');},prepareVisitorPlan:async(host,id)=>{events.push(["prepare",host,id]);if(failPlan)throw Error("plan failed");},errorMessage:e=>e.message,redirect:path=>{throw new Error('REDIRECT:'+path);}});
 vm.runInContext(code+';this.create=createClassAction;',context);
 const form=new FormData();form.set('classDate','2026-11-19');form.set('name','Clase dojo');form.set('classGroup',group);if(dojo)form.set('dojoFlow','1');
 let destination;try{await context.create(form);}catch(error){if(!error.message.startsWith('REDIRECT:'))throw error;destination=error.message.slice(9);}
 return {events,destination};
}
for(const dojo of [true,false]) {
 const result=await run({dojo});assert.equal(result.events.filter(e=>e[0]==='insert').length,2);
 assert(result.events.some(e=>e[0]==='prepare'&&e[1]==='gainberri'));assert(!result.events.some(e=>e[0]==='groups'),'Ordinary preparation must remain scoped to the host roster');
 assert(!result.destination.includes('visitantes'));assert(result.destination.startsWith(dojo?'/skbc-interno/dojo/':'/clases/'));
}
const child=await run({dojo:true,group:'kids'});assert(!child.events.some(e=>e[0]==='plan'));assert(!child.destination.includes('visitantes'));
const failed=await run({dojo:true,failPlan:true});assert(failed.destination.includes('error=prepare'));
for(const page of ['src/app/portal/[dojo]/clases/page.tsx','src/app/portal/[dojo]/modo-dojo/page.tsx'])assert(!read(page).includes('/visitantes`'),'Portal creation must not require visitor screen');
const picker=read('src/components/class-visitor-picker.tsx');assert(picker.includes('Añadir kenshis de otro dojo'));assert(picker.includes('<details className="provisional-attendance class-visitor-disclosure">'));
const dojoPage=read('src/app/dojo/[legacyId]/page.tsx');assert(dojoPage.includes('classId={kidsClass.id} group="kids"'));assert(dojoPage.includes('classId={adultClass.id} group="adults"'));
const classes=read('src/app/clases/[legacyId]/page.tsx');assert(classes.includes('classId={kidsDayClass.id} group="kids" returnTo={`/clases/${legacyId}?section=kids-attendance#asistencia-ninos-rapida`}'));
console.log('PASS: new classes bypass visitor screen, still prepare adult plan, report preparation failure, and expose visitors from child/adult attendance');

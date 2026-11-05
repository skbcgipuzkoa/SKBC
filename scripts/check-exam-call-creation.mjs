import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('src/app/actions.ts','utf8');
const start=source.indexOf('export async function createIntegratedExamEventAction(');
const end=source.indexOf('\nexport async function ',start+1);
const code=ts.transpileModule(source.slice(start,end).replace('export async','async'),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
let payload,authorized=true;
const context={Set,Number,String,Array,console,hasInternalAccess:async()=>authorized,redirect:url=>{throw Error('redirect:'+url)},parseDateInput:value=>value,revalidatePath:()=>{},createIntegratedExamEvent:async input=>{payload=input},errorMessage:error=>error.message};
vm.createContext(context);vm.runInContext(code+';this.action=createIntegratedExamEventAction',context);
for(const value of [undefined,'true','false','on']) {
 const form=new FormData();form.set('memberIds','synthetic');form.set('examDate','2027-01-23');if(value)form.set('isRetake',value);
 await assert.rejects(context.action(form),/redirect:.*saved=integrated/);
 assert.equal(payload.isRetake,value==='true');assert.equal(payload.examDate,'2027-01-23');
}
authorized=false;payload=null;await assert.rejects(context.action(new FormData()),/redirect:\//);assert.equal(payload,null);
console.log('Normal exam creation action forwards explicit retake metadata; auth guard verified');
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url),creation={exports:{}};
const dependencies={
 '@/lib/integrated-exam-assignments':{resolveAdultExamTargetGrade:()=>null},
 '@/lib/grades':{adultGrades:[]},
 '@/lib/child-program':{CHILD_PROGRAM_GRADES:[],resolveChildExamScopeTargets:()=>[],resolveChildExamGrades:()=>[],resolveChildExamTargetGrade:()=>null},
 '@/app/actions':{createIntegratedExamEventAction:()=>{}},
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/examenes/IntegratedExamCreateForm.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:creation.exports,require:name=>dependencies[name]??require(name)});
const html=renderToStaticMarkup(React.createElement(creation.exports.IntegratedExamCreateForm,{adultMembers:[],kidMembers:[],catalogAssignments:[]}));
assert.match(html,/<input[^>]*name="isRetake"[^>]*type="checkbox"[^>]*value="true"|<input[^>]*type="checkbox"[^>]*name="isRetake"[^>]*value="true"/);
assert.match(html,/diciembre anterior/);
assert.doesNotMatch(html,/<input[^>]*name="isRetake"[^>]*checked/);
console.log('Actual creation form SSR exposes opt-in retake checkbox and December attribution explanation');

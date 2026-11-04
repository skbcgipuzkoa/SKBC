import assert from 'node:assert/strict';
import { classifyCatalogContent, catalogGrades, catalogGrade, groupCatalogContent } from '../src/lib/admin-technical-catalog.ts';
import { loadAllPages } from '../src/lib/load-all-pages.ts';
import * as catalog from '../src/lib/admin-technical-catalog.ts';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
const rows = [
  {id:'j', name:'Kata muna otoshi', category:'juho', content_type:'TECNICA', grade:'5 KYU'},
  {id:'k', category:'goho', content_type:'KATA_TANEN', grade:'5 KYU'},
  {id:'h', category:'hokei', content_type:null, grade:'CONJUNTA', active:false},
  {id:'u', category:'ukemi', content_type:'UKEMI', grade:'GLOBAL'},
  {id:'x', category:'kihon', content_type:null, grade:' '},
  {id:'y', category:'seiho', content_type:null, grade:'Especial'}
];
assert.equal(classifyCatalogContent(rows[0]), 'techniques');
assert.equal(classifyCatalogContent(rows[1]), 'kata');
assert.equal(classifyCatalogContent(rows[2]), 'kata');
assert.equal(classifyCatalogContent({category:'hokei',content_type:'UKEMI'}),'other','explicit content type wins over legacy category');
assert.equal(classifyCatalogContent({category:'goho',content_type:'SEIHO'}),'other');
assert.equal(classifyCatalogContent({category:'hokei',content_type:'TECNICA'}),'kata','generic legacy type falls back to hokei');
assert.deepEqual(groupCatalogContent(rows).map(g=>[g.id,g.rows.map(r=>r.id)]), [['techniques',['j']],['kata',['k','h']],['other',['u','x','y']]]);
const grades = catalogGrades(rows, ['MINARAI','5 KYU','4 KYU']);
assert.equal(grades[0], '5 KYU');
assert.equal(grades.length,5);
assert.equal(grades.flatMap(g=>rows.filter(r=>catalogGrade(r.grade)===g)).length,rows.length);
assert.equal(catalogGrade(null), 'Sin grado');
const source = Array.from({length:2105},(_,id)=>({id}));
const ranges=[];
const all=await loadAllPages(async(from,to)=>{ranges.push([from,to]);return {data:source.slice(from,to+1),error:null};});
assert.equal(all.length,2105);
assert.deepEqual(ranges,[[0,999],[1000,1999],[2000,2999]]);
await assert.rejects(()=>loadAllPages(async()=>({data:null,error:new Error('load failed')})), /load failed/);
// Render the real server page with paginated records, including non-official grades.
const records=Array.from({length:1002},(_,id)=>({id:`id-${id}`, legacy_id:`L-${id}`,name:`Technical ${id}`,grade:'5 KYU',category:'goho',content_type:'TECNICA',active:true,active_in_planning:true,repetitions:0,summary_es:'A complete explanation for the test curriculum.',last_trained_on:null}));
records.push(...rows.slice(1).map(row=>({...records[0],...row,legacy_id:row.id,name:`Content ${row.id}`})));
const requests=[];
let authorized=true;
const db={from(table){assert.equal(table,'techniques');let from=0,to=999;const orders=[];const q={select(){return q},order(column){orders.push(column);return q},range(a,b){from=a;to=b;return q},returns(){return q},then(resolve){requests.push({from,to,orders});return Promise.resolve({data:records.slice(from,to+1),error:null}).then(resolve)}};return q}};
const mod={exports:{}};
const dependencies={
  'react/jsx-runtime':jsx,
  'next/navigation':{redirect(path){throw new Error(`REDIRECT:${path}`)}},
  '@/app/components/SidebarNav':{SidebarNav:()=>null},
  '@/app/components/SubmitButton':{SubmitButton:({children})=>React.createElement('button',null,children)},
  '@/app/actions':{logoutAction:()=>{},updateTechniqueAction:()=>{}},
  '@/lib/auth':{hasInternalAccess:async()=>authorized},
  '@/lib/grades':{adultGrades:['MINARAI','5 KYU','4 KYU']},
  '@/lib/admin-technical-catalog':catalog,
  '@/lib/load-all-pages':{loadAllPages},
  '@/lib/kamoku-summary-fallbacks':{getKamokuSummaryFallback:()=>null},
  '@/lib/supabase/admin':{createAdminClient:()=>db},
  '@/lib/technique-summary-adapter':{adaptTechniqueSummary:()=>''},
  'lucide-react':Object.fromEntries(['BookOpenCheck','CheckCircle2','ExternalLink','Filter','LogOut','RotateCcw'].map(key=>[key,()=>null]))
};
vm.runInNewContext(ts.transpileModule(readFileSync('src/app/tecnicas/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,require(name){assert.ok(dependencies[name],`Unexpected dependency ${name}`);return dependencies[name]},URLSearchParams,Set,Map,Intl});
const render=async(params={})=>renderToStaticMarkup(await mod.exports.default({searchParams:Promise.resolve(params)}));
let markup=await render();
assert.equal((markup.match(/class="technique-admin-card"/g)||[]).length,records.length,'every loaded record appears once');
assert.match(markup,/CONJUNTA/);assert.match(markup,/GLOBAL/);assert.match(markup,/Sin grado/);assert.match(markup,/ESPECIAL/);
assert.deepEqual(requests.map(r=>[r.from,r.to]),[[0,999],[1000,1999]]);
assert.ok(requests.every(r=>r.orders.join(',')==='name,id'));
assert.ok(markup.indexOf('id="catalogo-tecnico"')<markup.indexOf('Revision tecnica'),'catalog before audits');
markup=await render({kind:'kata',grade:'CONJUNTA',status:'inactive'});
assert.equal((markup.match(/class="technique-admin-card"/g)||[]).length,1);
assert.match(markup,/name="returnPath" value="\/tecnicas\?kind=kata&amp;grade=CONJUNTA&amp;status=inactive"/);
assert.match(markup,/name="kind" value="kata"/);
assert.match(markup,/Katas por grado/);
markup=await render({q:'katas'});
assert.equal((markup.match(/class="technique-admin-card"/g)||[]).length,2);
markup=await render({kind:'other',grade:'Sin grado'});
assert.equal((markup.match(/class="technique-admin-card"/g)||[]).length,1);
const before=requests.length;authorized=false;
await assert.rejects(()=>render(),/REDIRECT:\/skbc-interno/);
assert.equal(requests.length,before,'unauthorized request never loads catalog');
console.log('Admin technical catalog checks passed: classification, all grades, real page filters/auth and >1000 rows');

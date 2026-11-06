import assert from 'node:assert/strict';
import { classifyCatalogContent, catalogGrades, catalogGrade, groupCatalogContent } from '../src/lib/admin-technical-catalog.ts';
import { loadAllPages } from '../src/lib/load-all-pages.ts';
import * as catalog from '../src/lib/admin-technical-catalog.ts';
import * as techniqueIdentity from '../src/lib/adult-exam-technique-identity.ts';
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
assert.equal(classifyCatalogContent({category:'goho',content_type:'PROGRAMA'}),'techniques');
assert.equal(classifyCatalogContent({category:'JUHO',content_type:'PROGRAMA'}),'techniques');
assert.equal(classifyCatalogContent({category:'hokei',content_type:'PROGRAMA'}),'other');
assert.equal(classifyCatalogContent({category:'goho',content_type:'KATA_SOTAI'}),'kata');
assert.equal(classifyCatalogContent({category:'juho',content_type:'UKEMI'}),'other');
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
  '@/lib/adult-exam-technique-identity':techniqueIdentity,
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
authorized=true;
records[0].video_url='https://example.com/training?id=1';records[0].video_title='Demostración';
markup=await render({edit:'L-0'});
assert.match(markup,/name="videoUrl"[^>]*type="url"|type="url"[^>]*name="videoUrl"/);
assert.match(markup,/value="https:\/\/example.com\/training\?id=1"/);
assert.match(markup,/name="videoTitle"[^>]*value="Demostración"/);
assert.match(markup,/name="applyVideoAllGrades"/);
assert.doesNotMatch(markup,/<input[^>]*name="applyVideoAllGrades"[^>]*checked/);
assert.match(markup,/Sustituye el enlace y el título existentes/);
markup=await render({edit:'L-0',error:'technique-video'});
assert.match(markup,/El enlace del vídeo debe ser una dirección completa/);
assert.match(markup,/class="inline-edit-details" open=""/);
markup=await render({edit:'L-0',error:'technique-video-bulk-partial'});
assert.match(markup,/Este contenido se ha guardado, pero no se ha podido completar/);
console.log('Admin technical catalog checks passed: classification, all grades, real page filters/auth and >1000 rows');

// Metadata-only variants and reference modes must survive the read-only global audit.
const initialRecords=records.slice();
const auditRow=(id,changes={})=>({...initialRecords[0],id,legacy_id:null,video_title:'fixture-'+id,name:'Juji gote',base_name:'Juji gote',variant:null,variant_note:null,grade:'2 KYU',category:'JUHO',content_type:'PROGRAMA',active:true,...changes});
records.splice(0,records.length,
 auditRow('katate',{variant:'Katate'}),auditRow('ryote',{variant:'Ryote'}),
 auditRow('copy-a',{name:'Gyaku gote',base_name:'Gyaku gote'}),auditRow('copy-b',{name:'Gyaku gote',base_name:'Gyaku gote'}),
 auditRow('archived-copy',{name:'Gyaku gote',base_name:'Gyaku gote',active:false}),
 auditRow('other-grade',{name:'Gyaku gote',base_name:'Gyaku gote',grade:'1 KYU'}),
 auditRow('note-variant',{variant:'Katate',variant_note:'Different grip detail'}),
 auditRow('tanen',{name:'Tenchi ken dai ichi',category:'HOKEI',content_type:'KATA_TANEN'}),
 auditRow('sotai',{name:'Tenchi ken dai ichi',category:'HOKEI',content_type:'KATA_SOTAI'})
);
markup=await render({status:'duplicate-name'});
assert.equal((markup.match(/class="technique-admin-card"/g)||[]).length,2,'Only exact active semantic duplicates flagged, not valid variants/notes/grades/modes/inactive');
assert.match(markup,/fixture-copy-a/);
assert.match(markup,/fixture-copy-b/);
assert.doesNotMatch(markup,/fixture-katate/);
assert.doesNotMatch(markup,/fixture-note-variant/,'Distinct noted variant is not an exact identity duplicate');
records.push(auditRow('unrepresented-group',{name:'Kiri gote (katate & morote)',base_name:'Kiri gote'}));
markup=await render({status:'duplicate-base'});
assert.equal((markup.match(/class="technique-admin-card"/g)||[]).length,0,'Split metadata variants alone are not overlaps');
records.push(auditRow('grouped',{name:'Juji gote (katate & ryote)'}));
markup=await render({status:'duplicate-base'});
assert.equal((markup.match(/class="technique-admin-card"/g)||[]).length,4,'Unqualified grouped row overlaps both variants and the distinct noted child');
for(const id of ['grouped','katate','ryote','note-variant'])assert.ok(markup.includes('fixture-'+id));
assert.match(markup,/no fusionan ni eliminan/);
const sourceIds=records.map(row=>row.id);await render();assert.deepEqual(records.map(row=>row.id),sourceIds,'Audit never removes catalogue IDs/history rows');
records.splice(0,records.length,...initialRecords);
console.log('Real catalogue page semantic duplicate audit passed: variants, notes, grades, kata modes, inactive and grouped overlaps.');

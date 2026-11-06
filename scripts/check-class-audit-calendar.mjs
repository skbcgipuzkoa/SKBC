import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import {loadAllPages} from '../src/lib/load-all-pages.ts';

const classes=Array.from({length:60},(_,i)=>({
  id:`class-${i}`,legacy_id:`CLASS-${i}`,class_date:new Date(Date.UTC(2026,8,8+i)).toISOString().slice(0,10),
  name:`Class ${i}`,class_group:i%2?'adults':'kids',class_type:'NORMAL',responsible:'Teacher',status:'closed',closed:true,plan_generated:true,
}));
const attendance=classes.flatMap(c=>Array.from({length:20},(_,j)=>({id:`attendance-${String(Number(c.id.slice(6))*20+j).padStart(4,'0')}`,class_id:c.id,member_id:`member-${j}`,members:{class:c.class_group,display_name:`Pupil ${j}`}})));
const plans=classes.flatMap(c=>Array.from({length:20},(_,j)=>({id:`plan-${String(Number(c.id.slice(6))*20+j).padStart(4,'0')}`,class_id:c.id,completed:j<10})));
let authorized=true,failure=null;
const requests=[];
const db={from(table){
  assert.ok(['classes','attendance_logs','technical_plans'].includes(table));
  let from=0,to=999,limit=Infinity;const filters=[],orders=[];
  const q={select(){return q},eq(key,value){filters.push(row=>row[key]===value);return q},in(key,values){filters.push(row=>values.includes(row[key]));return q},order(key,options={}){orders.push([key,options.ascending!==false]);return q},limit(n){limit=n;return q},range(a,b){from=a;to=b;return q},returns(){return q},then(resolve,reject){
    requests.push({table,from,to,orders});
    if(failure?.table===table && failure.from===from)return Promise.resolve({data:null,error:new Error('Synthetic read failure')}).then(resolve,reject);
    let rows=({classes,attendance_logs:attendance,technical_plans:plans})[table].filter(row=>filters.every(test=>test(row)));
    rows=rows.slice().sort((a,b)=>{for(const [key,asc] of orders){const result=String(a[key]).localeCompare(String(b[key]));if(result)return asc?result:-result;}return 0;});
    return Promise.resolve({data:rows.slice(0,limit).slice(from,to+1),error:null}).then(resolve,reject);
  }};return q;
}};
const dependencies={
  'react/jsx-runtime':jsx,'next/navigation':{redirect(path){throw new Error('REDIRECT:'+path)}},
  '@/app/actions':{logoutAction:()=>{}},'@/app/components/SidebarNav':{SidebarNav:()=>null},
  '@/lib/auth':{hasInternalAccess:async()=>authorized},'@/lib/supabase/admin':{createAdminClient:()=>db},
  '@/lib/load-all-pages':{loadAllPages},'lucide-react':Object.fromEntries(['CalendarDays','FileSearch','LogOut'].map(name=>[name,()=>null])),
};
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('src/app/actas-clase/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{exports:mod.exports,require(name){assert.ok(dependencies[name],name);return dependencies[name]}});
const render=async(params={})=>renderToStaticMarkup(await mod.exports.default({searchParams:Promise.resolve(params)}));
let html=await render();
for(const i of [0,58,59]){
  const anchors=[...html.matchAll(new RegExp(`<a[^>]*href="/clases/CLASS-${i}"[^>]*>([\\s\\S]*?)</a>`,'g'))];
  assert.ok(anchors.length,'Calendar links exist for '+i);
  assert.ok(anchors.every(match=>match[1].includes('20 asis. · 10/20 tec.')),'Latest children/adults counts must include rows after the first 1000: '+i);
}
for(const table of ['attendance_logs','technical_plans']){
  assert.deepEqual(requests.filter(r=>r.table===table).map(r=>[r.from,r.to]),[[0,999],[1000,1999]]);
  assert.ok(requests.filter(r=>r.table===table).every(r=>r.orders.some(([key])=>key==='id')),'Pagination needs stable unique ordering');
}
html=await render({date:classes[59].class_date});
assert.match(html,/20 asis\. · 10\/20 tec\./);
assert.doesNotMatch(html,/href="\/clases\/CLASS-58"/);
html=await render({q:'No matching class'});assert.match(html,/Sin resultados/);
for(const table of ['attendance_logs','technical_plans']){
  failure={table,from:1000};
  await assert.rejects(()=>render(),/Synthetic read failure/,'Read errors must never become false zero counts');
}
failure=null;authorized=false;const before=requests.length;
await assert.rejects(()=>render(),/REDIRECT:\/skbc-interno/);assert.equal(requests.length,before);
console.log('Real class-audit calendar: >1000 attendance/plan records, latest kids/adults, filters, errors and auth passed. No database writes.');

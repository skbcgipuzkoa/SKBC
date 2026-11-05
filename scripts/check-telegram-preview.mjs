import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';

let allowed=true;
const calls=[];
const loaded={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/notificaciones/vista-previa/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:loaded.exports,
  require(name){
    if(name==='react/jsx-runtime')return jsx;
    if(name==='@/lib/auth')return {hasInternalAccess:async()=>allowed};
    if(name==='next/navigation')return {redirect:(path)=>{throw Error(`redirect:${path}`)}};
    if(name==='@/lib/telegram-notifications')return {buildNotificationMessage:async(type)=>{calls.push(type);return '<b>Resumen</b>\nAna &lt;script&gt; &amp; Luis'}};
    throw Error(`Unexpected dependency ${name}`);
  },
});
const page=loaded.exports.default;
for(const tipo of ['daily_ranking','monthly_stats','semester_stats','yearly_stats']){
  const rendered=renderToStaticMarkup(await page({searchParams:Promise.resolve({tipo})}));
  assert(rendered.includes('Ana &lt;script&gt; &amp; Luis'));
  assert(!rendered.includes('<script>'));
  assert(rendered.includes('No envia mensajes'));
  assert.equal(calls.at(-1),tipo);
}
const count=calls.length;
await page({searchParams:Promise.resolve({tipo:'invalid'})});
assert.equal(calls.length,count,'only approved summary types may render');
allowed=false;
await assert.rejects(()=>page({searchParams:Promise.resolve({})}),/redirect:\/skbc-interno/);
assert.equal(calls.length,count,'authorization before fetching statistics');
console.log('Telegram read-only preview checks passed');

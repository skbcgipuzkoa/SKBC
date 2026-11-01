import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
import * as display from '../src/lib/technical-progress-display.ts';
const mod={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/exam-preparation-notice.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
  exports:mod.exports,require:(name)=>name==='react/jsx-runtime'?jsx:display,
});
const render=(focus)=>renderToStaticMarkup(React.createElement(mod.exports.ExamPreparationNotice,{focus}));
const benefit='esta propuesta reduciria 3 repeticiones pendientes para 3 kenshis.';
const caveat='Proyeccion para adultos activos del grupo; asistencia aun no confirmada, condicionada a asistir y completar las propuestas.';
for(const extra of ['', ' El plan completo reduciria 5 repeticiones pendientes. Programa tecnico y revision especial completos previstos: Ana, Luis.']){
  const markup=render(`PROGRAMA | PREPARACION DE EXAMEN: ${benefit}${extra} ${caveat}`);
  assert.equal(markup.split(benefit).length-1,1,'benefit appears once');
  assert.equal(markup.split(caveat).length-1,1,'condition appears once');
  assert(!markup.includes('<details>'),'no redundant disclosure');
  if(extra){
    assert.equal(markup.split('El plan completo reduciria 5').length-1,1);
    assert.equal(markup.split('Ana, Luis').length-1,1,'closure names retained once');
  }
}
assert.equal(render('PROGRAMA'),'');
console.log('Exam preparation notice renders explanations once');

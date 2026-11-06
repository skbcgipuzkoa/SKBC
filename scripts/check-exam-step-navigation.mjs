import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const jsx = await import("react/jsx-runtime");
function loadComponent(file, extra = {}) {
  const compiled = ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(compiled, {
    exports: module.exports,
    requestAnimationFrame: (callback) => callback(),
    require: (name) =>
      name === "react/jsx-runtime"
        ? jsx
        : name === "react"
          ? (extra.react ?? React)
          : (extra[name] ?? {}),
  });
  return module.exports;
}
const { ExamStepNavigator, findCompletedCutoff } = loadComponent(
  "src/app/examenes/components/ExamStepNavigator.tsx",
);
const screens = [
  React.createElement(
    "section",
    { key: "first" },
    React.createElement("h2", null, "Ejercicio uno"),
  ),
  React.createElement(
    "section",
    { key: "cut" },
    React.createElement("h2", null, "Se sientan"),
  ),
  React.createElement(
    "section",
    { key: "last" },
    React.createElement("button", { type: "submit" }, "Enviar evaluacion"),
  ),
];
const html = renderToStaticMarkup(
  React.createElement(
    ExamStepNavigator,
    {
      steps: [
        { id: "first", title: "Ejercicio uno", kind: "exercise" },
        { id: "cut", title: "Se sientan", kind: "cut" },
        { id: "last", title: "Finalizar", kind: "finish" },
      ],
    },
    screens,
  ),
);
assert.equal((html.match(/class="exam-wizard-step"/g) || []).length, 3);
assert.equal(
  (html.match(/class="exam-wizard-step"[^>]*hidden/g) || []).length,
  2,
  "Only the current exercise is visible",
);
assert.match(html, /Continuar/);
assert.match(html, /Paso 1 de 3/);
assert.ok(html.includes('aria-live="polite"'));
console.log("Exam step navigation server-render checks passed.");

assert.equal(
  findCompletedCutoff(
    [
      { id: "a", kind: "exercise" },
      { id: "cut", kind: "cut" },
      { id: "b", kind: "exercise" },
    ],
    2,
    [true, true, false],
  ),
  0,
);
assert.equal(
  findCompletedCutoff(
    [
      { id: "a", kind: "exercise" },
      { id: "b", kind: "exercise" },
    ],
    1,
    [true, true],
  ),
  1,
);

// Exercise the actual component handlers and effects with retained hook state.
// Screen refs model one activity with two pupils, followed by a second activity.
let cells=[],cursor=0,effects=[];
const changed=(old,next)=>!old || !next || next.some((value,i)=>!Object.is(value,old[i]));
const hooks={...React,
  useState(initial){const i=cursor++;if(!(i in cells))cells[i]=initial;return[cells[i],value=>{cells[i]=typeof value==='function'?value(cells[i]):value}];},
  useRef(initial){const i=cursor++;return cells[i]??(cells[i]={current:initial});},
  useCallback(fn,deps){const i=cursor++;if(changed(cells[i]?.deps,deps))cells[i]={deps,fn};return cells[i].fn;},
  useEffect(fn,deps){const i=cursor++;if(changed(cells[i]?.deps,deps)){const previous=cells[i];effects.push(()=>{previous?.cleanup?.();cells[i]={deps,cleanup:fn()};});}},
};
const Interactive=loadComponent('src/app/examenes/components/ExamStepNavigator.tsx',{react:hooks}).ExamStepNavigator;
const form={noValidate:false,addEventListener(){},removeEventListener(){}};
const radio=(name,value,checked=false)=>({name,value,checked,required:true});
const ratings=[radio('score:s:a','10'),radio('score:s:a','skip'),radio('score:t:a','10'),radio('score:t:a','skip')];
const later=[radio('score:s:b','5'),radio('score:t:b','5')];
const domScreen=radios=>({querySelectorAll:selector=>selector.includes(':checked')?radios.filter(r=>r.checked):radios,focus(){}});
const screenNodes=[domScreen(ratings),domScreen(later),domScreen([])];
const interactiveSteps=[{id:'a',title:'Activity A',kind:'exercise'},{id:'b',title:'Activity B',kind:'exercise'},{id:'finish',title:'Finish',kind:'finish'}];
const walk=(node,fn)=>{if(!node || typeof node!=='object')return;if(Array.isArray(node)){node.forEach(child=>walk(child,fn));return;}fn(node);walk(node.props?.children,fn);};
const labelOf=node=>Array.isArray(node)?node.map(labelOf).join(''):typeof node==='string'?node:labelOf(node?.props?.children??[]);
let tree;
function renderInteractive(){cursor=0;effects=[];tree=Interactive({steps:interactiveSteps,children:screens});let screenIndex=0;walk(tree,node=>{if(node.props?.className==='exam-step-navigator')node.props.ref.current={closest:()=>form,scrollIntoView(){}};if(node.props?.className==='exam-wizard-step')node.props.ref(screenNodes[screenIndex++]);});effects.forEach(run=>run());return tree;}
function button(label){let found;walk(tree,node=>{if(node.type==='button' && labelOf(node)===label)found=node;});assert.ok(found,'Button '+label);return found;}
function click(label){const target=button(label);assert.ok(!target.props.disabled,label+' must be enabled');target.props.onClick();renderInteractive();}
renderInteractive();
click('Terminar examen aqui');
assert.match(labelOf(tree),/Aun no hay ninguna nota/);
assert.equal(button('Confirmar y revisar envio').props.disabled,true);
assert.equal(form.noValidate,false);
click('Seguir examinando');
ratings[0].checked=true;
click('Terminar examen aqui');
assert.match(labelOf(tree),/Activity A/);
assert.equal(button('Confirmar y revisar envio').props.disabled,false,'A single assessed pupil permits stopping');
assert.equal(form.noValidate,false,'Opening confirmation never finishes or bypasses validation');
click('Seguir examinando');
assert.equal(form.noValidate,false);
click('Terminar examen aqui');
click('Confirmar y revisar envio');
assert.equal(form.noValidate,true,'A confirmed partial stop bypasses only native full-route constraints');
let cutoffInput,reasonInput,laterDisabled=false;
walk(tree,node=>{if(node.props?.name==='stopAfterItemId')cutoffInput=node.props.value;if(node.props?.name==='stopReason')reasonInput=node.props.value;if(node.props?.['aria-label']==='Activity B')walk(node,child=>{if(child.type==='fieldset')laterDisabled=child.props.disabled;});});
assert.equal(cutoffInput,'a');
assert.equal(reasonInput,'Finalizado por el examinador');
assert.equal(laterDisabled,true);
click('Cancelar fin anticipado y continuar examen');
assert.equal(form.noValidate,false,'Resume restores native validation');
assert.equal(ratings[0].checked,true,'Cancelling retains entered scores');
cutoffInput=undefined;walk(tree,node=>{if(node.props?.name==='stopAfterItemId')cutoffInput=node.props.value;});assert.equal(cutoffInput,undefined);
console.log('Interactive stop confirmation, partial activity, empty state, future exclusion and resume checks passed.');
assert.equal(
  findCompletedCutoff([{ id: "a", kind: "exercise" }], 0, [false]),
  -1,
);
assert.match(html, /Puntos extra y penalizaciones/);
assert.match(html, /Terminar examen aqui/);
assert.doesNotMatch(html, /<button[^>]*disabled[^>]*>\s*Terminar examen aqui/,"Stop confirmation must be available even before completing all pupils");

assert.equal(
  findCompletedCutoff(
    [
      { id: "empty", kind: "exercise" },
      { id: "done", kind: "exercise" },
    ],
    1,
    [null, true],
  ),
  1,
);

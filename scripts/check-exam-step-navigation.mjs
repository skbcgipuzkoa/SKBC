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
    require: (name) =>
      name === "react/jsx-runtime"
        ? jsx
        : name === "react"
          ? React
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
assert.equal(
  findCompletedCutoff([{ id: "a", kind: "exercise" }], 0, [false]),
  -1,
);
assert.match(html, /Puntos extra y penalizaciones/);
assert.match(html, /Terminar examen aqui/);

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

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const source = fs.readFileSync("src/app/components/exam-outlook-panel.tsx", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, { module, exports: module.exports, require });
const { ExamOutlookPanel } = module.exports;
const outlook = { classification: "projected", currentReady: false, callDate: "2026-12-05", targetGrade: "4 KYU", estimatedReadyOn: "2026-11-20", marginDays: 15, deficits: ["3 asistencias", "2 repeticiones utiles"], uncertainty: ["Ritmo condicionado"], teacherReviewRequired: true, evidence: { windowStart: "2026-09-06", windowEnd: "2026-11-05", attendanceDays: 12 } };
const html = renderToStaticMarkup(React.createElement(ExamOutlookPanel, { outlook }));
for (const expected of ["Posible candidato proyectado", "2026-12-05", "2026-11-20", "15 dias", "margen corto", "3 asistencias", "2 repeticiones utiles", "Ritmo condicionado", "revision del profesor", "No concede aptitud", "2026-09-06"]) assert.ok(html.includes(expected), expected);
assert.ok(!html.includes("Tecnica especial, kata"), "Generic teacher review must not invent unmeasured requirements");
const ready = renderToStaticMarkup(React.createElement(ExamOutlookPanel, { outlook: { ...outlook, classification: "ready", currentReady: true, deficits: [], uncertainty: [] }, compact: true }));
assert.ok(ready.includes("Requisitos medidos completos"));
assert.ok(ready.includes("No concede aptitud"));
assert.ok(!ready.includes("Observacion:"));
const unknown = renderToStaticMarkup(React.createElement(ExamOutlookPanel, { outlook: { ...outlook, classification: "unknown", estimatedReadyOn: null, marginDays: null } }));
assert.ok(unknown.includes("sin estimacion fiable"));
assert.ok(unknown.includes("Sin estimacion fiable"));
for (const classification of ["notyet", "unknown"]) {
 const preparation = renderToStaticMarkup(React.createElement(ExamOutlookPanel, { outlook: { ...outlook, preparationCandidate: true, planningReasons: ["Preparar convocatoria de junio"], classification, estimatedReadyOn: null, marginDays: null } }));
 assert.ok(preparation.includes("Candidato para preparar"));
 assert.ok(preparation.includes("Preparar convocatoria de junio"));
 assert.ok(preparation.includes(classification === "notyet" ? "No se preve llegar al ritmo actual" : "Sin estimacion fiable"));
 assert.ok(!preparation.includes("Posible candidato proyectado"));
 assert.ok(!preparation.includes("2026-11-20"));
}
for (const page of ["proximos-examenes/page.tsx", "avisos/page.tsx", "page.tsx", "ficha/[token]/page.tsx", "kenshis/[legacyId]/page.tsx"]) {
 const text = fs.readFileSync(`src/app/${page}`, "utf8");
 assert.equal((text.match(/loadExamOutlooks\(/g) ?? []).length, 1, `${page}: one batched loader call`);
 assert.ok(!text.includes("evaluateExamCandidate"), `${page}: no old candidate heuristic`);
 assert.ok(!text.includes("buildAdultExamStatusPanel"), `${page}: no independent readiness gate`);
}
const avisos = fs.readFileSync("src/app/avisos/page.tsx", "utf8");
assert.ok(!avisos.includes("buildUpcomingExamNotices"));
const home = fs.readFileSync("src/app/page.tsx", "utf8");
assert.ok(home.includes("candidatos restantes"));
assert.ok(!home.includes('.in("semaphore", ["ROJO", "VERDE"])'));
const examPage = fs.readFileSync("src/app/proximos-examenes/page.tsx", "utf8");
assert.ok(examPage.includes("Semaforo guardado"));
assert.ok(examPage.includes("Asistencia guardada"));
assert.ok(examPage.includes("La prevision se calcula ahora"));
console.log("Exam outlook UI SSR and shared-consumer regressions passed");

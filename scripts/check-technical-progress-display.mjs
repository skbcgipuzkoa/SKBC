import assert from "node:assert/strict";
import { groupTechnicalProgress, examPreparationDetail, examPreparationClosure } from "../src/lib/technical-progress-display.ts";
const entries = [{id: "goho", category: "GOHO", contentType: null}, {id: "kata", category: "GOHO", contentType: "KATA_TANEN"}, {id: "other", category: "OTHER", contentType: "SPECIAL"}, {id: "juho", category: "JUHO", contentType: "JUHO"}];
const groups = groupTechnicalProgress(entries);
assert.deepEqual(groups.map(g => [g.id, g.items.map(i => i.id)]), [["techniques", ["goho", "juho"]], ["kata", ["kata"]], ["special", ["other"]]]);
assert.equal(groups.flatMap(g => g.items).length, entries.length);
assert.deepEqual(groupTechnicalProgress([]), []);
assert.equal(examPreparationDetail("PREPARACION DE EXAMEN: Ana puede completar. Programa original."), "Ana puede completar. Programa original.");
assert.equal(examPreparationDetail("Programa habitual"), null);
assert.equal(examPreparationDetail("PROGRAMA | PREPARACION DE EXAMEN: Beneficio."), "Beneficio.");
console.log("Technical progress display checks passed");

assert.equal(examPreparationClosure("Beneficio. Programa tecnico y revision especial completos previstos: Ana, Luis. Proyeccion para asistentes registrados."), "Programa tecnico y revision especial completos previstos: Ana, Luis.");
assert.equal(examPreparationClosure("Beneficio. Ningun programa completo previsto con este plan. Proyeccion para asistentes registrados."), "Ningun programa completo previsto con este plan.");
assert.equal(examPreparationClosure("Texto antiguo."), null);

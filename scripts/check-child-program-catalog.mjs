import assert from "node:assert/strict";
import {
  defaultChildExamItemIds,
  normalizeChildGrade,
  normalizeSelectedGrades,
  orderChildExamAssignments,
  resolveChildExamGrades
} from "../src/lib/child-program.ts";

assert.equal(normalizeChildGrade("  azul y marrón  "), "AZUL-MARRON");
assert.equal(normalizeChildGrade("amarillo   naranja"), "AMARILLO-NARANJA");
assert.equal(normalizeChildGrade("1º dan"), "1 DAN");

assert.deepEqual(
  normalizeSelectedGrades([" BLANCO ", "blanco", "azul y marrón", "AZUL-MARRON"]),
  ["BLANCO", "AZUL-MARRON"]
);

assert.deepEqual(
  resolveChildExamGrades([" blanco y amarillo ", "NARANJA"]),
  ["BLANCO", "BLANCO-AMARILLO", "AMARILLO", "AMARILLO-NARANJA", "NARANJA"]
);

const assignments = [
  { id: "yellow-inactive", contentId: "c5", grade: "AMARILLO", title: "Ignored inactive", category: "otro", description: null, active: false, examRelevant: true, sortOrder: 0 },
  { id: "yellow-1", contentId: "c4", grade: " amarillo ", title: "Zeta", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 1 },
  { id: "white-2", contentId: "c2", grade: "BLANCO", title: "Beta", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 2 },
  { id: "white-1", contentId: "c1", grade: " blanco ", title: "Álgebra", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 1 },
  { id: "yellow-practice", contentId: "c6", grade: "AMARILLO", title: "Ignored practice", category: "otro", description: null, active: true, examRelevant: false, sortOrder: 0 },
  { id: "white-title", contentId: "c3", grade: "BLANCO", title: "Abaco", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 1 }
];

assert.deepEqual(
  orderChildExamAssignments(assignments).map((item) => item.id),
  ["white-title", "white-1", "white-2", "yellow-inactive", "yellow-practice", "yellow-1"]
);
assert.deepEqual(
  defaultChildExamItemIds(assignments, [" amarillo "]),
  ["white-title", "white-1", "white-2", "yellow-1"]
);

console.log("Child program catalog checks passed.");

import assert from "node:assert/strict";
import {
  getAdultGakkaPlan,
  isAdultGakkaItem,
  normalizeAdultGakkaItems,
  gakkaIdentity,
} from "../src/lib/adult-exam-gakka.ts";
const expected = {
  "5 KYU": [4, 0, 0, 0],
  "4 KYU": [4, 0, 0, 0],
  "3 KYU": [0, 6, 0, 0],
  "2 KYU": [0, 6, 0, 0],
  "1 KYU": [0, 7, 0, 0],
  "1 DAN": [0, 2, 8, 3],
  "2 DAN": [0, 2, 7, 3],
  "3 DAN": [0, 2, 7, 3],
  "4 DAN": [0, 6, 0, 0],
  "5 DAN": [0, 0, 0, 0],
};
for (const [grade, counts] of Object.entries(expected)) {
  const plan = getAdultGakkaPlan(grade);
  assert.equal(plan.grade, grade);
  assert.deepEqual(
    [
      plan.oral.length,
      plan.requiredWritten.length,
      plan.choiceWritten.length,
      plan.choiceCount,
    ],
    counts,
    grade,
  );
  for (const row of [
    ...plan.oral,
    ...plan.requiredWritten,
    ...plan.choiceWritten,
    ...plan.externalNotes,
  ]) {
    assert.ok(row.key && row.name && row.sourceName && row.summary);
    assert.doesNotMatch(row.name, /^(Entrega previa|En el examen):/i);
  }
}
assert.deepEqual(
  getAdultGakkaPlan("2 KYU").requiredWritten.map((x) => x.name),
  [
    "Establécete a ti mismo y vive en armonía con los demás",
    "Ken Zen Ichi Nyo",
    "Riki Ai Funi",
    "Pautas para un entrenamiento eficaz",
    "La mentalidad de crecimiento",
    "Ars Longa, Vita Brevis",
  ],
);
assert.ok(
  getAdultGakkaPlan("2 KYU").requiredWritten.every(
    (x) => x.timing === "exam-day" && x.mode === "written-required",
  ),
);
assert.ok(
  getAdultGakkaPlan("1 DAN").requiredWritten.every(
    (x) => x.timing === "advance",
  ),
);
assert.ok(
  getAdultGakkaPlan("4 DAN").externalNotes.some((x) =>
    /no se requiere/i.test(x.name),
  ),
);
assert.equal(getAdultGakkaPlan("5 DAN").externalNotes.length, 1);
assert.match(
  getAdultGakkaPlan("5 DAN").externalNotes[0].summary,
  /por separado/,
);
assert.equal(getAdultGakkaPlan("5 DAN").requiredWritten.length, 0);
assert.equal(getAdultGakkaPlan("MINARAI").requiredWritten.length, 0);
assert.equal(
  gakkaIdentity("Entrega previa: ¿Qué es la verdadera fuerza?"),
  gakkaIdentity("¿Qué es la verdadera fuerza?"),
);
assert.equal(
  gakkaIdentity("En el examen: el poder del Ki"),
  gakkaIdentity("El poder del Ki"),
);
const written = {
  id: "w",
  grade: "2 KYU",
  section: "GAKKA",
  name: "Ken Zen Ichi Nyo",
  weight: 1,
  active: true,
  summary: "Keep teacher text",
  notes: "Keep annotation",
};
const wrong = {
  id: "wrong",
  grade: "2 KYU",
  section: "PROGRAMA",
  category: "goho",
  name: "Buddhism and Science",
  weight: 1,
  active: true,
};
const knownWrong = { ...wrong, name: "Budismo y ciencia" };
const ordinary = {
  id: "ordinary",
  grade: "2 KYU",
  section: "Goho",
  name: "Uchi age zuki",
  weight: 1,
  active: true,
};
const embu = {
  id: "embu",
  grade: "2 KYU",
  section: "Embu",
  name: "Kumi embu",
  weight: 3,
  active: true,
};
const disabled = { ...written, id: "disabled", active: false };
const oral = {
  id: "o",
  grade: "5 KYU",
  section: "GAKKA",
  name: "Lista de vocabulario 1",
  weight: 5,
  active: true,
};
const bank = {
  id: "bank",
  grade: "2 DAN",
  section: "GAKKA",
  name: "En el examen: el poder del Ki",
  weight: 1,
  active: true,
};
const selected = {
  ...bank,
  id: "selected",
  section: "GAKKA_SELECCION",
  weight: 0,
  active: true,
};
const unknown = {
  id: "unknown",
  grade: "2 KYU",
  section: "GAKKA",
  name: "Unapproved topic",
  weight: 1,
  active: false,
};
const rows = [
  written,
  knownWrong,
  ordinary,
  embu,
  disabled,
  oral,
  bank,
  selected,
  unknown,
];
const result = normalizeAdultGakkaItems(rows, "adults", "active");
assert.equal(result[0].section, "GAKKA_ENTREGA");
assert.equal(result[0].weight, 0);
assert.equal(result[0].summary, "Keep teacher text");
assert.equal(result[0].notes, "Keep annotation");
assert.equal(result[1].section, "GAKKA_FUERA_DE_GRADO");
assert.equal(result[1].weight, 0);
assert.equal(isAdultGakkaItem(knownWrong), true);
assert.equal(result[2], ordinary);
assert.equal(result[3], embu);
assert.equal(result[3].weight, 3);
assert.equal(result[4].active, false);
assert.equal(result[5].section, "GAKKA_ORAL");
assert.equal(result[5].weight, 1);
assert.equal(result[6].section, "GAKKA_SELECCION");
assert.equal(result[6].active, false);
assert.equal(result[6].weight, 0);
assert.equal(result[6].name, "el poder del Ki");
assert.equal(result[7].active, true);
assert.equal(result[7].weight, 0);
assert.equal(result[8].active, false);
assert.equal(result[8].section, "GAKKA_FUERA_DE_GRADO");
assert.equal(normalizeAdultGakkaItems(rows, "kids", "active"), rows);
assert.equal(
  normalizeAdultGakkaItems(rows, "kids_progressive", "active"),
  rows,
);
assert.equal(normalizeAdultGakkaItems(rows, "adults", "completed"), rows);
assert.equal(normalizeAdultGakkaItems(rows, "dan_tribunal", "archived"), rows);
assert.deepEqual(
  normalizeAdultGakkaItems(result, "adults", "active"),
  result,
  "Normalization is idempotent",
);
assert.equal(written.weight, 1);
assert.equal(bank.active, true, "Input data is never mutated");
console.log(
  "Adult Gakka source plans, target-grade scope, written bank normalization, oral/Embu weights and child/history isolation passed.",
);

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  classifyExamCurriculumItem,
  evaluateExamTechnicalReadiness
} from "../src/lib/exam-technical-readiness.ts";
import { parseExamNotice } from "../src/lib/exam-notice.ts";
import { copyExamSnapshotItems } from "../src/lib/integrated-exam-snapshot.ts";
import { progressiveTargetGradesWithoutScorableItems } from "../src/lib/child-program.ts";

const technique = (id, name, category, contentType = null) => ({
  id,
  name,
  category,
  content_type: contentType
});

assert.equal(classifyExamCurriculumItem(technique("g", "Uchi age zuki", "goho")), "fundamental");
assert.equal(classifyExamCurriculumItem(technique("j", "Gyaku gote", "juho")), "fundamental");
assert.equal(classifyExamCurriculumItem(technique("u", "Mae ukemi", "ukemi", "UKEMI")), "special-review");
assert.equal(classifyExamCurriculumItem(technique("k", "Tenchi ken dai ni", "hokei", "KATA_TANEN")), "special-review");
assert.equal(classifyExamCurriculumItem(technique("m", "Chidori ashi", "kihon", "UMPO_HO")), "special-review");

const curriculum = [
  technique("g", "Uchi age zuki", "goho"),
  technique("j", "Gyaku gote", "juho"),
  technique("u", "Mae ukemi", "ukemi", "UKEMI"),
  technique("k", "Tenchi ken dai ni", "hokei", "KATA_TANEN"),
  technique("m", "Chidori ashi", "kihon", "UMPO_HO")
];

const pending = evaluateExamTechnicalReadiness(curriculum, new Map([["g", 2], ["j", 1]]), 2);
assert.equal(pending.fundamentalMissingRequired, 1);
assert.equal(pending.fundamentalMissingFirst, 0);
assert.deepEqual(pending.specialReviewPending, ["Mae ukemi", "Tenchi ken dai ni", "Chidori ashi"]);

const reviewed = evaluateExamTechnicalReadiness(
  curriculum,
  new Map([["g", 2], ["j", 2], ["u", 1], ["k", 1], ["m", 1]]),
  2
);
assert.equal(reviewed.fundamentalReady, true);
assert.deepEqual(reviewed.specialReviewPending, []);

const notice = parseExamNotice(
  "ROJO: no convocar por progreso tecnico. | BLOQUEO Tecnico fundamental: no convocar todavia, 2 tecnicas Goho/Juho sin registrar y 7 por debajo de 2 reps. | Revision del profesor pendiente: Tenchi ken dai san, Mae ukemi. Programar una o varias clases de repaso."
);
assert.equal(notice.fundamentalMissingFirst, 2);
assert.equal(notice.fundamentalMissingRequired, 7);
assert.deepEqual(notice.specialReviewPending, ["Tenchi ken dai san", "Mae ukemi"]);
assert.equal(notice.segments.length, 3);

const reinforcement = parseExamNotice(
  "Tecnico fundamental: no convocar todavia, 4 tecnicas Goho/Juho pendientes de 2 repeticiones. | Revision especial: Umpo Ho, katas, ukemis y otros bloques revisados."
);
assert.equal(reinforcement.fundamentalMissingFirst, 0);
assert.equal(reinforcement.fundamentalMissingRequired, 4);

const complete = parseExamNotice(
  "Tecnico fundamental: Goho/Juho completos con 2+ reps. | Revision especial: Umpo Ho, katas, ukemis y otros bloques revisados."
);
assert.equal(complete.fundamentalComplete, true);

const storedSnapshot = [{
  source: "child_syllabus",
  child_syllabus_item_id: "assignment-old",
  name: "Stored title",
  grade: "BLANCO",
  order_index: 4
}];
const copiedSnapshot = copyExamSnapshotItems(storedSnapshot, "new-event");
assert.deepEqual(copiedSnapshot, [{ ...storedSnapshot[0], exam_event_id: "new-event" }]);
assert.notEqual(copiedSnapshot[0], storedSnapshot[0]);
storedSnapshot[0].name = "Catalog title changed later";
assert.equal(copiedSnapshot[0].name, "Stored title");
assert.deepEqual(
  progressiveTargetGradesWithoutScorableItems(
    [{ grade: "AMARILLO", scorable: true }],
    ["BLANCO-AMARILLO", "AMARILLO-NARANJA"]
  ),
  ["BLANCO-AMARILLO"]
);

const examPageSource = readFileSync(new URL("../src/app/examenes/page.tsx", import.meta.url), "utf8");
const examFormUrl = new URL("../src/app/examenes/IntegratedExamCreateForm.tsx", import.meta.url);
const integratedExamsSource = readFileSync(new URL("../src/lib/integrated-exams.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");

assert.equal(existsSync(examFormUrl), true, "integrated exam creation form must be extracted");
const examFormSource = readFileSync(examFormUrl, "utf8");
assert.match(examFormSource, /^"use client";/);
assert.match(examFormSource, /defaultChildExamItemIds/);
assert.match(examFormSource, /name="childSyllabusItemIds"/);
assert.match(examFormSource, /moveSelectedItem/);
assert.match(examFormSource, /kids_progressive/);
assert.match(examPageSource, /getChildProgramCatalog/);
assert.match(examPageSource, /<IntegratedExamCreateForm/);
assert.doesNotMatch(examPageSource, /<form action=\{createIntegratedExamEventAction\} className="edit-form">/);
assert.match(actionsSource, /formData\.getAll\("childSyllabusItemIds"\)/);
assert.match(actionsSource, /childSyllabusItemIds\s*\n/);
assert.match(integratedExamsSource, /childSyllabusItemIds\?: string\[\]/);
assert.match(integratedExamsSource, /loadApprovedChildExamAssignments/);
assert.match(integratedExamsSource, /loadApprovedChildExamAssignments\(childSyllabusItemIds \?\? \[\], targetGrades\)/);
assert.match(integratedExamsSource, /buildChildExamSnapshot/);
assert.match(integratedExamsSource, /no tienen contenido evaluable seleccionado/);
assert.match(integratedExamsSource, /input\.templateEventId[\s\S]*copyExamItems/);

console.log("Exam technical readiness checks passed.");

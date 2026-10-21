import assert from "node:assert/strict";
import {
  classifyExamCurriculumItem,
  evaluateExamTechnicalReadiness
} from "../src/lib/exam-technical-readiness.ts";
import { parseExamNotice } from "../src/lib/exam-notice.ts";

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

console.log("Exam technical readiness checks passed.");

import assert from "node:assert/strict";
import * as review from "../src/lib/integrated-exam-review.ts";

const items = [
  {
    id: "goho",
    name: "Goho",
    source: "child_syllabus",
    grade: "VERDE",
    weight: 2,
    active: true,
  },
  {
    id: "juho",
    name: "Juho",
    source: "child_syllabus",
    grade: "VERDE",
    weight: 1,
    active: true,
  },
];
const scores = [
  {
    event_student_id: "a",
    event_item_id: "goho",
    examiner_id: "one",
    score: 4,
    skipped: false,
    notes: "Revisar guardia",
  },
  {
    event_student_id: "a",
    event_item_id: "goho",
    examiner_id: "two",
    score: 6,
    skipped: false,
  },
  {
    event_student_id: "a",
    event_item_id: "juho",
    examiner_id: "one",
    score: 8,
    skipped: false,
  },
];
const input = { studentId: "a", items, scores, passPercentage: 70 };
const base = review.buildStudentReview(input);
assert.equal(base.percentage, 60);
assert.equal(base.basePercentage, 60);
assert.equal(base.complete, true);
assert.equal(base.automaticPassed, false);
assert.deepEqual(base.items[0].notes, ["Revisar guardia"]);
const raised = review.buildStudentReview({
  ...input,
  adjustments: { goho: { score: 9, notes: "Control comprobado" } },
});
assert.equal(raised.percentage, 86.7);
assert.equal(raised.basePercentage, 60);
assert.equal(raised.items[0].originalScore, 5);
assert.equal(raised.items[0].score, 9);
assert.equal(raised.sourceSignature, base.sourceSignature);
const changedSyllabus = review.buildStudentReview({
  ...input,
  items: items.filter((item) => item.id !== "goho"),
  adjustments: { goho: { score: 9, notes: "Conservar ajuste anterior" } },
});
assert.equal(
  changedSyllabus.items.length,
  1,
  "Stale adjustments do not prevent opening a changed exam",
);
const saved = {
  ...review.parseReviewEnvelope(null),
  decision: "fail",
  conclusion: "Necesita consolidar el control",
  sourceSignature: raised.sourceSignature,
  adjustments: { goho: { score: 9, notes: "Control comprobado" } },
};
assert.deepEqual(review.validateStudentDecision(saved, raised), []);
assert.equal(review.isReviewCurrent(saved, raised), true);
assert.ok(
  review.validateStudentDecision({ ...saved, conclusion: "" }, raised).length,
);
assert.equal(
  review.isReviewCurrent(
    saved,
    review.buildStudentReview({
      ...input,
      scores: [
        ...scores,
        {
          event_student_id: "a",
          event_item_id: "juho",
          examiner_id: "two",
          score: 4,
          skipped: false,
        },
      ],
    }),
  ),
  false,
);
assert.equal(
  review.parseReviewEnvelope(JSON.stringify(saved)).decision,
  "fail",
);
assert.equal(
  review.parseReviewEnvelope("Observacion antigua").conclusion,
  "Observacion antigua",
);
assert.throws(
  () =>
    review.parseReviewEnvelope(
      '{"version":1,"adjustments":{"goho":{"score":99}}}',
    ),
  /revision|puntuacion/i,
);
assert.throws(
  () =>
    review.buildStudentReview({
      ...input,
      adjustments: { goho: { score: NaN, notes: "" } },
    }),
  /puntuacion/i,
);
const missing = review.buildStudentReview({
  ...input,
  scores: scores.filter((score) => score.event_item_id === "goho"),
});
assert.equal(missing.complete, false);
assert.equal(
  review.buildStudentReview({
    ...input,
    scores: scores.filter((score) => score.event_item_id === "goho"),
    adjustments: { juho: { score: 7, notes: "Valorado durante la revision" } },
  }).complete,
  true,
);
assert.equal(
  review.isReviewCurrent(
    { ...saved, sourceSignature: missing.sourceSignature },
    missing,
  ),
  false,
);
const skip = review.buildStudentReview({
  ...input,
  scores: [
    ...scores.filter((score) => score.event_item_id === "goho"),
    {
      event_student_id: "a",
      event_item_id: "juho",
      examiner_id: "one",
      score: null,
      skipped: true,
    },
  ],
});
assert.equal(skip.percentage, 50);
assert.equal(skip.complete, true);
assert.equal(skip.items[1].skipped, true);
const empty = review.buildStudentReview({
  ...input,
  scores: [],
  items: [],
  passPercentage: 0,
});
assert.equal(empty.automaticPassed, false);
assert.equal(empty.complete, false);
assert.equal(
  review.isReviewItemRelevantForStudent(
    "kids_progressive",
    { target_grade: "VERDE-AZUL" },
    { grade: "3 KYU" },
  ),
  true,
);
assert.equal(
  review.isReviewItemRelevantForStudent(
    "kids_progressive",
    { target_grade: "VERDE-AZUL" },
    { grade: "MARRON" },
  ),
  false,
);
assert.equal(
  review.isReviewItemRelevantForStudent(
    "kids_progressive",
    { target_grade: "VERDE-AZUL" },
    { grade: "invalid" },
  ),
  false,
);
assert.equal(
  review.isReviewItemRelevantForStudent(
    "kids_progressive",
    { target_grade: "VERDE-AZUL" },
    { grade: null },
  ),
  true,
);
assert.equal(
  review.isReviewItemRelevantForStudent(
    "adults",
    { target_grade: "3 KYU" },
    { grade: "4 KYU" },
  ),
  false,
);
console.log("Integrated exam review checks passed.");

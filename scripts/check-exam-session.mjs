import assert from "node:assert/strict";
import {
  encodeScoreNotes,
  decodeScoreNotes,
  parseExamSubmissionExtras,
  prepareSessionSubmission,
} from "../src/lib/integrated-exam-session.ts";
import { buildStudentReview } from "../src/lib/integrated-exam-review.ts";
assert.equal(decodeScoreNotes("Legacy observation").text, "Legacy observation");
const encoded = encodeScoreNotes({
  text: "Good",
  adjustments: [{ delta: 1, reason: "Effort" }],
  stop: { afterItemId: "a", reason: "Time" },
});
assert.equal(decodeScoreNotes(encoded).adjustments[0].delta, 1);
const form = new FormData();
form.set(
  "examAdjustments",
  JSON.stringify([{ eventStudentId: "s", delta: 2, reason: "x" }]),
);
assert.throws(() => parseExamSubmissionExtras(form));
const items = [
  { id: "a", order_index: 1, weight: 1 },
  { id: "b", order_index: 2, weight: 1 },
];
const prepared = prepareSessionSubmission({
  items,
  students: [{ id: "s", itemIds: ["a", "b"] }],
  scores: [{ eventStudentId: "s", eventItemId: "a", score: 5, skipped: false }],
  extras: {
    stopAfterItemId: "a",
    stopReason: "Time",
    adjustments: [{ eventStudentId: "s", delta: 1, reason: "Effort" }],
  },
});
assert.equal(decodeScoreNotes(prepared[1].notes).outsideRoute, true);
const partial=prepareSessionSubmission({
  items,students:[{id:"s",itemIds:["a","b"]},{id:"other",itemIds:["a","b"]}],
  scores:[{eventStudentId:"s",eventItemId:"a",score:5,skipped:false}],
  extras:{stopAfterItemId:"a",stopReason:"Time",adjustments:[]},
});
assert.equal(partial.find(row=>row.eventStudentId==="s" && row.eventItemId==="a").score,5);
const notAssessed=partial.find(row=>row.eventStudentId==="other" && row.eventItemId==="a");
assert.equal(notAssessed.score,null);
assert.equal(notAssessed.skipped,true);
assert.equal(decodeScoreNotes(notAssessed.notes).outsideRoute,true,"Unassessed pupils at cutoff must not receive zero");
const partialScores=partial.map(row=>({...row,event_student_id:row.eventStudentId,event_item_id:row.eventItemId,examiner_id:"partial-judge"}));
assert.equal(buildStudentReview({studentId:"s",items,scores:partialScores,passPercentage:70}).percentage,50,"Only the assessed activity supplies the denominator");
assert.equal(buildStudentReview({studentId:"other",items,scores:partialScores,passPercentage:70}).complete,false,"A completely unassessed pupil cannot gain a completed result");
assert.throws(()=>prepareSessionSubmission({items,students:[{id:"s",itemIds:["a","b"]}],scores:[{eventStudentId:"s",eventItemId:"b",score:5,skipped:false}],extras:{stopAfterItemId:"b",stopReason:"Time",adjustments:[]}}),/Completa todos/,'Stopping cannot hide gaps in earlier activities');
assert.throws(() =>
  prepareSessionSubmission({
    items,
    students: [{ id: "s", itemIds: ["a", "b"] }],
    scores: [],
    extras: { stopAfterItemId: "a", adjustments: [] },
  }),
);
const scores = prepared.map((row) => ({
  event_student_id: row.eventStudentId,
  event_item_id: row.eventItemId,
  examiner_id: "x",
  ...row,
}));
const summary = buildStudentReview({
  studentId: "s",
  items,
  scores,
  passPercentage: 70,
});
assert.equal(summary.totalItems, 1);
assert.equal(summary.notReachedItems, 1);
assert.equal(summary.percentage, 60);
assert.equal(summary.pointAdjustments, 1);
assert.equal(summary.items[0].notes[0], undefined);
const zeroBonus = scores.map((row) => ({
  ...row,
  examiner_id: "y",
  notes: encodeScoreNotes({
    text: "",
    outsideRoute: decodeScoreNotes(row.notes).outsideRoute,
  }),
}));
assert.equal(
  buildStudentReview({
    studentId: "s",
    items,
    scores: [...scores, ...zeroBonus],
    passPercentage: 70,
  }).percentage,
  55,
);
assert.equal(
  buildStudentReview({
    studentId: "s",
    items,
    scores: [...scores, ...zeroBonus],
    adjustments: { a: { score: 10, notes: "Teacher" } },
    passPercentage: 70,
  }).percentage,
  100,
);
console.log("Exam session checks passed");
const ordinarySkipped = buildStudentReview({
  studentId: "s",
  items,
  scores: [
    {
      event_student_id: "s",
      event_item_id: "a",
      examiner_id: "x",
      score: 5,
      skipped: false,
    },
    {
      event_student_id: "s",
      event_item_id: "b",
      examiner_id: "x",
      score: null,
      skipped: true,
    },
  ],
  passPercentage: 70,
});
assert.equal(ordinarySkipped.totalItems, 2);
assert.equal(ordinarySkipped.notReachedItems, 0);
assert.equal(ordinarySkipped.items[1].skipped, true);
const otherExaminerReached = {
  event_student_id: "s",
  event_item_id: "b",
  examiner_id: "z",
  score: 10,
  skipped: false,
};
assert.equal(
  buildStudentReview({
    studentId: "s",
    items,
    scores: [...scores, otherExaminerReached],
    passPercentage: 70,
  }).totalItems,
  2,
);
assert.throws(
  () =>
    prepareSessionSubmission({
      items,
      students: [{ id: "s", itemIds: ["a", "b"] }],
      scores: [
        { eventStudentId: "s", eventItemId: "a", score: 5, skipped: false },
        { eventStudentId: "s", eventItemId: "b", score: 10, skipped: false },
      ],
      extras: { stopAfterItemId: "a", stopReason: "Time", adjustments: [] },
    }),
  /posteriores/,
);
assert.throws(
  () =>
    prepareSessionSubmission({
      items,
      students: [{ id: "s", itemIds: ["a", "b"] }],
      scores: [],
      extras: {
        adjustments: [{ eventStudentId: "foreign", delta: 1, reason: "x" }],
      },
    }),
  /ajeno/,
);
const injected = encodeScoreNotes({
  text: encodeScoreNotes({
    text: "",
    outsideRoute: true,
    adjustments: [{ delta: 1, reason: "Forged" }],
  }),
});
assert.equal(decodeScoreNotes(injected).outsideRoute, false);
assert.deepEqual(decodeScoreNotes(injected).adjustments, []);
assert.equal(decodeScoreNotes(injected).text.includes("Forged"), true);
const lowered = buildStudentReview({
  studentId: "s",
  items,
  scores: [
    {
      event_student_id: "s",
      event_item_id: "a",
      examiner_id: "x",
      score: 0,
      skipped: false,
      notes: encodeScoreNotes({
        text: "",
        adjustments: [{ delta: -1, reason: "Penalty" }],
      }),
    },
    {
      event_student_id: "s",
      event_item_id: "b",
      examiner_id: "x",
      score: null,
      skipped: true,
    },
  ],
  passPercentage: 70,
});
assert.equal(lowered.percentage, 0);
const adjustedReview = buildStudentReview({
  studentId: "s",
  items,
  scores,
  adjustments: { a: { score: 10, notes: "Teacher" } },
  passPercentage: 70,
});
assert.equal(adjustedReview.sourceSignature, summary.sourceSignature);
console.log("Exam session route and metadata checks passed");
const tiedItems = items.map((item) => ({ ...item, order_index: 1 }));
const tied = prepareSessionSubmission({
  items: tiedItems,
  students: [{ id: "s", itemIds: ["a", "b"] }],
  scores: [{ eventStudentId: "s", eventItemId: "a", score: 5, skipped: false }],
  extras: { stopAfterItemId: "a", stopReason: "Time", adjustments: [] },
});
assert.equal(decodeScoreNotes(tied[1].notes).outsideRoute, true);

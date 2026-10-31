import assert from "node:assert/strict";
import {
  encodeExamAssignments,
  decodeExamAssignments,
  resolveExamAssignments,
  validateExamAssignments,
} from "../src/lib/integrated-exam-assignments.ts";
assert.equal(decodeExamAssignments("legacy notes").text, "legacy notes");
assert.equal(decodeExamAssignments("legacy notes").scopes, null);
const examiners = [
  { id: "x", revoked_at: null },
  { id: "y", revoked_at: null },
];
const students = [{ target_grade: "1 KYU" }, { target_grade: "2 KYU" }];
const defaults = resolveExamAssignments({
  programType: "adults",
  notes: "legacy",
  examiners,
  students,
});
assert.equal(defaults.examinerGradeScopes.x.length, 2);
const scopes = { x: ["1 KYU"], y: ["2 KYU"] };
assert.deepEqual(
  decodeExamAssignments(encodeExamAssignments("Teacher notes", scopes)),
  { text: "Teacher notes", scopes },
);
assert.throws(() =>
  validateExamAssignments({ x: ["1 KYU"], y: [] }, examiners, [
    "1 KYU",
    "2 KYU",
  ]),
);
assert.throws(() =>
  validateExamAssignments({ x: ["1 KYU"], y: ["3 KYU"] }, examiners, [
    "1 KYU",
    "2 KYU",
  ]),
);
assert.throws(() =>
  validateExamAssignments({ x: ["1 KYU"], y: ["1 KYU"] }, examiners, [
    "1 KYU",
    "2 KYU",
  ]),
);
assert.throws(() =>
  validateExamAssignments({ ...scopes, z: ["1 KYU"] }, examiners, [
    "1 KYU",
    "2 KYU",
  ]),
);
console.log("Exam assignment checks passed");
const closed = resolveExamAssignments({
  programType: "adults",
  notes: encodeExamAssignments("", { x: ["1 KYU"] }),
  examiners,
  students,
});
assert.deepEqual(
  closed.examinerGradeScopes.y,
  [],
  "missing examiner in configured event fails closed",
);

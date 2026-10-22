import assert from "node:assert/strict";
import { evaluateExamCandidate } from "../src/lib/exam-candidate.ts";

const base = {
  status: "active",
  semaphore: "ROJO",
  memberClass: "kids",
  nextExamOn: "2026-12-21",
  today: "2026-10-22",
  attendanceCount: 24,
  minimumAttendance: 32,
  recentAttendance60: 6,
  recentAttendance21: 1,
  technicalWorked: null,
  technicalTotal: null,
  repetitionCount: null,
  repetitionGoal: null
};

const boundary = evaluateExamCandidate(base);
assert.equal(boundary.isCandidate, true);
assert.match(boundary.reasons.join(" "), /60 dias/);
assert.match(boundary.details.join(" "), /75%/);

assert.equal(evaluateExamCandidate({ ...base, nextExamOn: "2026-12-22" }).isCandidate, false);
assert.equal(evaluateExamCandidate({ ...base, attendanceCount: 23 }).isCandidate, false);
assert.equal(evaluateExamCandidate({ ...base, recentAttendance60: 5 }).isCandidate, false);
assert.equal(evaluateExamCandidate({ ...base, recentAttendance21: 0 }).isCandidate, false);
assert.equal(evaluateExamCandidate({ ...base, status: "inactive" }).isCandidate, false);

const adult = evaluateExamCandidate({
  ...base,
  memberClass: "adults",
  technicalWorked: 12,
  technicalTotal: 16,
  repetitionCount: 19,
  repetitionGoal: 48
});
assert.equal(adult.isCandidate, true);
assert.match(adult.details.join(" "), /12 de 16/);
assert.match(adult.details.join(" "), /19 de 48/);

assert.equal(evaluateExamCandidate({
  ...base,
  memberClass: "adults",
  technicalWorked: 11,
  technicalTotal: 16,
  repetitionCount: 30,
  repetitionGoal: 48
}).isCandidate, false);

for (const semaphore of ["VERDE", "AMARILLO"]) {
  const automatic = evaluateExamCandidate({
    ...base,
    semaphore,
    nextExamOn: null,
    attendanceCount: 0,
    recentAttendance60: 0,
    recentAttendance21: 0
  });
  assert.equal(automatic.isCandidate, true);
  assert.match(automatic.reasons.join(" "), /valoracion del profesor/i);
}

assert.equal(evaluateExamCandidate({ ...base, semaphore: "INACTIVO" }).isCandidate, false);
assert.equal(evaluateExamCandidate({ ...base, nextExamOn: null }).isCandidate, false);
assert.equal(evaluateExamCandidate({ ...base, minimumAttendance: null }).isCandidate, false);

console.log("Exam candidate checks passed.");

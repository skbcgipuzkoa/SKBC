import assert from "node:assert/strict";
import {
  evaluateExamOutlook,
  outlookTrainingDates,
  formatExamOutlookSummary,
} from "../src/lib/exam-outlook.ts";
const today = "2026-11-05";
const member = {
  id: "f",
  display_name: "Feasibility",
  legacy_id: null,
  class: "adults",
  status: "active",
  grade: "5 KYU",
  joined_on: "2025-01-01",
  last_exam_on: "2025-01-01",
};
const curriculum = Array.from({ length: 4 }, (_, i) => ({
  id: "t" + i,
  name: "Technique " + i,
  grade: "4 KYU",
  category: "goho",
  content_type: null,
}));
const requirement = {
  member_class: "adults",
  grade_pattern: "*",
  min_months: 12,
  attendance_ratio: 0.1,
  adult_required_repetitions: 2,
  technical_blocks_exam: true,
};
const attendance = outlookTrainingDates("2025-01-01", today, "adults", []);
const history = curriculum.map((t) => ({
  member_id: "f",
  class_date: "2026-10-01",
  class_id: "class1",
  technique_id: t.id,
  technique_name: t.name,
  technique_grade: "4 KYU",
  completed: true,
  counts_as_progression: true,
}));
const base = {
  member,
  today,
  todayClassClosed: true,
  attendance,
  history,
  curriculum,
  requirements: [requirement],
  calls: ["2026-11-10"],
  closures: [],
};
const boundary = evaluateExamOutlook(base);
assert.equal(boundary.evidence.remainingSessions, 1);
assert.equal(boundary.feasibility, "possible");
assert.equal(boundary.preparationCandidate, true);
// Four aggregate remaining repetitions can fit together in one class.
assert.equal(boundary.candidate, true);
assert.deepEqual(boundary.impossibilityReasons, []);
const overItem = evaluateExamOutlook({
  ...base,
  requirements: [{ ...requirement, adult_required_repetitions: 3 }],
});
assert.equal(overItem.feasibility, "impossible");
assert.equal(overItem.candidate, false);
assert.equal(overItem.preparationCandidate, false);
assert.equal(overItem.currentReady, false);
assert.equal(overItem.classification, "notyet");
assert.equal(overItem.estimatedReadyOn, null);
assert.ok(
  overItem.impossibilityReasons.some(
    (r) => r.includes("Technique 0") && r.includes("2") && r.includes("1"),
  ),
);
assert.ok(
  formatExamOutlookSummary(overItem).startsWith(
    "No llega con las clases previstas",
  ),
);
const minimum = Math.ceil(
  outlookTrainingDates("2025-01-01", "2026-01-01", "adults", []).length * 0.1,
);
const completeHistory = [
  ...history,
  ...history.map((h) => ({
    ...h,
    class_id: "class2",
    class_date: "2026-10-08",
  })),
];
const attendanceBoundary = evaluateExamOutlook({
  ...base,
  history: completeHistory,
  attendance: attendance.slice(-minimum + 1),
});
assert.equal(attendanceBoundary.evidence.missingAttendance, 1);
assert.equal(attendanceBoundary.feasibility, "possible");
const attendanceOver = evaluateExamOutlook({
  ...base,
  history: completeHistory,
  attendance: attendance.slice(-minimum + 2),
});
assert.equal(attendanceOver.feasibility, "impossible");
assert.ok(
  attendanceOver.impossibilityReasons.some(
    (r) => r.includes("2 asistencias") && r.includes("1 clase"),
  ),
);
const closed = evaluateExamOutlook({
  ...base,
  closures: [
    { starts_on: "2026-11-10", ends_on: "2026-11-10", applies_to: "all" },
  ],
});
assert.equal(closed.feasibility, "impossible");
assert.equal(closed.evidence.remainingSessions, 0);
const child = evaluateExamOutlook({
  ...base,
  member: { ...member, class: "kids", grade: "BLANCO" },
  requirements: [
    { ...requirement, member_class: "kids", technical_blocks_exam: false },
  ],
  attendance: attendance.slice(-minimum + 2),
});
assert.equal(child.feasibility, "impossible");
const unknown = evaluateExamOutlook({ ...base, calls: [] });
assert.equal(unknown.feasibility, "unknown");
assert.deepEqual(unknown.impossibilityReasons, []);
assert.equal(
  evaluateExamOutlook({ ...base, curriculum: [] }).feasibility,
  "unknown",
);
const special = evaluateExamOutlook({
  ...base,
  history: completeHistory,
  curriculum: [
    ...curriculum,
    { ...curriculum[0], id: "special", name: "Kata", category: "hokei" },
  ],
});
assert.equal(special.feasibility, "possible");
console.log(
  "Exam feasibility: boundaries, individual items, parallel training, closures, children, unknown inputs and preparation guards passed",
);

const invalidConfig = evaluateExamOutlook({
  ...base,
  requirements: [{ ...requirement, attendance_ratio: NaN }],
});
assert.equal(invalidConfig.feasibility, "unknown");
assert.deepEqual(invalidConfig.impossibilityReasons, []);

const tomorrow = { ...base, calls: ["2026-11-06"], todayClassClosed: false };
assert.equal(evaluateExamOutlook(tomorrow).feasibility, "possible");
assert.equal(
  evaluateExamOutlook({ ...tomorrow, todayClassClosed: true }).feasibility,
  "impossible",
);
const usedToday = [
  ...history,
  ...history.map((h) => ({ ...h, class_id: "today", class_date: today })),
];
assert.equal(
  evaluateExamOutlook({
    ...tomorrow,
    history: usedToday,
    requirements: [{ ...requirement, adult_required_repetitions: 3 }],
  }).feasibility,
  "impossible",
);
assert.equal(
  evaluateExamOutlook({ ...tomorrow, todayClassClosed: undefined }).feasibility,
  "possible",
);
const saturday = {
  ...base,
  calls: ["2026-11-08"],
  scheduledTrainingDates: ["2026-11-07"],
};
assert.equal(evaluateExamOutlook(saturday).feasibility, "possible");
assert.equal(
  evaluateExamOutlook({ ...saturday, scheduledTrainingDates: [] }).feasibility,
  "impossible",
);
const unusedAttendance = {
  ...tomorrow,
  history: completeHistory,
  attendance: attendance.filter((d) => d !== today).slice(-minimum + 1),
};
assert.equal(evaluateExamOutlook(unusedAttendance).feasibility, "possible");
const usedAttendance = {
  ...unusedAttendance,
  attendance: [...unusedAttendance.attendance.slice(1), today],
};
assert.equal(evaluateExamOutlook(usedAttendance).feasibility, "impossible");

assert.equal(
  evaluateExamOutlook({ ...base, cancelledTrainingDates: ["2026-11-10"] })
    .feasibility,
  "impossible",
);
assert.equal(
  evaluateExamOutlook({ ...tomorrow, cancelledTrainingDates: [today] })
    .feasibility,
  "impossible",
);

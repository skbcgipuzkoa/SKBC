import assert from "node:assert/strict";
import {
  evaluateExamOutlook,
  madridToday,
  outlookTrainingDates,
} from "../src/lib/exam-outlook.ts";
const member = {
  id: "m",
  display_name: "Test",
  legacy_id: "1",
  class: "adults",
  status: "active",
  grade: "5 KYU",
  joined_on: "2025-01-01",
  last_exam_on: "2025-01-01",
};
const item = {
  id: "t",
  name: "Technique",
  grade: "4 KYU",
  category: "goho",
  content_type: null,
};
const base = {
  member,
  today: "2026-11-05",
  attendance: outlookTrainingDates("2026-09-06", "2026-11-05", "adults", []),
  history: [],
  curriculum: [item],
  requirements: [
    {
      member_class: "adults",
      grade_pattern: "*",
      min_months: 12,
      attendance_ratio: 0.1,
      adult_required_repetitions: 2,
      technical_blocks_exam: true,
    },
  ],
  calls: ["2027-02-28"],
  closures: [],
};
const h = (d, id = "t", name = "Technique", grade = "4 KYU") => ({
  member_id: "m",
  class_date: d,
  technique_id: id,
  technique_name: name,
  technique_grade: grade,
  completed: true,
  counts_as_progression: true,
});
const p = evaluateExamOutlook({ ...base, history: [h("2026-10-01")] });
assert.equal(p.classification, "projected");
assert.equal(p.candidate, true);
assert.ok(p.estimatedReadyOn <= "2027-02-28");
const ready = evaluateExamOutlook({
  ...base,
  history: [h("2026-10-01"), h("2026-10-08")],
});
assert.equal(ready.currentReady, true);
const zero = evaluateExamOutlook({ ...base, history: [] });
assert.equal(zero.classification, "unknown");
const capped = evaluateExamOutlook({
  ...base,
  curriculum: [item, { ...item, id: "t2", name: "Other" }],
  history: Array.from({ length: 20 }, (_, i) =>
    h(`2026-10-${String(i + 1).padStart(2, "0")}`),
  ),
});
assert.equal(capped.evidence.usefulTechnicalGain, 2);
assert.ok(capped.deficits.some((x) => x.startsWith("2 repeticiones")));
const unrelated = evaluateExamOutlook({
  ...base,
  history: [h("2026-10-01", "unrelated")],
});
assert.equal(unrelated.evidence.usefulTechnicalGain, 0);
const variant = evaluateExamOutlook({
  ...base,
  history: [h("2026-10-01", null, "Technique", "3 KYU")],
});
assert.equal(variant.evidence.usefulTechnicalGain, 0);
const alias = evaluateExamOutlook({
  ...base,
  history: [h("2026-10-01", null)],
});
assert.equal(alias.evidence.usefulTechnicalGain, 1);
const future = evaluateExamOutlook({
  ...base,
  history: [h("2027-01-01")],
  attendance: [...base.attendance, "2027-01-01"],
});
assert.equal(future.evidence.usefulTechnicalGain, 0);
assert.equal(future.evidence.attendanceDays, base.attendance.length);
assert.deepEqual(
  evaluateExamOutlook({
    ...base,
    attendance: [...base.attendance, ...base.attendance],
  }),
  evaluateExamOutlook(base),
);
const expired = evaluateExamOutlook({
  ...base,
  calls: ["2026-01-01", "2026-12-07"],
  history: [h("2026-10-01")],
});
assert.equal(expired.callDate, "2026-12-07");
assert.equal(
  evaluateExamOutlook({ ...base, calls: ["2026-01-01"] }).callDate,
  null,
);
const short = evaluateExamOutlook({
  ...base,
  member: { ...member, last_exam_on: "2026-10-20" },
  requirements: [{ ...base.requirements[0], min_months: 0 }],
});
assert.equal(short.classification, "unknown");
assert.equal(madridToday(new Date("2026-11-05T23:30:00Z")), "2026-11-06");
assert.deepEqual(
  outlookTrainingDates("2024-02-28", "2024-02-29", "adults", []),
  ["2024-02-29"],
);
assert.deepEqual(
  outlookTrainingDates("2024-02-28", "2024-02-29", "adults", [
    { starts_on: "2024-02-29", ends_on: "2024-02-29", applies_to: "all" },
  ]),
  [],
);
const child = evaluateExamOutlook({
  ...base,
  member: { ...member, class: "kids" },
  curriculum: [],
  requirements: [
    {
      ...base.requirements[0],
      member_class: "kids",
      adult_required_repetitions: 0,
      technical_blocks_exam: false,
    },
  ],
});
assert.equal(child.classification, "projected");
assert.equal(child.currentReady, false);
assert.equal(child.teacherReviewRequired, true);
const first = evaluateExamOutlook({
  ...base,
  member: { ...member, joined_on: "2026-09-01", last_exam_on: null },
  calls: ["2026-12-07", "2027-06-27"],
});
assert.equal(first.callDate, "2027-06-27");
const advance = evaluateExamOutlook({
  ...base,
  member: { ...member, last_exam_on: "2026-01-01" },
  advanceMonths: 3,
});
assert.equal(advance.callDate, "2027-02-28");
assert.equal(
  evaluateExamOutlook({
    ...base,
    calls: ["2026-11-06"],
    history: [h("2026-10-01")],
  }).classification,
  "notyet",
);


assert.equal(
  evaluateExamOutlook({ ...base, member: { ...member, grade: "UNKNOWN" } })
    .classification,
  "unknown",
);
assert.equal(
  evaluateExamOutlook({
    ...base,
    attendance: ["2026-07-25"],
    history: [h("2026-10-01"), h("2026-10-08")],
  }).currentReady,
  false,
);
assert.equal(
  evaluateExamOutlook({ ...base, history: [h("2026-10-01"), h("2026-10-01")] })
    .evidence.usefulTechnicalGain,
  1,
);
const reviewed = evaluateExamOutlook({
  ...base,
  curriculum: [
    item,
    { ...item, id: "special", name: "Kata", category: "hokei" },
  ],
  history: [
    h("2026-10-01"),
    h("2026-10-08"),
    { ...h("2026-10-08", "special", "Kata"), counts_as_progression: false },
  ],
});
assert.equal(reviewed.currentReady, true);
assert.equal(
  evaluateExamOutlook({ ...base, calls: ["2026-02-30"] }).callDate,
  null,
);
const weekend = evaluateExamOutlook({
  ...base,
  member: { ...member, last_exam_on: "2025-12-05" },
  calls: ["2026-12-06"],
  history: [h("2026-10-01"), h("2026-10-08")],
});
assert.equal(weekend.estimatedReadyOn, "2026-12-05");

assert.notEqual(
  evaluateExamOutlook({ ...base, member: { ...member, grade: "UNKNOWN" } })
    .targetGrade,
  "MINARAI",
);

assert.equal(
  evaluateExamOutlook({
    ...base,
    member: { ...member, class: "kids", grade: "BLANCO" },
  }).targetGrade,
  "BLANCO-AMARILLO",
);
const legacyChild = evaluateExamOutlook({
  ...base,
  member: { ...member, class: "kids", grade: "3 KYU" },
  curriculum: [{ ...item, grade: "VERDE-AZUL", category: "hokei" }],
});
assert.equal(legacyChild.targetGrade, "VERDE-AZUL");
assert.ok(!legacyChild.deficits.some((d) => d.includes("Technique")));
assert.equal(
  evaluateExamOutlook({
    ...base,
    member: { ...member, class: "kids", grade: "AZUL Y MARRÓN" },
  }).targetGrade,
  "MARRON",
);
assert.equal(
  evaluateExamOutlook({
    ...base,
    member: { ...member, class: "kids", grade: "Unknown" },
  }).targetGrade,
  "Unknown",
);

// Preparation candidacy is distinct from a favorable forecast.
const nearCurriculum = Array.from({ length: 8 }, (_, i) => ({
  ...item,
  id: "near" + i,
  name: "Required " + i,
}));
const nearHistory = nearCurriculum
  .slice(0, 6)
  .map((t) => h("2026-08-01", t.id, t.name));
const nearInput = { ...base, curriculum: nearCurriculum, history: nearHistory };
const near = evaluateExamOutlook(nearInput);
assert.equal(near.preparationCandidate, true);
assert.equal(near.candidate, true);
assert.equal(near.classification, "unknown");
assert.equal(near.evidence.usefulTechnicalGain, 0);
assert.equal(near.estimatedReadyOn, null);
assert.ok(near.planningReasons.some((r) => r.includes("6/8")));
const annualNear = evaluateExamOutlook({ ...nearInput, calls: ["2027-06-26"] });
assert.equal(annualNear.preparationCandidate, true);
assert.equal(annualNear.candidate, true);
assert.equal(
  evaluateExamOutlook({ ...nearInput, calls: ["2027-06-26"], horizonDays: 180 })
    .preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({ ...nearInput, history: nearHistory.slice(0, 5) })
    .preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({ ...nearInput, attendance: base.attendance.slice(0, 5) })
    .preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({
    ...nearInput,
    attendance: base.attendance.filter((d) => d < "2026-10-15"),
  }).preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({
    ...nearInput,
    attendance: base.attendance.slice(-6),
    requirements: [{ ...base.requirements[0], attendance_ratio: 1 }],
  }).preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({ ...nearInput, curriculum: [] }).preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({ ...nearInput, calls: ["2026-01-01"] })
    .preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({
    ...nearInput,
    member: { ...member, status: "inactive" },
  }).preparationCandidate,
  false,
);
assert.equal(
  evaluateExamOutlook({ ...nearInput, member: { ...member, class: "kids" } })
    .preparationCandidate,
  false,
);

console.log("exam outlook: core and preparation-candidate scenarios passed");

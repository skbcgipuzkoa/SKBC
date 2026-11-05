import * as gradeHelpers from "../src/lib/grades.ts";
import * as examCallHelpers from "../src/lib/exam-call.ts";
import * as childProgramHelpers from "../src/lib/child-program.ts";
import * as assignmentHelpers from "../src/lib/integrated-exam-assignments.ts";
import * as sessionHelpers from "../src/lib/integrated-exam-session.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { randomUUID } from "node:crypto";
import ts from "typescript";
import * as reviewHelpers from "../src/lib/integrated-exam-review.ts";
const event = {
  id: "e",
  title: "Exam",
  program_type: "adults",
  pass_percentage: 70,
  status: "active",
  exam_date: "2026-10-31",
  updated_at: "2026-10-31T10:00:00Z",
};
const student = { id: "s", member_id: "m", target_grade: "1 KYU" };
const item = {
  id: "i",
  grade: "1 KYU",
  active: true,
  source: "manual",
  weight: 1,
  name: "Technique",
};
const examiner = {
  id: "x",
  exam_event_id: "e",
  access_token: "secret",
  submitted_at: "today",
  revoked_at: null,
  name: "Examiner",
  exam_events: event,
};
const score = {
  event_student_id: "s",
  event_item_id: "i",
  examiner_id: "x",
  score: 8,
  skipped: false,
  notes: "Good",
};
let writes = [];
let dbError = null;
let rows = [];
let scorePresent = true;
let lockHeld = false;
let reportCalls = 0;
let releaseReport;
const client = {
  from(table) {
    let op = "read",
      values,
      single = false;
    const filters = {};
    const query = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (resolve) => {
              if (table === "exam_events" && op === "update") {
                if (values.status === "review") {
                  if (lockHeld) return resolve({ data: null, error: null });
                  lockHeld = true;
                } else if (values.status === "active") lockHeld = false;
              }
              if (table === "exam_event_reviews" && values?.review_notes) {
                if (filters.review_notes !== rows[0]?.review_notes)
                  return resolve({ data: null, error: null });
                rows = [{ ...rows[0], review_notes: values.review_notes }];
              }
              resolve(
                dbError
                  ? { error: dbError }
                  : {
                      data:
                        op === "read"
                          ? single && table === "exam_event_examiners"
                            ? examiner
                            : {
                                exam_events: event,
                                exam_event_students: [student],
                                exam_event_items: [item],
                                exam_event_examiners: [examiner],
                                exam_event_scores: scorePresent ? [score] : [],
                                exam_event_reviews: rows,
                              }[table]
                          : [{ id: "claimed" }],
                      error: null,
                    },
              );
            };
          return (...args) => {
            if (key === "eq") filters[args[0]] = args[1];
            if (key === "maybeSingle" || key === "single") single = true;
            if (["update", "upsert", "insert", "delete"].includes(key)) {
              op = key;
              values = args[0];
              writes.push({ table, op, values });
            }
            return query;
          };
        },
      },
    );
    return query;
  },
};
const module = { exports: {} };
const source = ts.transpileModule(
  fs.readFileSync(
    new URL("../src/lib/integrated-exams.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
vm.runInNewContext(source, {
  module,
  exports: module.exports,
  require(name) {
    if (name.endsWith("/exam-call")) return examCallHelpers;
    if (name.endsWith("/grades")) return gradeHelpers;
    if (name.endsWith("/child-program")) return childProgramHelpers;
    if (name.endsWith("integrated-exam-assignments")) return assignmentHelpers;
    if (name.endsWith("integrated-exam-session")) return sessionHelpers;
    if (name === "node:crypto") return { randomUUID };
    if (name.endsWith("integrated-exam-documents"))
      return {
        generateIntegratedExamDocumentsForStudent: async () => {
          reportCalls++;
          await new Promise((resolve) => {
            releaseReport = resolve;
          });
          return "https://example.org/report.pdf";
        },
      };
    if (name.endsWith("integrated-exam-review")) return reviewHelpers;
    if (name.endsWith("supabase/admin"))
      return { createAdminClient: () => client };
    return {};
  },
  console,
  Date,
  Set,
  Map,
  Number,
  JSON,
  Error,
});
const backend = module.exports;
let data = await backend.getIntegratedExamAdmin("e");
assert.equal(data.summaries[0].percentage, 80);
examiner.submitted_at = null;
data = await backend.getIntegratedExamAdmin("e");
assert.equal(
  data.scores.length,
  1,
  "complete adult grade contributes before other grades are globally submitted",
);
examiner.submitted_at = "today";
dbError = new Error("database unavailable");
await assert.rejects(
  () => backend.getIntegratedExamAdmin("e"),
  /database unavailable/,
);
dbError = null;
const summary = (await backend.getIntegratedExamAdmin("e")).summaries[0];
const envelope = {
  version: 1,
  adjustments: { i: { score: 9, notes: "Correction" } },
  decision: "pass",
  conclusion: "Reviewed",
  sourceSignature: summary.sourceSignature,
};
rows = [{ event_student_id: "s", review_notes: JSON.stringify(envelope) }];
writes = [];
await backend.refreshIntegratedExamReview("e");
assert.equal(writes.length, 1);
assert.deepEqual(Object.keys(writes[0].values).sort(), [
  "base_percentage",
  "updated_at",
]);
await assert.rejects(
  () =>
    backend.saveIntegratedExamStudentReview({
      eventId: "e",
      studentId: "s",
      decision: "pass",
      adjustments: {},
      conclusion: "",
      sourceSignature: "stale",
    }),
  /cambiado/,
);
await assert.rejects(
  () =>
    backend.saveIntegratedExamStudentReview({
      eventId: "e",
      studentId: "other",
      decision: null,
      adjustments: {},
      conclusion: "",
      sourceSignature: "",
    }),
  /ajeno/,
);
await assert.rejects(
  () =>
    backend.saveIntegratedExamStudentReview({
      eventId: "e",
      studentId: "s",
      decision: null,
      adjustments: { i: { score: Infinity, notes: "" } },
      conclusion: "",
      sourceSignature: summary.sourceSignature,
    }),
  /Ajuste/,
);
await assert.rejects(
  () => backend.submitIntegratedExamScores({ token: "secret", scores: [] }),
  /ya fue enviada/,
);
event.status = "completed";
await assert.rejects(
  () =>
    backend.saveIntegratedExamStudentReview({
      eventId: "e",
      studentId: "s",
      decision: null,
      adjustments: {},
      conclusion: "",
      sourceSignature: summary.sourceSignature,
    }),
  /cerrado/,
);
event.status = "active";
scorePresent = false;
examiner.submitted_at = null;
await assert.rejects(
  () => backend.submitIntegratedExamScores({ token: "secret", scores: [] }),
  /Completa/,
);
await assert.rejects(
  () =>
    backend.submitIntegratedExamScores({
      token: "secret",
      scores: [
        { eventStudentId: "s", eventItemId: "i", score: 11, skipped: false },
      ],
    }),
  /entre 0 y 10/,
);
await assert.rejects(
  () =>
    backend.submitIntegratedExamScores({
      token: "secret",
      scores: [
        { eventStudentId: "s", eventItemId: "i", score: 7.5, skipped: false },
      ],
    }),
  /0, 5 o 10/,
);
await assert.rejects(
  () => backend.finalizeIntegratedExamEvent("e"),
  /Todos los examinadores/,
);
examiner.submitted_at = "today";
scorePresent = true;
rows = [];
await assert.rejects(
  () => backend.finalizeIntegratedExamEvent("e"),
  /decision actual/,
);
const action = fs.readFileSync(
  new URL("../src/app/examenes/review-actions.ts", import.meta.url),
  "utf8",
);
for (const name of [
  "saveIntegratedExamReviewAction",
  "submitInternalExamScoresAction",
  "retryIntegratedExamDocumentsAction",
]) {
  const body = action.slice(action.indexOf(`function ${name}`));
  assert.ok(
    body.indexOf("hasInternalAccess") < body.indexOf("try {"),
    `${name} authenticates before mutations`,
  );
}
const pendingInput = {
  eventId: "e",
  studentId: "s",
  decision: null,
  adjustments: {},
  conclusion: "",
  sourceSignature: summary.sourceSignature,
};
const concurrent = await Promise.allSettled([
  backend.saveIntegratedExamStudentReview(pendingInput),
  backend.saveIntegratedExamStudentReview(pendingInput),
]);
assert.equal(concurrent.filter((row) => row.status === "fulfilled").length, 1);
assert.equal(concurrent.filter((row) => row.status === "rejected").length, 1);
assert.equal(lockHeld, false, "mutation always releases the event lock");
event.status = "review";
event.updated_at = new Date().toISOString();
await assert.rejects(
  () => backend.saveIntegratedExamStudentReview(pendingInput),
  /registrando/,
);
event.updated_at = "2026-01-01T00:00:00Z";
await backend.saveIntegratedExamStudentReview(pendingInput);
assert.equal(lockHeld, false, "expired lease can be recovered");
event.status = "active";
event.status = "completed";
rows = [
  {
    event_student_id: "s",
    review_notes: JSON.stringify({
      ...envelope,
      decision: "fail",
      registeredAt: "2026-10-31T12:00:00Z",
    }),
  },
];
const firstRetry = backend.retryIntegratedExamDocuments("e", "s");
while (!releaseReport) await new Promise((resolve) => setTimeout(resolve, 0));
const secondRetry = await backend.retryIntegratedExamDocuments("e", "s");
assert.match(secondRetry.join(" "), /se estan generando/);
assert.equal(reportCalls, 1, "a concurrent retry cannot upload another report");
releaseReport();
await firstRetry;
const stored = JSON.parse(rows[0].review_notes);
assert.equal(stored.reportUrl, "https://example.org/report.pdf");
assert.equal(stored.documentLeaseId, undefined);
await backend.retryIntegratedExamDocuments("e", "s");
assert.equal(reportCalls, 1, "saved report is reused by later retries");
console.log("Integrated exam backend checks passed");
// Successful end-to-end service registration with an isolated in-memory database.
const registrationEvent = {
  ...event,
  status: "active",
  updated_at: "2026-10-31T10:00:00.000Z",
};
const registrationStudents = [
  { ...student },
  { ...student, id: "failed", member_id: "member-failed" },
];
const registrationScores = registrationStudents.map((entry) => ({
  ...score,
  event_student_id: entry.id,
}));
const registrationReviews = registrationStudents.map((entry, index) => {
  const calculated = reviewHelpers.buildStudentReview({
    studentId: entry.id,
    items: [item],
    scores: registrationScores.filter(
      (row) => row.event_student_id === entry.id,
    ),
    adjustments: {},
    passPercentage: 70,
  });
  return {
    event_student_id: entry.id,
    exam_event_id: "e",
    review_notes: JSON.stringify({
      version: 1,
      adjustments: {},
      decision: index === 0 ? "pass" : "fail",
      conclusion: index === 0 ? "Approved" : "Teacher decision after review",
      sourceSignature: calculated.sourceSignature,
    }),
  };
});
const database = {
  exam_events: [registrationEvent],
  exam_event_students: registrationStudents,
  exam_event_items: [item],
  exam_event_scores: registrationScores,
  exam_event_examiners: [{ ...examiner, submitted_at: "2026-10-31T10:00:00Z" }],
  exam_event_reviews: registrationReviews,
};
for (const table of [
  "exam_event_students",
  "exam_event_items",
  "exam_event_scores",
  "exam_event_examiners",
])
  for (const row of database[table]) row.exam_event_id = "e";
let failDiploma = false;
const registeredMembers = [],
  reports = [],
  diplomas = [];
let failSettingsOnce = false;
let failSubmittedOnce = false;
let generatedId = 0;
const registrationClient = {
  from(table) {
    let operation = "select",
      values,
      single = false;
    const filters = [];
    const query = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (resolve) => {
              let matches = (database[table] ?? []).filter((row) =>
                filters.every(([field, value]) => row[field] === value),
              );
              if (
                operation === "update" &&
                table === "exam_events" &&
                values.notes &&
                failSettingsOnce
              ) {
                failSettingsOnce = false;
                return resolve({
                  data: null,
                  error: new Error("settings write failed"),
                });
              }
              if (
                operation === "update" &&
                table === "exam_event_examiners" &&
                values.submitted_at &&
                failSubmittedOnce
              ) {
                failSubmittedOnce = false;
                return resolve({
                  data: null,
                  error: new Error("submitted marker failed"),
                });
              }
              if (operation === "update")
                for (const row of matches) Object.assign(row, values);
              if (operation === "insert") {
                const entries = Array.isArray(values) ? values : [values];
                matches = entries.map((entry) => ({
                  id: entry.id ?? "generated-" + ++generatedId,
                  ...(table === "exam_event_examiners"
                    ? {
                        submitted_at: null,
                        revoked_at: null,
                        access_token: "new-token-" + generatedId,
                      }
                    : {}),
                  ...(table === "exam_event_items" ? { active: true } : {}),
                  ...entry,
                }));
                (database[table] ??= []).push(...matches);
              }
              if (operation === "upsert") {
                matches = [];
                for (const entry of Array.isArray(values) ? values : [values]) {
                  const existing = database[table].find(
                    (row) =>
                      row.event_student_id === entry.event_student_id &&
                      (table !== "exam_event_scores" ||
                        (row.event_item_id === entry.event_item_id &&
                          row.examiner_id === entry.examiner_id)),
                  );
                  if (existing) Object.assign(existing, entry);
                  else database[table].push({ ...entry });
                  matches.push(existing ?? entry);
                }
              }
              resolve({
                data: structuredClone(single ? (matches[0] ?? null) : matches),
                error: null,
              });
            };
          return (...args) => {
            if (key === "eq" || key === "is") filters.push(args);
            if (key === "update" || key === "upsert" || key === "insert") {
              operation = key;
              values = args[0];
            }
            if (key === "single" || key === "maybeSingle") single = true;
            return query;
          };
        },
      },
    );
    return query;
  },
};
const registrationModule = { exports: {} };
vm.runInNewContext(source, {
  module: registrationModule,
  exports: registrationModule.exports,
  console,
  Date,
  Set,
  Map,
  Number,
  JSON,
  Error,
  require(name) {
    if (name.endsWith("/exam-call")) return examCallHelpers;
    if (name.endsWith("/grades")) return gradeHelpers;
    if (name.endsWith("/child-program")) return childProgramHelpers;
    if (name.endsWith("integrated-exam-assignments")) return assignmentHelpers;
    if (name.endsWith("integrated-exam-session")) return sessionHelpers;
    if (name === "node:crypto") return { randomUUID };
    if (name.endsWith("integrated-exam-review")) return reviewHelpers;
    if (name.endsWith("supabase/admin"))
      return { createAdminClient: () => registrationClient };
    if (name.endsWith("/exams"))
      return {
        registerExam: async (input) => {
          registeredMembers.push(input.memberId);
          return { examId: "official-pass" };
        },
      };
    if (name.endsWith("integrated-exam-documents"))
      return {
        generateIntegratedExamDocumentsForStudent: async (input) => {
          reports.push({
            studentId: input.student.id,
            decision: input.review.decision,
            examId: input.examId,
          });
          return `https://example.org/${input.student.id}.pdf`;
        },
      };
    if (name.endsWith("/diplomas"))
      return {
        generateDiplomaForExam: async (id) => {
          diplomas.push(id);
          if (failDiploma) throw new Error("Drive unavailable");
          return "https://example.org/diploma.pdf";
        },
      };
    return {};
  },
});
const finalized =
  await registrationModule.exports.finalizeIntegratedExamEvent("e");
assert.deepEqual(
  registeredMembers,
  ["m"],
  "only the approved member is promoted",
);
assert.equal(database.exam_events[0].status, "completed");
assert.equal(finalized.registeredCount, 1);
assert.equal(finalized.passedCount, 1);
assert.equal(finalized.studentCount, 2);
assert.equal(finalized.documentErrorCount, 0);
assert.equal(
  database.exam_event_students.find((row) => row.id === "failed").final_passed,
  false,
);
assert.equal(
  database.exam_event_students.find((row) => row.id === "failed").target_grade,
  "1 KYU",
);
assert.equal(reports.length, 2);
assert.equal(
  reports.find((row) => row.studentId === "failed").examId,
  undefined,
);
assert.deepEqual(diplomas, ["official-pass"]);
for (const row of database.exam_event_reviews) {
  const saved = JSON.parse(row.review_notes);
  assert.ok(saved.registeredAt);
  assert.ok(saved.reportUrl);
  assert.equal(saved.documentLeaseId, undefined);
  if (row.event_student_id === "failed")
    assert.equal(saved.registeredExamId, undefined);
}
await assert.rejects(
  () => registrationModule.exports.finalizeIntegratedExamEvent("e"),
  /cerrado/,
);
assert.equal(
  registeredMembers.length,
  1,
  "second finalization never registers again",
);
console.log("Integrated exam successful finalization checks passed");

const approvalRow = database.exam_event_reviews.find(
  (row) => row.event_student_id === "s",
);
const approvalReview = JSON.parse(approvalRow.review_notes);
delete approvalReview.diplomaUrl;
approvalRow.review_notes = JSON.stringify(approvalReview);
failDiploma = true;
const failedDocumentRetry =
  await registrationModule.exports.retryIntegratedExamDocuments("e", "s");
assert.match(failedDocumentRetry.join(" "), /Drive unavailable/);
assert.equal(
  JSON.parse(approvalRow.review_notes).reportUrl,
  "https://example.org/s.pdf",
);
assert.equal(reports.length, 2, "report URL survives a diploma failure");
failDiploma = false;
await registrationModule.exports.retryIntegratedExamDocuments("e", "s");
assert.equal(
  JSON.parse(approvalRow.review_notes).diplomaUrl,
  "https://example.org/diploma.pdf",
);
assert.equal(
  registeredMembers.length,
  1,
  "document retries never promote again",
);
console.log("Integrated exam document recovery checks passed");
await assert.rejects(
  () =>
    backend.createIntegratedExamItem({
      eventId: "e",
      name: "Late syllabus edit",
    }),
  /temario no puede/,
);
// Grade-scoped evaluation must not expose or accept another group's pupils.
database.exam_events[0].status = "active";
database.exam_events[0].notes = assignmentHelpers.encodeExamAssignments(
  "Teacher event notes",
  { x: ["1 KYU"], y: ["2 KYU"] },
);
database.exam_event_students[1].target_grade = "2 KYU";
database.exam_event_items.push({
  ...item,
  id: "i-other",
  grade: "2 KYU",
  exam_event_id: "e",
  order_index: 0,
});
database.exam_event_examiners[0].submitted_at = null;
database.exam_event_examiners[0].exam_events = database.exam_events[0];
database.exam_event_examiners.push({
  ...database.exam_event_examiners[0],
  id: "y",
  name: "Other examiner",
  access_token: "other-secret",
  submitted_at: "2026-10-31T11:00:00Z",
});
database.exam_event_scores.push({
  ...score,
  event_student_id: "failed",
  event_item_id: "i-other",
  exam_event_id: "e",
  examiner_id: "x",
});
const assigned = await registrationModule.exports.getExaminerExamByToken(
  "secret",
  "1 KYU",
);
assert.deepEqual(
  assigned.students.map((row) => row.id),
  ["s"],
);
assert.deepEqual(
  assigned.items.map((row) => row.id),
  ["i"],
);
assert.equal(assigned.examiner.exam_events, undefined);
assert.equal(assigned.event.notes, "Teacher event notes");
assert.equal(assigned.assignedGrades.join(","), "1 KYU");
assert.ok(!JSON.stringify(assigned).includes("other-secret"));
await assert.rejects(
  () =>
    registrationModule.exports.submitIntegratedExamScores({
      token: "secret",
      scores: [
        {
          eventStudentId: "failed",
          eventItemId: "i-other",
          score: 10,
          skipped: false,
        },
      ],
    }),
  /ajena/,
);
await assert.rejects(
  () =>
    registrationModule.exports.saveIntegratedExamAssignments({
      eventId: "e",
      scopes: { x: ["1 KYU"], y: ["2 KYU"] },
    }),
  /despues/,
);
database.exam_event_examiners[0].submitted_at = "2026-10-31T11:00:00Z";
const assignedAdmin =
  await registrationModule.exports.getIntegratedExamAdmin("e");
assert.ok(
  !assignedAdmin.scores.some(
    (row) => row.examiner_id === "x" && row.event_student_id === "failed",
  ),
);
console.log("Scoped examiner backend checks passed");
// One personal examiner submits each assigned grade independently.
database.exam_events[0].status = "active";
database.exam_events[0].notes = assignmentHelpers.encodeExamAssignments(
  "Groups",
  { x: ["2 KYU", "1 KYU"] },
  { gradeGroupMode: true, pendingExaminerIds: [] },
);
database.exam_event_examiners[0].submitted_at = null;
database.exam_event_examiners[1].revoked_at = "2026-11-01T00:00:00Z";
database.exam_event_scores = [];
database.exam_event_reviews = [];
const firstGrade = await registrationModule.exports.getExaminerExamByToken(
  "secret",
  "1 KYU",
);
assert.equal(firstGrade.students.length, 1);
assert.equal(firstGrade.students[0].id, "s");
assert.equal(firstGrade.items.length, 1);
await assert.rejects(
  () => registrationModule.exports.getExaminerExamByToken("secret", "3 KYU"),
  /ajeno/,
);
await registrationModule.exports.submitIntegratedExamScores({
  token: "secret",
  grade: "1 KYU",
  scores: [{ eventStudentId: "s", eventItemId: "i", score: 5, skipped: false }],
});
assert.equal(database.exam_event_examiners[0].submitted_at, null);
let remaining =
  await registrationModule.exports.getExaminerExamByToken("secret");
assert.equal(remaining.routeGrades.join(","), "2 KYU");
assert.equal(remaining.completedGrades.join(","), "1 KYU");
assert.equal(remaining.students[0].id, "failed");
let partialAdmin = await registrationModule.exports.getIntegratedExamAdmin("e");
assert.equal(
  partialAdmin.summaries.find((row) => row.studentId === "s").percentage,
  50,
);
assert.equal(partialAdmin.hasSubmittedScores, true);
await assert.rejects(
  () =>
    registrationModule.exports.submitIntegratedExamScores({
      token: "secret",
      grade: "1 KYU",
      scores: [
        { eventStudentId: "s", eventItemId: "i", score: 10, skipped: false },
      ],
    }),
  /ya fue enviado/,
);
await assert.rejects(
  () =>
    registrationModule.exports.saveIntegratedExamAssignments({
      eventId: "e",
      scopes: { x: ["1 KYU", "2 KYU"] },
    }),
  /despues/,
);
await assert.rejects(
  () =>
    registrationModule.exports.createIntegratedExamItem({
      eventId: "e",
      name: "Late change",
    }),
  /temario no puede/,
);
failSubmittedOnce = true;
await assert.rejects(
  () =>
    registrationModule.exports.submitIntegratedExamScores({
      token: "secret",
      grade: "2 KYU",
      scores: [
        {
          eventStudentId: "failed",
          eventItemId: "i-other",
          score: 10,
          skipped: false,
        },
      ],
    }),
  /submitted marker failed/,
);
assert.equal(
  database.exam_event_scores.length,
  2,
  "grade rows survive the marker failure",
);
await registrationModule.exports.submitIntegratedExamScores({
  token: "secret",
  grade: "2 KYU",
  scores: [
    {
      eventStudentId: "failed",
      eventItemId: "i-other",
      score: 10,
      skipped: false,
    },
  ],
});
assert.ok(
  database.exam_event_examiners[0].submitted_at,
  "retry repairs global marker without scoring again",
);
assert.equal(database.exam_event_scores.length, 2);
// Teacher finalization also reconciles a failed global marker without an examiner retry.
database.exam_event_examiners[0].submitted_at=null;
const academicRecovery=await registrationModule.exports.getIntegratedExamAdmin("e");
for(const summary of academicRecovery.summaries)await registrationModule.exports.saveIntegratedExamStudentReview({eventId:"e",studentId:summary.studentId,adjustments:{},decision:summary.automaticPassed?"pass":"fail",conclusion:"Reviewed",sourceSignature:summary.sourceSignature});
await registrationModule.exports.finalizeIntegratedExamEvent("e");
assert.ok(database.exam_event_examiners[0].submitted_at,"teacher finalization repairs the marker before registration");
assert.equal(database.exam_events[0].status,"completed");
database.exam_events[0].status="active";
// Group configuration rollback preserves identity, scopes and coverage.
database.exam_event_scores = [];
database.exam_event_reviews = [];
database.exam_event_examiners[0].submitted_at = null;
database.exam_event_examiners[1].submitted_at = null;
database.exam_event_examiners[1].revoked_at = null;
database.exam_events[0].notes = assignmentHelpers.encodeExamAssignments(
  "Groups",
  { x: ["1 KYU"], y: ["2 KYU"] },
  { gradeGroupMode: true, pendingExaminerIds: [] },
);
const originalIdentities = database.exam_event_examiners.map((row) => ({
  id: row.id,
  name: row.name,
  revoked_at: row.revoked_at,
}));
failSettingsOnce = true;
await assert.rejects(
  () =>
    registrationModule.exports.saveAdultGradeGroups({
      eventId: "e",
      examiners: [
        { id: "x", name: "Same examiner", grades: ["1 KYU"] },
        { id: "y", name: "Same examiner", grades: ["2 KYU"] },
      ],
    }),
  /settings write failed/,
);
assert.deepEqual(
  database.exam_event_examiners.map((row) => ({
    id: row.id,
    name: row.name,
    revoked_at: row.revoked_at,
  })),
  originalIdentities,
);
assert.equal(
  assignmentHelpers
    .decodeExamAssignments(database.exam_events[0].notes)
    .scopes.y.join(","),
  "2 KYU",
);
await registrationModule.exports.saveAdultGradeGroups({
  eventId: "e",
  examiners: [
    { id: "x", name: "Same examiner", grades: ["1 KYU"] },
    { id: "y", name: "Same examiner", grades: ["2 KYU"] },
  ],
});
assert.equal(
  database.exam_event_examiners.filter((row) => !row.revoked_at).length,
  1,
);
assert.equal(
  assignmentHelpers.decodeExamAssignments(database.exam_events[0].notes).scopes
    .x.length,
  2,
);
// A pending link identifies only itself and never merges personal links by name.
database.exam_events[0].notes = assignmentHelpers.encodeExamAssignments(
  "Groups",
  { x: ["1 KYU", "2 KYU"] },
  { gradeGroupMode: true, pendingExaminerIds: ["x"] },
);
assert.equal(
  (await registrationModule.exports.getExaminerExamByToken("secret"))
    .needsExaminerName,
  true,
);
await assert.rejects(
  () =>
    registrationModule.exports.submitIntegratedExamScores({
      token: "secret",
      grade: "1 KYU",
      scores: [],
    }),
  /tu nombre/,
);
await registrationModule.exports.identifyIntegratedExaminer({
  token: "secret",
  name: "Named examiner",
});
assert.equal(database.exam_event_examiners[0].name, "Named examiner");
assert.deepEqual(
  assignmentHelpers.decodeExamAssignments(database.exam_events[0].notes)
    .pendingExaminerIds,
  [],
);
assert.equal(database.exam_event_examiners[0].access_token, "secret");
// Actual creation needs pupils, not preselected examiner names.
database.members = [
  {
    id: "member-1",
    legacy_id: "1",
    display_name: "One",
    class: "adults",
    grade: "2 KYU",
    status: "active",
  },
  {
    id: "member-2",
    legacy_id: "2",
    display_name: "Two",
    class: "adults",
    grade: "3 KYU",
    status: "active",
  },
];
database.techniques = [
  {
    id: "tech-1",
    grade: "1 KYU",
    name: "One",
    active: true,
    category: "technique",
  },
  {
    id: "tech-2",
    grade: "2 KYU",
    name: "Two",
    active: true,
    category: "technique",
  },
];
const created = await registrationModule.exports.createIntegratedExamEvent({
  title: "Adult groups",
  examDate: "2026-11-01",
  programType: "adults",
  passPercentage: 70,
  memberIds: ["member-1", "member-2"],
  examinerNames: [],
});
const createdEvent = database.exam_events.find(
  (row) => row.id === created.eventId,
);
const createdSettings = assignmentHelpers.decodeExamAssignments(
  createdEvent.notes,
);
const createdExaminers = database.exam_event_examiners.filter(
  (row) => row.exam_event_id === created.eventId,
);
assert.equal(createdSettings.gradeGroupMode, true);
assert.equal(createdExaminers.length, 2);
assert.equal(createdSettings.pendingExaminerIds.length, 2);
assert.ok(
  createdExaminers.every(
    (row) =>
      row.name.startsWith("Pendiente · ") &&
      createdSettings.scopes[row.id].length === 1,
  ),
);
assert.equal(created.ownExaminerId, undefined);
console.log(
  "Adult grade-group creation, partial submission and recovery checks passed",
);

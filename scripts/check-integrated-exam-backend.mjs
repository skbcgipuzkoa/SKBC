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
                                exam_event_scores: [score],
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
assert.equal(data.scores.length, 0);
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
  () => backend.finalizeIntegratedExamEvent("e"),
  /Todos los examinadores/,
);
examiner.submitted_at = "today";
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
              if (operation === "update")
                for (const row of matches) Object.assign(row, values);
              if (operation === "upsert") {
                const existing = database[table].find(
                  (row) => row.event_student_id === values.event_student_id,
                );
                if (existing) Object.assign(existing, values);
                else database[table].push({ ...values });
                matches = [existing ?? values];
              }
              resolve({
                data: structuredClone(single ? (matches[0] ?? null) : matches),
                error: null,
              });
            };
          return (...args) => {
            if (key === "eq" || key === "is") filters.push(args);
            if (key === "update" || key === "upsert") {
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

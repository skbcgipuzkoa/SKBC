import * as adultIdentity from "../src/lib/adult-exam-technique-identity.ts";
import { loadAllPages } from "../src/lib/load-all-pages.ts";
import { adaptTechniqueSummary } from "../src/lib/technique-summary-adapter.ts";
import * as gradeHelpers from "../src/lib/grades.ts";
import * as adultCurriculum from "../src/lib/adult-exam-curriculum.ts";
import * as adultGakka from "../src/lib/adult-exam-gakka.ts";
import * as snapshotHelpers from "../src/lib/integrated-exam-snapshot.ts";
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
let internalAccess = true;
let dbError = null;
let rows = [];
let scorePresent = true;
let lockHeld = false;
let parentFixture = null;
let parentReadCount = 0;
let reportCalls = 0;
let releaseReport;
const client = {
  from(table) {
    let op = "read",
      values,
      single = false,
      selectedFields = "";
    const filters = {};
    const query = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (resolve) => {
              if (selectedFields.includes("source_examiner:"))
                return resolve({
                  data: null,
                  error: {
                    code: "PGRST201",
                    message:
                      "Ambiguous self relationship rejected by PostgREST",
                  },
                });
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
                            ? filters.id
                              ? (parentReadCount++,
                                parentFixture?.id === filters.id
                                  ? parentFixture
                                  : null)
                              : examiner
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
            if (key === "select") selectedFields = args[0] ?? "";
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
    if (name.endsWith("/adult-exam-technique-identity")) return adultIdentity;
    if (name.endsWith("/load-all-pages")) return { loadAllPages };
    if (name.endsWith("/technique-summary-adapter"))
      return { adaptTechniqueSummary };
    if (name.endsWith("/auth"))
      return { hasInternalAccess: async () => internalAccess };
    if (name.endsWith("/adult-exam-gakka")) return adultGakka;
    if (name.endsWith("/adult-exam-curriculum")) return adultCurriculum;
    if (name.endsWith("/integrated-exam-snapshot")) return snapshotHelpers;
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
assert.equal(
  (await backend.getExaminerExamByToken("secret")).examiner.id,
  "x",
  "Valid direct tokens must not execute an ambiguous self-FK embed",
);
assert.equal(parentReadCount, 0, "Direct tokens need no parent lookup");
const orderingFixture = [
  {
    id: "goho",
    source: "technique",
    section: "PROGRAMA",
    category: "goho",
    name: "Tenshin geri",
    grade: "BLANCO",
  },
  { id: "cut-white", source: "cut", cut_grade: "BLANCO" },
  {
    id: "umpo",
    source: "technique",
    section: "UMPO_HO",
    category: "goho",
    name: "Um po ho",
    grade: "AMARILLO",
  },
  {
    id: "juho",
    source: "child_syllabus",
    section: "Técnicas",
    category: "juho",
    name: "Kote nuki",
    grade: "AMARILLO",
  },
  {
    id: "ukemi",
    source: "technique",
    section: "UKEMI",
    category: "goho",
    name: "Mae ukemi",
    grade: "BLANCO",
  },
  {
    id: "kata",
    source: "technique",
    section: "KATA_TANEN",
    category: "hokei",
    name: "Tenchi ken dai ichi",
    grade: "AMARILLO",
  },
  {
    id: "gakka",
    source: "manual",
    section: "GAKKA",
    name: "Preguntas",
    grade: null,
  },
  {
    id: "keimyaku",
    source: "manual",
    section: "KEIMYAKU",
    name: "Keimyaku",
    grade: "BLANCO",
  },
  { id: "cut-yellow", source: "cut", cut_grade: "AMARILLO" },
];
assert.equal(
  typeof backend.orderIntegratedExamItems,
  "function",
  "Exam ordering must enforce techniques last",
);
const orderedFixture = backend.orderIntegratedExamItems(
  orderingFixture,
  "kids_progressive",
);
assert.deepEqual(
  Array.from(orderedFixture, (x) => x.id),
  orderingFixture.map((x) => x.id),
  "Progressive children keep the original exercises and seating markers unchanged",
);
assert.deepEqual(
  Array.from(
    backend.orderIntegratedExamItems(orderingFixture, "kids"),
    (x) => x.id,
  ),
  orderingFixture.map((x) => x.id),
  "Standard children also retain their original order",
);
assert.equal(
  orderingFixture[0].id,
  "goho",
  "Do not mutate the original snapshot",
);
assert.deepEqual(
  Array.from(
    backend.orderIntegratedExamItems(orderedFixture, "kids_progressive"),
    (x) => x.id,
  ),
  Array.from(orderedFixture, (x) => x.id),
  "Ordering must be idempotent",
);
assert.deepEqual(
  Array.from(
    backend.orderIntegratedExamItems(
      orderingFixture.filter((x) => x.source !== "cut"),
      "adults",
    ),
    (x) => x.id,
  ),
  ["umpo", "ukemi", "kata", "gakka", "keimyaku", "goho", "juho"],
);
assert.equal(
  backend.orderIntegratedExamItems(
    [
      {
        id: "shoulder",
        source: "technique",
        section: "PROGRAMA",
        category: "juho",
        name: "Kata muna otoshi",
      },
      { id: "theory", source: "manual", section: "GAKKA" },
    ],
    "adults",
  )[1].id,
  "shoulder",
  "Kata in a technique name must not turn it into a kata",
);
const embuOrder = [
  { id: "embu", source: "manual", section: "KUMI_EMBU", name: "Kumi embu" },
  { id: "goho", source: "technique", section: "PROGRAMA", category: "goho" },
  { id: "theory", source: "manual", section: "GAKKA" },
];
assert.deepEqual(
  Array.from(
    backend.orderIntegratedExamItems(embuOrder, "adults"),
    (x) => x.id,
  ),
  ["theory", "goho", "embu"],
  "Embu must be the last adult subject",
);
const weightedItems = embuOrder
  .filter((x) => x.id !== "theory")
  .map((row) => ({
    ...row,
    active: true,
    weight: backend.adultExamItemWeight(row),
  }));
const weightedSummary = reviewHelpers.buildStudentReview({
  studentId: "weighted",
  items: weightedItems,
  scores: weightedItems.map((row) => ({
    event_student_id: "weighted",
    event_item_id: row.id,
    examiner_id: "one",
    score: row.id === "embu" ? 10 : 0,
    skipped: false,
    notes: "",
  })),
  passPercentage: 70,
});
assert.equal(
  weightedSummary.percentage,
  75,
  "One embu mark weighs three times one ordinary technique",
);
examiner.source_examiner_id = "old-parent";
parentFixture = {
  id: "old-parent",
  access_token: "parent-source-token",
  revoked_at: "2026-01-01",
};
await assert.rejects(
  () => backend.getExaminerExamByToken("secret"),
  /Enlace de examen no valido/,
);
parentFixture = {
  id: "old-parent",
  access_token: "parent-source-token",
  revoked_at: null,
  exam_events: {
    notes: assignmentHelpers.encodeExamAssignments("", {
      "old-parent": ["2 KYU"],
    }),
  },
};
event.target_grade = "1 KYU";
await assert.rejects(
  () => backend.getExaminerExamByToken("secret"),
  /Enlace de examen no valido/,
);
parentFixture.exam_events.notes = assignmentHelpers.encodeExamAssignments(
  "",
  { "old-parent": ["1 KYU"] },
  { pendingExaminerIds: ["old-parent"] },
);
await assert.rejects(
  () => backend.getExaminerExamByToken("secret"),
  /Enlace de examen no valido/,
);
parentFixture.exam_events.notes = assignmentHelpers.encodeExamAssignments(
  "",
  { "old-parent": ["1 KYU"] },
  { pendingExaminerIds: [] },
);
assert.equal((await backend.getExaminerExamByToken("secret")).examiner.id, "x");
assert.ok(
  parentReadCount >= 4,
  "Clone credentials require independent parent-row reads",
);
parentFixture.access_token = "disabled_" + "a".repeat(32);
await assert.rejects(
  () => backend.getExaminerExamByToken("secret"),
  /Enlace de examen no valido/,
);
parentFixture = null;
await assert.rejects(
  () => backend.getExaminerExamByToken("secret"),
  /Enlace de examen no valido/,
);

delete event.target_grade;
delete examiner.source_examiner_id;
parentFixture = null;
event.date_confirmed = false;
const pendingDateWrites = writes.length;
await assert.rejects(
  () => backend.getExaminerExamByToken("secret"),
  /pendiente de confirmar/,
);
await assert.rejects(
  () => backend.submitIntegratedExamScores({ token: "secret", scores: [] }),
  /pendiente de confirmar/,
);
await assert.rejects(
  () => backend.finalizeIntegratedExamEvent("e"),
  /Confirma el día real/,
);
assert.equal(
  writes.length,
  pendingDateWrites,
  "An unconfirmed monthly event cannot be evaluated or finalized",
);
delete event.date_confirmed;
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
let failCredentialCas = false;
const registrationClient = {
  from(table) {
    let operation = "select",
      values,
      single = false,
      selectedFields = "";
    const filters = [];
    const query = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then")
            return (resolve) => {
              if (selectedFields.includes("source_examiner:"))
                return resolve({
                  data: null,
                  error: {
                    code: "PGRST201",
                    message:
                      "Ambiguous self relationship rejected by PostgREST",
                  },
                });
              let matches = (database[table] ?? []).filter((row) =>
                filters.every(([field, value]) =>
                  Array.isArray(value)
                    ? value.includes(row[field])
                    : row[field] === value,
                ),
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
              if (
                operation === "update" &&
                table === "exam_event_examiners" &&
                values.access_token &&
                failCredentialCas
              ) {
                matches = [];
                failCredentialCas = false;
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
                      (table === "exam_event_items"
                        ? row.id === entry.id
                        : row.event_student_id === entry.event_student_id) &&
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
            if (key === "select") selectedFields = args[0] ?? "";
            if (key === "eq" || key === "is" || key === "in")
              filters.push(args);
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
    if (name.endsWith("/adult-exam-technique-identity")) return adultIdentity;
    if (name.endsWith("/load-all-pages")) return { loadAllPages };
    if (name.endsWith("/technique-summary-adapter"))
      return { adaptTechniqueSummary };
    if (name.endsWith("/auth"))
      return { hasInternalAccess: async () => internalAccess };
    if (name.endsWith("/integrated-exam-snapshot")) return snapshotHelpers;
    if (name.endsWith("/adult-exam-gakka")) return adultGakka;
    if (name.endsWith("/adult-exam-curriculum")) return adultCurriculum;
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
const beforeOrderingItems = database.exam_event_items.map((row) => ({
  ...row,
}));
database.exam_event_items.find((row) => row.id === "i").category = "goho";
database.exam_event_items.push({
  ...item,
  id: "theory-last-in-catalog",
  exam_event_id: "e",
  section: "UMPO_HO",
  name: "Chidori ashi",
  order_index: 999,
});
const reorderedRoute = await registrationModule.exports.getExaminerExamByToken(
  "secret",
  "1 KYU",
);
assert.deepEqual(
  Array.from(reorderedRoute.items, (row) => row.id),
  ["theory-last-in-catalog", "i"],
  "Examiner opens theory before techniques regardless of stored order",
);
const reorderedAdmin =
  await registrationModule.exports.getIntegratedExamAdmin("e");
assert.ok(
  reorderedAdmin.items.findIndex((row) => row.id === "theory-last-in-catalog") <
    reorderedAdmin.items.findIndex((row) => row.id === "i"),
  "Teacher and examiner share the techniques-last rule",
);
assert.deepEqual(
  Array.from(
    reorderedAdmin.summaries.find((row) => row.studentId === "s").items,
    (row) => row.id,
  ),
  ["theory-last-in-catalog", "i"],
  "Individual review/report also keeps techniques last",
);
database.exam_event_items = beforeOrderingItems;
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
database.exam_event_examiners[0].submitted_at = null;
const academicRecovery =
  await registrationModule.exports.getIntegratedExamAdmin("e");
for (const summary of academicRecovery.summaries)
  await registrationModule.exports.saveIntegratedExamStudentReview({
    eventId: "e",
    studentId: summary.studentId,
    adjustments: {},
    decision: summary.automaticPassed ? "pass" : "fail",
    conclusion: "Reviewed",
    sourceSignature: summary.sourceSignature,
  });
await registrationModule.exports.finalizeIntegratedExamEvent("e");
assert.ok(
  database.exam_event_examiners[0].submitted_at,
  "teacher finalization repairs the marker before registration",
);
assert.equal(database.exam_events[0].status, "completed");
database.exam_events[0].status = "active";
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
database.techniques.push({
  id: "basic-1",
  grade: "1 KYU",
  name: "Mae ukemi",
  active: true,
  category: "goho",
  content_type: "UKEMI",
});
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
const createdItems = database.exam_event_items.filter(
  (row) => row.exam_event_id === created.eventId,
);
assert.equal(
  createdItems[0].technique_id,
  "basic-1",
  "New exam stores fundamentals before techniques",
);
assert.deepEqual(
  Array.from(createdItems, (row) => row.order_index),
  Array.from({ length: createdItems.length }, (_, index) => index + 1),
  "Stored order indices match the execution order",
);
assert.ok(
  createdItems.some((row) => row.section === "GAKKA_ENTREGA") &&
    createdItems.some((row) => row.section === "Keimyaku"),
  "New adult exams include the non-technique book subjects",
);
assert.equal(createdItems.at(-1).section, "Embu");
assert.ok(
  createdItems
    .filter((row) => row.section === "Embu")
    .every((row) => row.weight === 3),
);
assert.ok(
  createdItems
    .filter(
      (row) => row.section !== "Embu" && !row.section.startsWith("GAKKA_"),
    )
    .every((row) => row.weight === 1),
);
assert.ok(
  createdItems
    .filter((row) => row.section === "GAKKA_ENTREGA")
    .every((row) => row.weight === 0),
  "Written documents never contribute to physical exam scoring",
);
assert.ok(
  createdItems.every((row) => !("gakka" in row)),
  "Derived delivery metadata must never be sent as a database column",
);
const disabled = createdItems.find((row) => row.section === "GAKKA_ENTREGA");
disabled.active = false;
disabled.summary = "Teacher edited theory notes";
const missing = createdItems.find((row) => row.section === "Keimyaku");
database.exam_event_items = database.exam_event_items.filter(
  (row) => row.id !== missing.id,
);
const preservedId = disabled.id;
createdEvent.updated_at = "2026-11-06T10:00:00.000Z";
const completionCount =
  await registrationModule.exports.completeAdultExamCurriculum(created.eventId);
assert.equal(completionCount, 1, "Completion adds only the missing subject");
const afterCompletion = database.exam_event_items.filter(
  (row) => row.exam_event_id === created.eventId,
);
assert.equal(
  afterCompletion.find((row) => row.id === preservedId).active,
  false,
  "Completion never reactivates teacher-disabled subjects",
);
assert.equal(
  afterCompletion.find((row) => row.id === preservedId).summary,
  "Teacher edited theory notes",
);
assert.equal(
  afterCompletion.find((row) => row.technique_id === "basic-1").id,
  createdItems.find((row) => row.technique_id === "basic-1").id,
  "Catalogue association and item identity survive completion",
);
assert.equal(
  await registrationModule.exports.completeAdultExamCurriculum(created.eventId),
  0,
  "Repeated completion is idempotent",
);
const originalProgram = createdEvent.program_type;
createdEvent.program_type = "kids_progressive";
await assert.rejects(
  () => registrationModule.exports.completeAdultExamCurriculum(created.eventId),
  /solo para exámenes de adultos/,
);
createdEvent.program_type = originalProgram;
database.exam_event_reviews.push({
  exam_event_id: created.eventId,
  event_student_id: "teacher-reviewed",
  review_notes: "Teacher conclusion",
  reviewed_at: "2026-11-06T10:01:00Z",
});
await assert.rejects(
  () => registrationModule.exports.completeAdultExamCurriculum(created.eventId),
  /revisión del profesor/,
  "Teacher-reviewed exams cannot be rebuilt even without examiner scores",
);
database.exam_event_reviews = database.exam_event_reviews.filter(
  (row) => row.event_student_id !== "teacher-reviewed",
);
database.exam_events.push({
  id: "old-template",
  program_type: "adults",
  title: "Incomplete old template",
});
database.exam_event_items.push({
  ...item,
  id: "template-one",
  exam_event_id: "old-template",
  grade: "1 KYU",
  section: "PROGRAMA",
  category: "goho",
  name: "Kusshin zuki",
});
const copied = await registrationModule.exports.createIntegratedExamEvent({
  title: "Complete adult copy",
  examDate: "2026-11-10",
  programType: "adults",
  passPercentage: 70,
  memberIds: ["member-1"],
  examinerNames: [],
  templateEventId: "old-template",
});
const copiedItems = database.exam_event_items.filter(
  (row) => row.exam_event_id === copied.eventId,
);
assert.ok(
  copiedItems.some((row) => row.section === "GAKKA_ENTREGA") &&
    copiedItems.some((row) => row.section === "Keimyaku"),
  "Copying old adult templates also fills missing Kamoku subjects",
);
assert.ok(
  copiedItems.every((row) => row.grade === "1 KYU"),
  "Copied curriculum contains only the new target grade",
);
assert.equal(copiedItems.at(-1).section, "Embu");
console.log(
  "Adult grade-group creation, partial submission and recovery checks passed",
);
// Multiple same-grade pending judges must remain separate identities.
const linkEvent = {
  id: "links-event",
  title: "Credential test",
  program_type: "adults",
  status: "active",
  exam_date: "2099-12-15",
  date_confirmed: true,
  pass_percentage: 70,
  updated_at: "2026-11-06T10:00:00.000Z",
  notes: assignmentHelpers.encodeExamAssignments(
    "Teacher notes",
    {},
    { gradeGroupMode: true, pendingExaminerIds: [] },
  ),
};
database.exam_events.push(linkEvent);
database.exam_event_students.push({
  id: "links-student",
  exam_event_id: linkEvent.id,
  member_id: "links-member",
  target_grade: "1 KYU",
  current_grade: "2 KYU",
  display_order: 1,
});

database.exam_event_reviews.push({
  exam_event_id: linkEvent.id,
  event_student_id: "links-student",
  reviewed_at: "2026-11-06T10:01:00Z",
  review_notes: "Teacher-only review",
});
await assert.rejects(
  () =>
    registrationModule.exports.saveAdultGradeGroups({
      eventId: linkEvent.id,
      examiners: [{ name: "", grades: ["1 KYU"] }],
    }),
  /revisión del profesor/,
);
assert.equal(
  database.exam_event_examiners.some(
    (row) => row.exam_event_id === linkEvent.id,
  ),
  false,
);
database.exam_event_reviews = database.exam_event_reviews.filter(
  (row) => row.exam_event_id !== linkEvent.id,
);
await registrationModule.exports.saveAdultGradeGroups({
  eventId: linkEvent.id,
  examiners: [
    { name: "", grades: ["1 KYU"] },
    { name: "", grades: ["1 KYU"] },
    { name: "", grades: ["1 KYU"] },
  ],
});
const pendingJudges = database.exam_event_examiners.filter(
  (row) => row.exam_event_id === linkEvent.id && !row.revoked_at,
);
assert.equal(pendingJudges.length, 3);
const pendingScopes = assignmentHelpers.decodeExamAssignments(linkEvent.notes);
assert.equal(pendingScopes.pendingExaminerIds.length, 3);
assert.equal(new Set(pendingJudges.map((row) => row.id)).size, 3);
console.log("Distinct new pending examiners can share one adult target grade.");
// Three real judge rows contribute to the weighted mean; link removal is not judge removal.
const judgeScopes = {};
for (const [index, judge] of pendingJudges.entries()) {
  judge.name = `Judge ${index + 1}`;
  judge.submitted_at = "2026-11-06T11:00:00Z";
  judge.exam_events = linkEvent;
  judgeScopes[judge.id] = ["1 KYU"];
}
linkEvent.notes = assignmentHelpers.encodeExamAssignments(
  "Teacher notes",
  judgeScopes,
  { gradeGroupMode: true, pendingExaminerIds: [] },
);
database.exam_event_items.push(
  {
    id: "link-basic",
    exam_event_id: linkEvent.id,
    source: "manual",
    section: "Goho",
    name: "Ordinary",
    grade: "1 KYU",
    weight: 1,
    active: true,
    order_index: 1,
  },
  {
    id: "link-embu",
    exam_event_id: linkEvent.id,
    source: "manual",
    section: "Embu",
    name: "Kumi embu",
    grade: "1 KYU",
    weight: 3,
    active: true,
    order_index: 2,
  },
);
for (const [index, judge] of pendingJudges.entries())
  for (const [itemId, mark] of [
    ["link-basic", 2 + index * 4],
    ["link-embu", 10 - index * 4],
  ])
    database.exam_event_scores.push({
      exam_event_id: linkEvent.id,
      event_student_id: "links-student",
      event_item_id: itemId,
      examiner_id: judge.id,
      score: mark,
      skipped: false,
      notes: "Keep judge score",
    });
const beforeLinks = await registrationModule.exports.getIntegratedExamAdmin(
  linkEvent.id,
);
assert.equal(
  beforeLinks.summaries[0].percentage,
  60,
  "All three judges contribute with Embu weight three",
);
await assert.rejects(
  () => registrationModule.exports.finalizeIntegratedExamEvent(linkEvent.id),
  /Confirma una decision/,
);
await assert.rejects(
  () =>
    registrationModule.exports.saveAdultGradeGroups({
      eventId: linkEvent.id,
      examiners: pendingJudges.map((row) => ({
        id: row.id,
        name: row.name,
        grades: ["1 KYU"],
      })),
    }),
  /no pueden cambiar/,
);
const judge = pendingJudges[0];
judge.source_examiner_id = "old-alias-parent";
const originalCredential = judge.access_token;
const fixedIdentity = {
  id: judge.id,
  name: judge.name,
  submitted_at: judge.submitted_at,
  revoked_at: judge.revoked_at,
};
const keptScores = JSON.stringify(
  database.exam_event_scores.filter(
    (row) => row.exam_event_id === linkEvent.id,
  ),
);
database.exam_event_reviews.push({
  exam_event_id: linkEvent.id,
  event_student_id: "links-student",
  reviewed_at: "2026-11-06T11:05:00Z",
  review_notes: JSON.stringify({
    version: 1,
    adjustments: {},
    conclusion: "Teacher review retained",
  }),
});
const keptReview = JSON.stringify(
  database.exam_event_reviews.filter(
    (row) => row.exam_event_id === linkEvent.id,
  ),
);
const keptSettings = linkEvent.notes;
internalAccess = false;
await assert.rejects(
  () =>
    registrationModule.exports.manageAdultExaminerLink({
      eventId: linkEvent.id,
      examinerId: judge.id,
      operation: "disable",
    }),
  /Acceso interno/,
);
assert.equal(judge.access_token, originalCredential);
internalAccess = true;
await registrationModule.exports.manageAdultExaminerLink({
  eventId: linkEvent.id,
  examinerId: judge.id,
  operation: "disable",
});
assert.match(judge.access_token, /^disabled_[a-f0-9]{32}$/);
assert.equal(
  judge.source_examiner_id,
  null,
  "Old alias cannot recover the replacement credential",
);
await assert.rejects(
  () => registrationModule.exports.getExaminerExamByToken(originalCredential),
  /Enlace de examen no valido/,
);
await assert.rejects(
  () => registrationModule.exports.getExaminerExamByToken(judge.access_token),
  /Enlace de examen no valido/,
);
assert.deepEqual(
  {
    id: judge.id,
    name: judge.name,
    submitted_at: judge.submitted_at,
    revoked_at: judge.revoked_at,
  },
  fixedIdentity,
);
assert.equal(
  (await registrationModule.exports.getIntegratedExamAdmin(linkEvent.id))
    .summaries[0].percentage,
  60,
  "Disabling a credential retains the judge in the mean",
);
const disabledCredential = judge.access_token;
await registrationModule.exports.manageAdultExaminerLink({
  eventId: linkEvent.id,
  examinerId: judge.id,
  operation: "renew",
});
assert.match(judge.access_token, /^[a-f0-9]{32}$/);
assert.notEqual(judge.access_token, disabledCredential);
assert.equal(
  (await registrationModule.exports.getExaminerExamByToken(judge.access_token))
    .examiner.id,
  judge.id,
);
assert.equal(
  JSON.stringify(
    database.exam_event_scores.filter(
      (row) => row.exam_event_id === linkEvent.id,
    ),
  ),
  keptScores,
);
assert.equal(
  JSON.stringify(
    database.exam_event_reviews.filter(
      (row) => row.exam_event_id === linkEvent.id,
    ),
  ),
  keptReview,
);
assert.equal(linkEvent.notes, keptSettings);
const renewedCredential = judge.access_token;
failCredentialCas = true;
await assert.rejects(
  () =>
    registrationModule.exports.manageAdultExaminerLink({
      eventId: linkEvent.id,
      examinerId: judge.id,
      operation: "renew",
    }),
  /enlace ha cambiado/,
);
assert.equal(judge.access_token, renewedCredential);
assert.equal(
  linkEvent.status,
  "active",
  "Failed CAS releases the mutation lease",
);
await assert.rejects(
  () =>
    registrationModule.exports.manageAdultExaminerLink({
      eventId: linkEvent.id,
      examinerId: "wrong-event-judge",
      operation: "disable",
    }),
  /Examinador ajeno/,
);
linkEvent.program_type = "kids";
await assert.rejects(
  () =>
    registrationModule.exports.manageAdultExaminerLink({
      eventId: linkEvent.id,
      examinerId: judge.id,
      operation: "disable",
    }),
  /solo a exámenes adultos/,
);
linkEvent.program_type = "adults";
linkEvent.status = "completed";
await assert.rejects(
  () =>
    registrationModule.exports.manageAdultExaminerLink({
      eventId: linkEvent.id,
      examinerId: judge.id,
      operation: "renew",
    }),
  /ya esta cerrado/,
);
linkEvent.status = "active";
await assert.rejects(
  () => registrationModule.exports.finalizeIntegratedExamEvent(linkEvent.id),
  /Confirma una decision/,
);
console.log(
  "Adult examiner disable/renew preserves judge identities, grades, submissions, scores, weighted mean and teacher review gate; old credentials and aliases are invalidated.",
);

// An older open exam can store written/wrong-grade Gakka with weight 1; every runtime path must still exclude it.
const legacyGakkaEvent = {
  ...event,
  id: "legacy-gakka",
  target_grade: "2 KYU",
  program_type: "adults",
  status: "active",
  updated_at: "2026-11-06T10:00:00.000Z",
  date_confirmed: true,
  notes: assignmentHelpers.encodeExamAssignments("", {
    "gakka-judge": ["2 KYU"],
  }),
};
database.exam_events.push(legacyGakkaEvent);
database.exam_event_students.push({
  ...student,
  id: "gakka-student",
  exam_event_id: legacyGakkaEvent.id,
  target_grade: "2 KYU",
});
database.exam_event_items.push(
  ...[
    {
      id: "gakka-physical",
      name: "Tenshin geri",
      section: "PROGRAMA",
      category: "goho",
    },
    {
      id: "gakka-paper",
      name: "Ken Zen Ichi Nyo",
      section: "Gakka",
      category: "Gakka",
    },
    {
      id: "gakka-wrong-grade",
      name: "Doshin So y la fundación del Shorinji Kempo",
      section: "Gakka",
      category: "Gakka",
    },
  ].map((row) => ({
    ...item,
    ...row,
    exam_event_id: legacyGakkaEvent.id,
    grade: "2 KYU",
    active: true,
    weight: 1,
  })),
);
const legacyGakkaJudge = {
  ...examiner,
  id: "gakka-judge",
  exam_event_id: legacyGakkaEvent.id,
  exam_events: legacyGakkaEvent,
  submitted_at: null,
  access_token: "g".repeat(32),
  source_examiner_id: null,
};
database.exam_event_examiners.push(legacyGakkaJudge);
const physicalRoute = await registrationModule.exports.getExaminerExamByToken(
  legacyGakkaJudge.access_token,
);
assert.deepEqual(
  Array.from(physicalRoute.items, (row) => row.id),
  ["gakka-physical"],
  "Neither written nor other-grade Gakka can appear in the physical examiner payload",
);
assert.equal(
  database.exam_event_items.find((row) => row.id === "gakka-paper").weight,
  1,
  "Reading the canonical view never mutates existing stored items",
);
let gakkaAdmin = await registrationModule.exports.getIntegratedExamAdmin(
  legacyGakkaEvent.id,
);
assert.equal(
  gakkaAdmin.summaries[0].totalItems,
  1,
  "Admin scoring and examiner route use the same physical syllabus",
);
await registrationModule.exports.submitIntegratedExamScores({
  token: legacyGakkaJudge.access_token,
  scores: [
    {
      eventStudentId: "gakka-student",
      eventItemId: "gakka-physical",
      score: 5,
      skipped: false,
      notes: "",
    },
  ],
});
gakkaAdmin = await registrationModule.exports.getIntegratedExamAdmin(
  legacyGakkaEvent.id,
);
assert.equal(gakkaAdmin.summaries[0].percentage, 50);
assert.equal(
  gakkaAdmin.summaries[0].complete,
  true,
  "No written-answer scores are required to complete the physical route",
);
assert.deepEqual(
  Array.from(
    (
      await registrationModule.exports.getExaminerExamByToken(
        legacyGakkaJudge.access_token,
        "2 KYU",
      )
    ).items,
    (row) => row.id,
  ),
  ["gakka-physical"],
  "Normalization remains consistent after a judge submits",
);
await assert.rejects(
  () =>
    registrationModule.exports.finalizeIntegratedExamEvent(legacyGakkaEvent.id),
  /Confirma una decision/,
);
await registrationModule.exports.saveIntegratedExamStudentReview({
  eventId: legacyGakkaEvent.id,
  studentId: "gakka-student",
  adjustments: {},
  decision: "fail",
  conclusion: "Physical review; written papers handled separately",
  sourceSignature: gakkaAdmin.summaries[0].sourceSignature,
});
await registrationModule.exports.finalizeIntegratedExamEvent(
  legacyGakkaEvent.id,
);
const closedGakkaAdmin =
  await registrationModule.exports.getIntegratedExamAdmin(legacyGakkaEvent.id);
assert.equal(
  database.exam_event_items.find((row) => row.id === "gakka-paper").weight,
  0,
  "Registration freezes the canonical written separation for history and report retries",
);
assert.equal(closedGakkaAdmin.summaries[0].totalItems, 1);
assert.equal(closedGakkaAdmin.summaries[0].percentage, 50);
assert.equal(
  reviewHelpers.isReviewCurrent(
    closedGakkaAdmin.summaries[0].review,
    closedGakkaAdmin.summaries[0],
  ),
  true,
  "Closing an old exam must not resurrect the old written grading requirements",
);

database.members.push({
  id: "paper-dan-member",
  display_name: "Written learner",
  class: "adults",
  grade: "1 KYU",
  status: "active",
});
const paperExam = await registrationModule.exports.createIntegratedExamEvent({
  title: "Written DAN",
  examDate: "2026-11-12",
  programType: "adults",
  passPercentage: 70,
  memberIds: ["paper-dan-member"],
  examinerNames: [],
});
const paperEvent = database.exam_events.find(
  (row) => row.id === paperExam.eventId,
);
paperEvent.updated_at = "2026-11-06T10:00:00.000Z";
const sourceBank = adultGakka.getAdultGakkaPlan("1 DAN");
const bankKeys = sourceBank.choiceWritten.slice(0, 3).map((topic) => topic.key);
internalAccess = false;
await assert.rejects(
  () =>
    registrationModule.exports.saveAdultWrittenGakkaSelection({
      eventId: paperEvent.id,
      grade: "1 DAN",
      topicKeys: bankKeys,
    }),
  /Acceso interno/,
);
internalAccess = true;
await assert.rejects(
  () =>
    registrationModule.exports.saveAdultWrittenGakkaSelection({
      eventId: paperEvent.id,
      grade: "2 DAN",
      topicKeys: bankKeys,
    }),
  /grado no corresponde/,
);
await assert.rejects(
  () =>
    registrationModule.exports.saveAdultWrittenGakkaSelection({
      eventId: paperEvent.id,
      grade: "1 DAN",
      topicKeys: bankKeys.slice(0, 2),
    }),
  /Selecciona 3/,
);
await registrationModule.exports.saveAdultWrittenGakkaSelection({
  eventId: paperEvent.id,
  grade: "1 DAN",
  topicKeys: bankKeys,
});
let savedWritten = await registrationModule.exports.getIntegratedExamAdmin(
  paperEvent.id,
);
assert.equal(
  savedWritten.items.filter(
    (row) => row.section === "GAKKA_SELECCION" && row.active,
  ).length,
  3,
);
assert.ok(
  savedWritten.items
    .filter((row) => row.section.startsWith("GAKKA_"))
    .every((row) => row.weight === 0),
);
assert.ok(
  database.exam_event_items.every((row) => !("gakka" in row)),
  "Delivery metadata is not written into nonexistent database columns",
);
await registrationModule.exports.saveAdultWrittenGakkaSelection({
  eventId: paperEvent.id,
  grade: "1 DAN",
  topicKeys: bankKeys,
});
assert.equal(
  database.exam_event_items.filter(
    (row) =>
      row.exam_event_id === paperEvent.id && row.section === "GAKKA_SELECCION",
  ).length,
  8,
  "Saving bank selection twice never duplicates topics",
);
await registrationModule.exports.saveAdultWrittenGakkaSelection({
  eventId: paperEvent.id,
  grade: "1 DAN",
  topicKeys: [],
});
savedWritten = await registrationModule.exports.getIntegratedExamAdmin(
  paperEvent.id,
);
assert.equal(
  savedWritten.items.filter(
    (row) => row.section === "GAKKA_SELECCION" && row.active,
  ).length,
  0,
);
database.exam_event_reviews.push({
  exam_event_id: paperEvent.id,
  event_student_id: "paper-reviewed",
  review_notes: "Reviewed",
});
await assert.rejects(
  () =>
    registrationModule.exports.saveAdultWrittenGakkaSelection({
      eventId: paperEvent.id,
      grade: "1 DAN",
      topicKeys: bankKeys,
    }),
  /antes de evaluar o revisar/,
);
console.log(
  "Written Gakka: legacy open links and score matrices exclude papers/cross-grade topics; bank selection is scoped, authenticated, zero-weight, idempotent and review-locked.",
);
// Catalogue variants are the adult technical authority; Kamoku never appends grouped Juho.
const splitKatate = {
  id: "identity-katate",
  grade: "2 KYU",
  base_name: "Juji gote",
  name: "Juji gote",
  variant: "Katate",
  variant_note: "Control A",
  category: "juho",
  content_type: "PROGRAMA",
  active: true,
  active_in_planning: true,
  summary_es: "Catalogue instruction",
};
const splitRyote = {
  ...splitKatate,
  id: "identity-ryote",
  variant: "Ryote",
  variant_note: "Control B",
};
const splitTwin = {
  ...splitKatate,
  id: "identity-twin",
  active_in_planning: false,
};
const groupedCatalogue = {
  ...splitKatate,
  id: "identity-group",
  name: "Juji gote (katate & ryote)",
  variant: null,
  variant_note: null,
};
const systemKata={...splitKatate,id:"system-kata",name:"SKBC kata",variant:null,variant_note:null,category:"hokei",content_type:"KATA_SOTAI"};
database.techniques.push(splitKatate, splitRyote, splitTwin, groupedCatalogue,systemKata);
database.members.push({
  id: "identity-member",
  display_name: "Synthetic variants",
  class: "adults",
  grade: "3 KYU",
  status: "active",
});
const identityCreated =
  await registrationModule.exports.createIntegratedExamEvent({
    title: "Variant creation",
    examDate: "2099-12-15",
    programType: "adults",
    passPercentage: 70,
    memberIds: ["identity-member"],
    examinerNames: [],
  });
const identityCreatedItems = database.exam_event_items.filter(
  (row) => row.exam_event_id === identityCreated.eventId,
);
assert.equal(
  identityCreatedItems.filter((row) =>
    [splitKatate.id, splitRyote.id, splitTwin.id, groupedCatalogue.id].includes(
      row.technique_id,
    ),
  ).length,
  2,
);
assert.equal(
  identityCreatedItems.some(
    (row) => row.source === "manual" && ["Goho", "Juho"].includes(row.section),
  ),
  false,
  "Book content must not create phantom grouped technical variants",
);
assert.ok(identityCreatedItems.some(row=>row.technique_id===systemKata.id),"Exam includes the SKBC kata");
assert.equal(identityCreatedItems.some(row=>row.source==="manual" && /kata/i.test(row.section)),false,"Book must never supplement katas absent from SKBC");
assert.ok(
  identityCreatedItems
    .find((row) => row.technique_id === splitKatate.id)
    .name.includes("Katate"),
);
assert.ok(
  identityCreatedItems
    .find((row) => row.technique_id === splitRyote.id)
    .name.includes("Ryote"),
);
assert.ok(
  identityCreatedItems
    .filter((row) => row.section === "Embu")
    .every((row) => row.weight === 3),
);
// An old open snapshot with only a nonpreferred exact catalogue twin must retain its exercise.
const oldIdentityEvent = {
  id: "identity-old",
  title: "Old variant snapshot",
  program_type: "adults",
  target_grade: "2 KYU",
  pass_percentage: 70,
  status: "active",
  exam_date: "2099-12-15",
  date_confirmed: true,
  updated_at: "2026-11-06T10:00:00Z",
  notes: assignmentHelpers.encodeExamAssignments(
    "Teacher notes",
    { "identity-judge": ["2 KYU"] },
    { gradeGroupMode: true, pendingExaminerIds: [] },
  ),
};
database.exam_events.push(oldIdentityEvent);
database.exam_event_students.push({
  id: "identity-student",
  exam_event_id: oldIdentityEvent.id,
  member_id: "identity-member",
  current_grade: "3 KYU",
  target_grade: "2 KYU",
  display_order: 1,
});
const oldJudge = {
  id: "identity-judge",
  exam_event_id: oldIdentityEvent.id,
  name: "Variant judge",
  access_token: "identity-old-token",
  submitted_at: null,
  revoked_at: null,
  exam_events: oldIdentityEvent,
};
database.exam_event_examiners.push(oldJudge);
database.exam_event_items.push(
  {
    id: "identity-old-twin",
    exam_event_id: oldIdentityEvent.id,
    technique_id: splitTwin.id,
    source: "technique",
    section: "PROGRAMA",
    category: "juho",
    name: "Teacher custom checkpoint",
    summary: "Keep custom annotation",
    grade: "2 KYU",
    active: true,
    weight: 1,
    order_index: 1,
  },
  {
    id: "identity-old-group",
    exam_event_id: oldIdentityEvent.id,
    source: "manual",
    section: "Juho",
    category: "juho",
    name: "Juji gote (katate & ryote)",
    summary: "BSKF Kamoku, 2.ª edición (2024), Kyu source requirement",
    grade: "2 KYU",
    active: true,
    weight: 1,
    order_index: 2,
  },
  {
    id:"identity-old-book-kata",exam_event_id:oldIdentityEvent.id,source:"manual",
    section:"Kata tan-en",category:"Kata tan-en",name:"Legacy book-only kata",grade:"2 KYU",
    summary:"BSKF Kamoku, 2.ª edición (2024), Kyu source requirement",active:true,weight:1,order_index:3,
  },
);
let oldIdentityAdmin = await registrationModule.exports.getIntegratedExamAdmin(
  oldIdentityEvent.id,
);
assert.equal(oldIdentityAdmin.items.find(row=>row.id==="identity-old-book-kata").weight,0,"Open adult exams do not score old imported book katas");
assert.equal(database.exam_event_items.find(row=>row.id==="identity-old-book-kata").weight,1,"Read-only normalization retains stored legacy rows");
assert.equal(
  oldIdentityAdmin.items.find((row) => row.id === "identity-old-twin").weight,
  1,
);
assert.equal(
  oldIdentityAdmin.items.find((row) => row.id === "identity-old-twin").name,
  "Teacher custom checkpoint",
);
assert.equal(
  oldIdentityAdmin.items.find((row) => row.id === "identity-old-group").weight,
  0,
  "Broad grouped source overlaps split variant even with its descriptive instruction",
);
assert.equal(
  database.exam_event_items.find((row) => row.id === "identity-old-group")
    .weight,
  1,
  "GET does not persist the effective view",
);
await registrationModule.exports.completeAdultExamCurriculum(
  oldIdentityEvent.id,
);
const completedIdentity = database.exam_event_items.filter(
  (row) => row.exam_event_id === oldIdentityEvent.id,
);
assert.equal(
  completedIdentity.filter((row) =>
    [splitKatate.id, splitTwin.id].includes(row.technique_id),
  ).length,
  1,
  "Completion reuses the sole existing nonpreferred FK twin instead of adding a canonical duplicate",
);
assert.equal(
  completedIdentity.find((row) => row.id === "identity-old-twin").weight,
  1,
);
assert.equal(
  completedIdentity.find((row) => row.id === "identity-old-twin").name,
  "Teacher custom checkpoint",
);
const ryoteItem = completedIdentity.find(
  (row) => row.technique_id === splitRyote.id,
);
assert.ok(ryoteItem);
ryoteItem.active = false;
await registrationModule.exports.completeAdultExamCurriculum(
  oldIdentityEvent.id,
);
assert.equal(
  database.exam_event_items.find((row) => row.id === ryoteItem.id).active,
  false,
  "Completion cannot reactivate teacher-disabled variants",
);
// An inactive exact snapshot twin cannot suppress the active scored representative.
database.exam_event_items.push({
  ...completedIdentity.find((row) => row.id === "identity-old-twin"),
  id: "identity-inactive-twin",
  technique_id: splitKatate.id,
  active: false,
});
oldIdentityAdmin = await registrationModule.exports.getIntegratedExamAdmin(
  oldIdentityEvent.id,
);
assert.equal(
  oldIdentityAdmin.items.find((row) => row.id === "identity-old-twin").weight,
  1,
);
assert.equal(
  (
    await registrationModule.exports.getExaminerExamByToken(
      oldJudge.access_token,
    )
  ).items.some((row) => row.id === "identity-old-group"),
  false,
);
assert.equal((await registrationModule.exports.getExaminerExamByToken(oldJudge.access_token)).items.some(row=>row.id==="identity-old-book-kata"),false);
assert.ok(database.exam_event_items.some(row=>row.exam_event_id===oldIdentityEvent.id && row.technique_id===systemKata.id),"Completion adds the real SKBC kata instead");
const physicalIdentity = oldIdentityAdmin.items.filter(
  (row) => row.active !== false && row.weight > 0,
);
for (const point of physicalIdentity)
  database.exam_event_scores.push({
    exam_event_id: oldIdentityEvent.id,
    event_student_id: "identity-student",
    event_item_id: point.id,
    examiner_id: oldJudge.id,
    score: 8,
    skipped: false,
    notes: "Keep original score",
  });
oldJudge.submitted_at = "2026-11-06T11:00:00Z";
oldIdentityAdmin = await registrationModule.exports.getIntegratedExamAdmin(
  oldIdentityEvent.id,
);
const beforeIdentityFinal = oldIdentityAdmin.summaries[0];
await registrationModule.exports.saveIntegratedExamStudentReview({
  eventId: oldIdentityEvent.id,
  studentId: "identity-student",
  decision: "fail",
  conclusion: "Teacher decision after reviewing the effective syllabus",
  reviewedBy: "Teacher",
  adjustments: {},
  sourceSignature: beforeIdentityFinal.sourceSignature,
});
await registrationModule.exports.finalizeIntegratedExamEvent(
  oldIdentityEvent.id,
);
const frozenIdentity = await registrationModule.exports.getIntegratedExamAdmin(
  oldIdentityEvent.id,
);
assert.equal(oldIdentityEvent.status, "completed");
assert.equal(
  database.exam_event_items.find((row) => row.id === "identity-old-group")
    .weight,
  0,
);
assert.equal(
  database.exam_event_items.find((row) => row.id === "identity-old-twin").name,
  "Teacher custom checkpoint",
);
assert.equal(
  frozenIdentity.summaries[0].percentage,
  beforeIdentityFinal.percentage,
  "Closing freezes the effective duplicate-free score",
);
assert.equal(
  reviewHelpers.isReviewCurrent(
    frozenIdentity.summaries[0].review,
    frozenIdentity.summaries[0],
  ),
  true,
  "Closed report retries do not revive duplicates or stale the teacher review",
);
console.log(
  "Adult variant catalogue creation, open legacy overlap, lone FK twin completion, inactive choices and final frozen results passed.",
);

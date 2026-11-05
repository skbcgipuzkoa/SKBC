import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { attributeExamCall } from "../src/lib/exam-call.ts";
const attributionCalls = [];
const ordering = [];

const member = {
  id: "member",
  legacy_id: "1",
  display_name: "Test",
  class: "kids",
  grade: "VERDE",
  joined_on: "2020-01-01",
  last_exam_on: "2026-01-01",
  exam_history: null,
  attendance_history: null,
};
const exams = [];
const client = {
  from(table) {
    let operation = "read",
      values;
    const query = new Proxy(
      {},
      {
        get(_, key) {
          if (key === "then") return (resolve) => resolve(execute());
          if (key === "single" || key === "maybeSingle")
            return async () => execute();
          return (...args) => {
            if (key === "insert" || key === "update") {
              operation = key;
              values = args[0];
            }
            return query;
          };
        },
      },
    );
    function execute() {
      if (table === "members") {
        if (operation === "update") Object.assign(member, values);
        return { data: { ...member }, error: null };
      }
      if (table === "exams") {
        if (operation === "insert") exams.push({ id: "exam", ...values });
        return { data: exams[0] ?? null, error: null };
      }
      if (table === "attendance_logs")
        return {
          count: member.last_exam_on === "2026-10-31" ? 0 : 12,
          error: null,
        };
      throw new Error(`Unexpected table ${table}`);
    }
    return query;
  },
};
const compiled = ts.transpileModule(
  fs.readFileSync("src/lib/exams.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const module = { exports: {} };
vm.runInNewContext(compiled, {
  exports: module.exports,
  console,
  require: (name) =>
    name.endsWith("/supabase/admin")
      ? { createAdminClient: () => client }
      : name.endsWith("/legacy-sheet-sync")
        ? { syncLegacyExam: async () => {} }
        : name.endsWith("/member-exam-status")
          ? {
              recalculateMemberExamStatus: async () => {
                ordering.push("recalculate");
              },
            }
          : name.endsWith("/exam-cycle-attribution")
            ? {
                recordExamCycleAttribution: async (input) => {
                  ordering.push("attribution");
                  attributionCalls.push({ ...input });
                  assert.equal(member.last_exam_on, input.actualExamOn);
                },
              }
            : name.endsWith("/exam-call")
              ? { attributeExamCall }
              : name.endsWith("/exam-belt-orders")
                ? { ensureExamBeltOrder: async () => {} }
                : {},
});
const input = {
  memberId: "member",
  examDate: "2026-10-31",
  grade: "VERDE-AZUL",
  examiner: "Test",
  registeredBy: "test",
};
const first = await module.exports.registerExam(input);
const afterFirst = { ...member };
const second = await module.exports.registerExam(input);
assert.equal(exams.length, 1);
assert.equal(
  second.cycleAttendance,
  first.cycleAttendance,
  "Retries preserve official cycle attendance",
);
assert.equal(
  member.exam_history,
  afterFirst.exam_history,
  "Retries do not duplicate exam history",
);
assert.equal(
  member.attendance_history,
  afterFirst.attendance_history,
  "Retries do not duplicate attendance history",
);
assert.equal(
  attributionCalls.length,
  0,
  "Legacy callers do not invent provenance",
);
ordering.length = 0;
await module.exports.registerExam({
  ...input,
  callMonth: "2026-10",
  isRetake: false,
});
assert.deepEqual(ordering, ["attribution", "recalculate"]);
assert.equal(attributionCalls.at(-1).actualExamOn, input.examDate);
const beforeOlderRetry = attributionCalls.length;
member.grade = "1 DAN";
member.last_exam_on = "2027-06-01";
await module.exports.registerExam({
  ...input,
  callMonth: "2026-10",
  isRetake: false,
});
assert.equal(
  attributionCalls.length,
  beforeOlderRetry,
  "Older retry cannot rewrite cycle provenance",
);
assert.equal(
  member.grade,
  "1 DAN",
  "Retrying an old event cannot reverse a later promotion",
);
member.last_exam_on = "2026-01-01";
exams.length = 0;
ordering.length = 0;
await module.exports.registerExam({
  ...input,
  examDate: "2027-02-10",
  callMonth: "2026-12",
  isRetake: false,
});
assert.equal(
  member.last_exam_on,
  "2027-02-10",
  "Historical actual date is not rewritten to December",
);
assert.equal(exams[0].exam_date, "2027-02-10");
assert.equal(attributionCalls.at(-1).actualExamOn, "2027-02-10");
assert.equal(attributionCalls.at(-1).isRetake, false);
assert.deepEqual(ordering, ["attribution", "recalculate"]);
await module.exports.registerExam({
  ...input,
  examDate: "2027-02-10",
  callMonth: "2027-02",
  isRetake: true,
});
assert.equal(attributionCalls.at(-1).isRetake, true);
assert.equal(member.last_exam_on, "2027-02-10");
console.log(
  "Official exam registration retry and explicit cycle attribution checks passed.",
);

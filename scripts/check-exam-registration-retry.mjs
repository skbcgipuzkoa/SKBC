import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

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
          ? { recalculateMemberExamStatus: async () => {} }
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
member.grade = "1 DAN";
member.last_exam_on = "2027-06-01";
await module.exports.registerExam(input);
assert.equal(
  member.grade,
  "1 DAN",
  "Retrying an old event cannot reverse a later promotion",
);
console.log("Official exam registration retry checks passed.");

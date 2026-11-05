import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { loadAllPages } from "../src/lib/load-all-pages.ts";
import * as outlook from "../src/lib/exam-outlook.ts";
import { examCallMonthEnd } from "../src/lib/exam-call.ts";
let calls = [];
let fail = false;
let scheduledFixture = [];
let callFixture = [];
const evaluatedInputs = [];
const roster = Array.from({ length: 1001 }, (_, i) => ({
  id: String(i),
  display_name: "Test",
  legacy_id: null,
  class: "adults",
  status: "active",
  grade: "5 KYU",
  joined_on: null,
  last_exam_on: null,
}));
const db = {
  from(table) {
    const filters = [];
    const q = {
      select() {
        return q;
      },
      eq(k, v) {
        filters.push([k, v]);
        return q;
      },
      in(k, v) {
        filters.push([k, v]);
        return q;
      },
      lte() {
        return q;
      },
      gte(k, v) {
        filters.push([k, v]);
        return q;
      },
      order(k) {
        assert.equal(k, "id");
        return q;
      },
      range(from, to) {
        q.bounds = [from, to];
        return q;
      },
      returns() {
        calls.push({ table, filters, bounds: q.bounds });
        if (fail && table === "attendance_logs")
          return Promise.resolve({
            data: null,
            error: new Error("read failed"),
          });
        let data =
          table === "members"
            ? roster
            : table === "classes"
              ? scheduledFixture
              : table === "skbc_exam_calls" ? callFixture : [];
        const ids = filters.find(([k]) => k === "id")?.[1];
        if (ids) data = data.filter((m) => ids.includes(m.id));
        return Promise.resolve({
          data: data.slice(q.bounds[0], q.bounds[1] + 1),
          error: null,
        });
      },
    };
    return q;
  },
};
globalThis.__outlookTest = {
  createAdminClient: () => db,
  loadAllPages,
  examCallMonthEnd,
  ...outlook,
  evaluateExamOutlook: (input) => {
    evaluatedInputs.push(input);
    return outlook.evaluateExamOutlook(input);
  },
};
let source = fs.readFileSync(
  new URL("../src/lib/exam-outlook-data.ts", import.meta.url),
  "utf8",
);
source = source
  .replace(/import[^;]*from "@\/lib\/exam-call";/, "const {examCallMonthEnd}=globalThis.__outlookTest;")
  .replace(
    /import[^;]*from "@\/lib\/exam-cycle-attribution";/,
    "const loadExamCycleAttributions = async () => new Map(); const withExamCycleAttribution = (member) => member;",
  )
  .replace(
    /import[\s\S]*?from "@\/lib\/supabase\/admin";/,
    "const {createAdminClient}=globalThis.__outlookTest;",
  )
  .replace(
    /import[\s\S]*?from "@\/lib\/load-all-pages";/,
    "const {loadAllPages}=globalThis.__outlookTest;",
  )
  .replace(
    /import[\s\S]*?from "@\/lib\/exam-outlook";/,
    "const {evaluateExamOutlook,madridToday}=globalThis.__outlookTest;",
  );
const js = ts.transpileModule(source, {
  compilerOptions: {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ES2022,
  },
}).outputText;
const { loadExamOutlooks } = await import(
  "data:text/javascript;base64," + Buffer.from(js).toString("base64")
);
assert.equal((await loadExamOutlooks({ memberIds: [] })).size, 0);
assert.equal(calls.length, 0);
assert.equal(
  (
    await loadExamOutlooks({
      memberIds: ["1"],
      now: new Date("2026-11-05T12:00:00Z"),
    })
  ).size,
  1,
);
for (const name of ["attendance_logs", "member_technical_history", "courses"])
  assert.deepEqual(
    calls
      .find((c) => c.table === name)
      .filters.find(([k]) => k === "member_id")[1],
    ["1"],
  );
calls = [];
assert.equal((await loadExamOutlooks()).size, 1001);
assert.equal(calls.filter((c) => c.table === "members").length, 2);
assert.equal(calls.filter((c) => c.table === "attendance_logs").length, 11);
for (const c of calls.filter((c) =>
  ["attendance_logs", "member_technical_history", "courses"].includes(c.table),
))
  assert.ok(c.filters.find(([k]) => k === "member_id")[1].length <= 100);
scheduledFixture = [
  {
    class_date: "2026-11-05",
    class_group: "adults",
    closed: true,
    status: "completed",
  },
  {
    class_date: "2026-11-05",
    class_group: "adults",
    closed: false,
    status: "pending",
  },
  {
    class_date: "2026-11-07",
    class_group: "adults",
    closed: false,
    status: "pending",
  },
  {
    class_date: "2026-11-08",
    class_group: "adults",
    closed: false,
    status: "cancelled",
  },
  {
    class_date: "2026-11-06",
    class_group: "kids",
    closed: false,
    status: "pending",
  },
];
let before = calls.length;
await loadExamOutlooks({
  memberIds: ["1"],
  now: new Date("2026-11-05T12:00:00Z"),
});
assert.equal(
  calls.slice(before).filter((c) => c.table === "classes").length,
  1,
);
assert.equal(evaluatedInputs.at(-1).todayClassClosed, false);
assert.deepEqual(evaluatedInputs.at(-1).scheduledTrainingDates, [
  "2026-11-05",
  "2026-11-05",
  "2026-11-07",
]);
scheduledFixture = scheduledFixture.filter(
  (c) => c.class_date !== "2026-11-05" || c.closed,
);
await loadExamOutlooks({
  memberIds: ["1"],
  now: new Date("2026-11-05T12:00:00Z"),
});
assert.equal(evaluatedInputs.at(-1).todayClassClosed, true);
scheduledFixture = [];
await loadExamOutlooks({
  memberIds: ["1"],
  now: new Date("2026-11-05T12:00:00Z"),
});
assert.equal(evaluatedInputs.at(-1).todayClassClosed, undefined);
scheduledFixture = [
  {
    class_date: "2026-11-05",
    class_group: "adults",
    closed: false,
    status: "cancelled",
  },
  {
    class_date: "2026-11-10",
    class_group: "adults",
    closed: false,
    status: "cancelled",
  },
];
await loadExamOutlooks({
  memberIds: ["1"],
  now: new Date("2026-11-05T12:00:00Z"),
});
assert.deepEqual(evaluatedInputs.at(-1).cancelledTrainingDates, [
  "2026-11-05",
  "2026-11-10",
]);
scheduledFixture.push({
  class_date: "2026-11-10",
  class_group: "adults",
  closed: false,
  status: "pending",
});
await loadExamOutlooks({
  memberIds: ["1"],
  now: new Date("2026-11-05T12:00:00Z"),
});
assert.deepEqual(evaluatedInputs.at(-1).cancelledTrainingDates, ["2026-11-05"]);
assert.deepEqual(evaluatedInputs.at(-1).scheduledTrainingDates, ["2026-11-10"]);
fail = true;
await assert.rejects(
  () => loadExamOutlooks({ memberIds: ["1"] }),
  /read failed/,
);
fail = false;
callFixture = [{ id: "winter", call_date: "2026-12-05" }];
roster[1].joined_on = "2020-01-01";
roster[1].last_exam_on = "2025-12-10";
const monthly = await loadExamOutlooks({ memberIds: ["1"], now: new Date("2026-12-10T12:00:00Z") });
assert.equal(monthly.get("1").callDate, "2026-12-05", "Retain stable call key while the whole current month stays open");
assert.deepEqual(evaluatedInputs.at(-1).calls, ["2026-12-31"], "Forecast month through its final day, not an invented exam day");
assert.equal(calls.filter(x=>x.table === "skbc_exam_calls").at(-1).filters.find(([key])=>key === "call_date")[1], "2026-12-01");
await loadExamOutlooks({ memberIds: ["1"], now: new Date("2026-11-05T12:00:00Z"), examDateOverride: "2026-12-05" });
assert.deepEqual(evaluatedInputs.at(-1).calls, ["2026-12-05"], "Confirmed exact days must not inherit monthly leeway");
delete globalThis.__outlookTest;
console.log(
  "exam outlook provider: pagination, member scoping, chunking, empty roster and errors passed",
);

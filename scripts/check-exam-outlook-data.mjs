import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { loadAllPages } from "../src/lib/load-all-pages.ts";
import * as outlook from "../src/lib/exam-outlook.ts";
import { findDeferredExamCall } from "../src/lib/exam-call-deferral.ts";
import { examCallMonthEnd } from "../src/lib/exam-call.ts";
let calls = [];
let fail = false;
let scheduledFixture = [];
let callFixture = [];
let deferredFixture = [];
let requirementFixture = [];
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
      is(k, v) {
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
              : table === "skbc_exam_calls"
                ? callFixture
                : table === "exam_invitations"
                  ? deferredFixture
                  : table === "skbc_exam_requirements"
                    ? requirementFixture
                    : [];
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
  findDeferredExamCall,
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
  .replace(
    /import[^;]*from "@\/lib\/exam-call-deferral";/,
    "const {findDeferredExamCall}=globalThis.__outlookTest;",
  )
  .replace(
    /import[^;]*from "@\/lib\/exam-call";/,
    "const {examCallMonthEnd}=globalThis.__outlookTest;",
  )
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
for (const name of [
  "attendance_logs",
  "member_technical_history",
  "courses",
  "exam_invitations",
])
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
const monthly = await loadExamOutlooks({
  memberIds: ["1"],
  now: new Date("2026-12-10T12:00:00Z"),
});
assert.equal(
  monthly.get("1").callDate,
  "2026-12-05",
  "Retain stable call key while the whole current month stays open",
);
assert.deepEqual(
  evaluatedInputs.at(-1).calls,
  ["2026-12-31"],
  "Forecast month through its final day, not an invented exam day",
);
assert.equal(
  calls
    .filter((x) => x.table === "skbc_exam_calls")
    .at(-1)
    .filters.find(([key]) => key === "call_date")[1],
  "2026-12-01",
);
await loadExamOutlooks({
  memberIds: ["1"],
  now: new Date("2026-11-05T12:00:00Z"),
  examDateOverride: "2026-12-05",
});
assert.deepEqual(
  evaluatedInputs.at(-1).calls,
  ["2026-12-05"],
  "Confirmed exact days must not inherit monthly leeway",
);

requirementFixture = [
  {
    member_class: "adults",
    grade_pattern: "* KYU",
    min_months: 12,
    attendance_ratio: 0,
    adult_required_repetitions: 2,
    technical_blocks_exam: false,
  },
];
const deferred = {
  member_id: "1",
  call_key: "2026-12-05",
  response: "deferred",
  revoked_at: null,
  responded_at: "2026-11-05T15:00:00Z",
  snapshot: {
    currentGrade: "5 KYU",
    targetGrade: "4 KYU",
    memberClass: "adults",
  },
};
deferredFixture = [deferred];
callFixture = [
  { id: "winter", call_date: "2026-12-05" },
  { id: "summer", call_date: "2027-06-05" },
  { id: "nextwinter", call_date: "2027-12-05" },
];
const deferredNow = new Date("2026-11-05T12:00:00Z");
let deferredOutlook = (
  await loadExamOutlooks({ memberIds: ["1"], now: deferredNow })
).get("1");
assert.equal(deferredOutlook.deferredFromCall, "2026-12-05");
assert.equal(deferredOutlook.callDate, "2027-06-05");
assert.match(
  deferredOutlook.planningReasons.join(" "),
  /Aplazado desde 2026-12/,
);
assert.equal(deferredOutlook.feasibility !== "impossible", true);
assert.equal(deferredOutlook.preparationCandidate, true);
assert.equal(
  (
    await loadExamOutlooks({
      memberIds: ["1"],
      now: deferredNow,
      examDateOverride: "2026-12-15",
    })
  ).get("1").callDate,
  null,
  "Manual old-call day cannot bypass deferral",
);
assert.equal(
  (
    await loadExamOutlooks({
      memberIds: ["1"],
      now: deferredNow,
      examDateOverride: "2027-06-15",
    })
  ).get("1").callDate,
  "2027-06-15",
);

const originalCycle = roster[1].last_exam_on;
roster[1].last_exam_on = "2026-10-01";
assert.equal(
  (await loadExamOutlooks({ memberIds: ["1"], now: deferredNow })).get("1")
    .callDate,
  "2027-12-05",
  "Deferral still honours minimum-time eligibility when June is too soon",
);
roster[1].last_exam_on = originalCycle;
deferredFixture.push({
  ...deferred,
  call_key: "2027-06-05",
  responded_at: "2026-11-05T16:00:00Z",
});
assert.equal(
  (await loadExamOutlooks({ memberIds: ["1"], now: deferredNow })).get("1")
    .callDate,
  "2027-12-05",
);

const longDeferred = (
  await loadExamOutlooks({ memberIds: ["1"], now: deferredNow })
).get("1");
assert.equal(longDeferred.callDate, "2027-12-05");
assert.equal(longDeferred.deferredFromCall, "2027-06-05");
assert.ok(
  evaluatedInputs.at(-1).horizonDays > 365,
  "An explicit June deferral extends only to the configured December follow-up",
);
assert.equal(
  longDeferred.uncertainty.some((text) => text.includes("fuera del horizonte")),
  false,
);
const savedDeferrals = deferredFixture;
deferredFixture = [];
const savedCalls = callFixture;
callFixture = [{ id: "farwinter", call_date: "2027-12-05" }];
const ordinaryFar = (
  await loadExamOutlooks({ memberIds: ["1"], now: deferredNow })
).get("1");
assert.equal(
  evaluatedInputs.at(-1).horizonDays,
  undefined,
  "Ordinary forecasts retain their default horizon",
);
assert.equal(
  ordinaryFar.uncertainty.some((text) => text.includes("fuera del horizonte")),
  true,
);
deferredFixture = savedDeferrals;
callFixture = savedCalls;
callFixture = [{ id: "winter", call_date: "2026-12-05" }];
let noNext = (
  await loadExamOutlooks({ memberIds: ["1"], now: deferredNow })
).get("1");
assert.equal(noNext.callDate, null);
assert.equal(noNext.candidate, false);
assert.match(noNext.uncertainty.join(" "), /posterior al aplazamiento/);
const current = roster[1];
assert.equal(
  findDeferredExamCall({ ...current, last_exam_on: "2026-11-05" }, "4 KYU", [
    deferred,
  ]),
  "2026-12-05",
  "Same-day response belongs to matching current grade/cycle",
);
assert.equal(
  findDeferredExamCall({ ...current, last_exam_on: "2026-11-06" }, "4 KYU", [
    deferred,
  ]),
  null,
);
assert.equal(
  findDeferredExamCall({ ...current, grade: "4 KYU" }, "3 KYU", [deferred]),
  null,
);
assert.equal(
  findDeferredExamCall(current, "4 KYU", [
    { ...deferred, revoked_at: "2026-11-05" },
  ]),
  null,
);
assert.equal(
  findDeferredExamCall(current, "4 KYU", [
    { ...deferred, response: "accepted" },
  ]),
  null,
);
assert.equal(
  findDeferredExamCall(current, "4 KYU", [{ ...deferred, member_id: "other" }]),
  null,
);

assert.equal(
  findDeferredExamCall({ ...current, last_exam_on: "2026-11-05" }, "4 KYU", [
    { ...deferred, responded_at: "2026-11-04T23:30:00Z" },
  ]),
  "2026-12-05",
  "Madrid same-day response across UTC midnight remains current cycle",
);
deferredFixture = [];
delete globalThis.__outlookTest;
console.log(
  "exam outlook provider: pagination, member scoping, chunking, empty roster and errors passed",
);

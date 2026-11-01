import assert from "node:assert/strict";
import {
  summarizePeriod,
  attendanceLeaders,
} from "../src/lib/telegram-period-stats.ts";
const members = Array.from({ length: 23 }, (_, i) => ({
  id: String(i),
  display_name: `P${i}`,
  class: "adults",
  status: i ? "active" : "inactive",
  legacy_id: null,
}));
const classes = [
  { id: "a", class_date: "2026-10-01", class_group: "adults" },
  { id: "k", class_date: "2026-10-01", class_group: "kids" },
];
const attendance = members.map((m) => ({
  member_id: m.id,
  class_id: "a",
  attended_on: "2026-10-01",
  members: m,
}));
const techniques = members.map((m) => ({
  member_id: m.id,
  class_id: "a",
  class_date: "2026-10-01",
  technique_id: "t",
  technique_name: "Technique",
  members: m,
}));
const stats = summarizePeriod(
  classes,
  [...attendance, attendance[0]],
  techniques,
  members.filter((m) => m.status === "active"),
);
assert.equal(stats.totalAttendance, 23);
assert.equal(stats.classes, 1);
assert.equal(stats.adultClasses, 1);
assert.equal(stats.kidsClasses, 1);
assert.equal(stats.techniques, 1);
assert.equal(stats.topTechniques[0].count, 1);
assert.equal(stats.topTechnicalMembers[0].count, 1);
assert.equal(stats.historicalNonCurrentAttendees, 1);
assert.equal(stats.fullAttendanceAdults, 23);
assert.equal(
  attendanceLeaders(attendance, 10).flatMap((g) => g.names).length,
  23,
);
assert.equal(summarizePeriod([], [], [], []).classes, 0);
const legacy = summarizePeriod(
  [],
  attendance.map((r) => ({ ...r, class_id: null })),
  techniques.map((r) => ({ ...r, class_id: null })),
  [],
);
assert.equal(legacy.adultClasses, 1);
assert.equal(legacy.techniques, 1);
assert.equal(
  summarizePeriod(
    classes,
    attendance,
    [
      ...techniques,
      { ...techniques[0], counts_for_stats: false, technique_id: "excluded" },
      {
        ...techniques[0],
        members: { ...members[0], class: "kids" },
        technique_id: "kid",
        class_id: "k",
      },
    ],
    [],
  ).techniques,
  1,
);
assert.equal(
  summarizePeriod(
    [...classes, { id: "a2", class_date: "2026-10-01", class_group: "adults" }],
    [],
    [],
    [],
  ).adultClasses,
  2,
);
const historical = summarizePeriod(
  classes,
  attendance.map((r) => ({ ...r, members: { ...r.members, class: "kids" } })),
  techniques,
  [],
);
assert.equal(historical.adultAttendance, 23);
assert.equal(historical.kidsAttendance, 0);
const sameNames = summarizePeriod(
  classes,
  [],
  techniques
    .slice(0, 2)
    .map((r) => ({ ...r, members: { ...r.members, display_name: "Same" } })),
  [],
);
assert.equal(sameNames.topTechnicalMembers.length, 2);
const mixedLegacy = summarizePeriod(
  classes,
  [...attendance, { ...attendance[0], class_id: null }],
  [],
  [],
);
assert.equal(mixedLegacy.totalAttendance, 23);
assert.equal(mixedLegacy.topAdultAttendance.flatMap((g) => g.names).length, 23);
console.log("Telegram period statistics checks passed");
// Exercise the real message builder with a read-only in-memory database.
const { readFileSync } = await import("node:fs");
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);
const ts = require("typescript");
const { runInNewContext } = await import("node:vm");
const { loadAllPages } = await import("../src/lib/load-all-pages.ts");
const source = readFileSync(
  new URL("../src/lib/telegram-notifications.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
let failTable = null;
const pageRequests = [];
const fixtures = {
  classes: classes.map((c) => ({ ...c, name: c.id, closed: true })),
  attendance_logs: [...attendance, attendance[0]],
  member_technical_history: techniques,
  exams: [],
  courses: [],
  members: members.map((m) => ({
    ...m,
    grade: "MINARAI",
    joined_on: "2026-10-01",
  })),
};
function createAdminClient() {
  return {
    from(table) {
      const filters = [];
      let from = 0,
        to = 999;
      const query = {
        select() {
          return query;
        },
        eq(k, v) {
          filters.push([k, v]);
          return query;
        },
        gte(k, v) {
          filters.push([k, v, "gte"]);
          return query;
        },
        lte(k, v) {
          filters.push([k, v, "lte"]);
          return query;
        },
        order() {
          return query;
        },
        range(a, b) {
          from = a;
          to = b;
          pageRequests.push({ table, from, to });
          return query;
        },
        returns() {
          return query;
        },
        then(resolve, reject) {
          if (table === failTable)
            return Promise.resolve({
              data: null,
              error: new Error("database unavailable"),
            }).then(resolve, reject);
          const rows = (fixtures[table] ?? []).filter((row) =>
            filters.every(([k, v, op]) => {
              if (k === "completed") return true;
              return op === "gte"
                ? row[k] >= v
                : op === "lte"
                  ? row[k] <= v
                  : row[k] === v;
            }),
          );
          return Promise.resolve({
            data: rows.slice(from, to + 1),
            error: null,
          }).then(resolve, reject);
        },
      };
      return query;
    },
  };
}
const module = { exports: {} };
runInNewContext(compiled, {
  module,
  exports: module.exports,
  process: { env: {} },
  console,
  Date,
  Map,
  Set,
  require(name) {
    if (name === "@/lib/supabase/admin") return { createAdminClient };
    if (name === "@/lib/load-all-pages") return { loadAllPages };
    if (name === "@/lib/telegram-period-stats") return { summarizePeriod };
    if (name === "@/lib/family-units") return {};
    throw new Error("Unexpected dependency " + name);
  },
});
for (const type of ["monthly_stats", "semester_stats", "yearly_stats"]) {
  const message = await module.exports.buildNotificationMessage(type, {
    start: type === "yearly_stats" ? "2026-01-01" : "2026-10-01",
    end: type === "yearly_stats" ? "2026-12-31" : "2026-10-31",
  });
  assert.match(message, /Participaciones acumuladas: <b>23<\/b>/);
  assert.match(message, /Técnicas impartidas sumadas por clase: <b>1<\/b>/);
  assert.match(
    message,
    /Sesiones adultos: <b>1<\/b> · sesiones niños: <b>1<\/b>/,
  );
  assert.match(message, /Con 1 asistencias:/);
  assert.match(message, /• P22/);
  assert.doesNotMatch(message, /Top asistencia|23 pts/);
  if (type === "yearly_stats")
    assert.match(message, /Fechas distintas con clase del club: <b>1<\/b>/);
}
for (const table of Object.keys(fixtures))
  assert.ok(
    pageRequests.some((p) => p.table === table),
    "Missing pagination for " + table,
  );
for (const table of Object.keys(fixtures)) {
  failTable = table;
  await assert.rejects(
    () =>
      module.exports.buildNotificationMessage("monthly_stats", {
        start: "2026-10-01",
        end: "2026-10-31",
      }),
    /database unavailable/,
  );
}
failTable = null;
// Verify pagination across Supabase's default limit, then prior-year parity.
fixtures.attendance_logs = Array.from({ length: 1001 }, (_, i) => ({
  ...attendance[0],
  member_id: "bulk" + i,
}));
const large = await module.exports.buildNotificationMessage("yearly_stats", {
  start: "2026-01-01",
  end: "2026-12-31",
});
assert.match(large, /Participaciones acumuladas: <b>1001<\/b>/);
assert.ok(
  pageRequests.some((p) => p.table === "attendance_logs" && p.from === 1000),
);
fixtures.classes.push(
  ...classes.map((c) => ({
    ...c,
    id: "prior" + c.id,
    class_date: "2025-10-01",
    name: "Previous",
  })),
);
fixtures.attendance_logs = attendance.map((r) => ({
  ...r,
  attended_on: "2025-10-01",
  class_id: "priora",
}));
const annual = await module.exports.buildNotificationMessage("yearly_stats", {
  start: "2026-01-01",
  end: "2026-12-31",
});
assert.match(
  annual,
  /Dias de clase del club: <b>1<\/b> \(igual que el año anterior\)/,
);
assert.match(
  annual,
  /Asistencias totales: <b>0<\/b> \(23 menos que el año anterior\)/,
);
console.log(
  "Telegram builder, pagination, annual comparison and error checks passed",
);

// An absent annual baseline is unavailable, not an observed year of zero activity.
fixtures.classes = classes.map((c) => ({ ...c, name: c.id, closed: true }));
fixtures.attendance_logs = attendance;
const noBaseline = await module.exports.buildNotificationMessage(
  "yearly_stats",
  { start: "2026-01-01", end: "2026-12-31" },
);
assert.match(noBaseline, /sin registros del año anterior; no comparable/);
assert.doesNotMatch(noBaseline, /Asistencias totales: <b>23<\/b> \(23 mas/);
assert.match(noBaseline, /Periodo en curso; datos registrados a/);
const overlap = summarizePeriod(
  classes,
  [
    attendance[0],
    {
      ...attendance[0],
      class_id: "k",
      members: { ...members[0], class: "kids" },
    },
  ],
  [],
  [],
);
assert.equal(overlap.uniqueAttendees, 1);
assert.equal(overlap.overlappingGroupAttendees, 1);
fixtures.attendance_logs = [
  attendance[0],
  {
    ...attendance[0],
    class_id: "k",
    members: { ...members[0], class: "kids" },
  },
];
const overlapMessage = await module.exports.buildNotificationMessage(
  "monthly_stats",
  { start: "2026-10-01", end: "2026-10-31" },
);
assert.match(overlapMessage, /Personas registradas en ambos grupos: <b>1<\/b>/);
assert.match(overlapMessage, /Los subtotales por grupo no se suman/);
console.log("Missing baseline and overlapping attendee checks passed");

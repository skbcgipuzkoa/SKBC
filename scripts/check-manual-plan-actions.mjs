import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
function fixture(overrides = {}) {
  const tables = {
    classes: [{ id: "c", closed: false, status: "open", class_group: "adults" }],
    techniques: [{ id: "t1", active: true }, { id: "t2", active: true }],
    class_technical_groups: [{ id: "g1", grade: "5 KYU", active: true }, { id: "g2", grade: "4 KYU", active: true }],
    technical_plans: [{ id: "r1", proposal_type: null }, { id: "r2", proposal_type: "NORMAL" }, { id: "m", proposal_type: "COMUN MANUAL", technique_id: "t1", technical_group_id: "g1", completed: true }],
    ...overrides
  };
  for (const rows of Object.values(tables)) {
    if (Array.isArray(rows)) for (const row of rows) row.class_id ??= "c";
  }
  const writes = [];
  const db = { from(table) {
    let filters = [], operation = "read", payload, single = false, columns;
    const q = {
      select(value) { columns = value; return q; }, order() { return q; }, limit() { return q; }, returns() { return q; },
      eq(key, value) { filters.push(row => row[key] === value); return q; },
      in(key, values) { filters.push(row => values.includes(row[key])); return q; },
      single() { single = true; return q; },
      insert(value) { operation = "insert"; payload = value; return q; },
      update(value) { operation = "update"; payload = value; return q; },
      then(resolve) {
        const rows = tables[table].filter(row => filters.every(filter => filter(row)));
        if (operation !== "read") writes.push({ operation, payload, ids: rows.map(row => row.id) });
        return Promise.resolve({ data: single ? rows[0] : rows, error: (overrides.failMaxPlan && columns === "suggested_order") ? new Error("maxPlan failure") : overrides.queryError ?? null }).then(resolve);
      }
    };
    return q;
  } };
  return { db, writes };
}
async function run(name, fixture, fields = {}) {
  const start = source.indexOf(`export async function ${name}(`);
  const end = source.indexOf("\nexport async function ", start + 1);
  const js = ts.transpileModule(source.slice(start, end).replace("export async", "async"), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const dependencies = {
    hasInternalAccess: async () => true, createAdminClient: () => fixture.db,
    redirect: path => { throw { redirect: path }; }, revalidatePath: () => {},
    safeReturnPath: path => path.startsWith("/") && !path.startsWith("//") ? path : "",
    normalizeActionGrade: value => String(value).trim().toUpperCase(), resolveActionTargetGrade: value => value,
    normalizeTechniqueCategoryInput: value => value, errorMessage: String,
    closeAdultClass: async () => {}, recalculateClassExamStatus: async () => {}
  };
  const action = new Function(...Object.keys(dependencies), `${js};return ${name};`)(...Object.values(dependencies));
  const form = new FormData();
  for (const [key, value] of Object.entries({ classId: "c", legacyId: "C", ...fields })) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  }
  const originalError = console.error;
  console.error = () => {};
  try { await action(form); assert.fail("Expected redirect"); } catch (error) { assert.ok(error.redirect); return error.redirect; }
  finally { console.error = originalError; }
}
const add = "addManualClassTechniqueAction", save = "updateClassPlanTechniquesAction";
let f = fixture();
await run(add, f, { techniqueIds: ["t1", "t2", "t2"] });
assert.equal(f.writes.length, 1);
assert.equal(f.writes[0].payload.length, 3);
assert.ok(f.writes[0].payload.every(row => row.completed));
for (const fields of [{ techniqueIds: ["t1", "missing"] }, { techniqueIds: ["t1"], grades: ["foreign"] }, { techniqueIds: Array.from({ length: 51 }, (_, i) => `t${i}`) }]) {
  f = fixture(); assert.match(await run(add, f, fields), /error=manual-technique/); assert.equal(f.writes.length, 0);
}
for (const overrides of [{ techniques: [{ id: "t1", active: false }] }, { classes: [{ id: "c", closed: true, status: "closed", class_group: "adults" }] }, { queryError: new Error("read failure") }, { failMaxPlan: true }]) {
  f = fixture(overrides); await run(add, f, { techniqueIds: ["t1"] }); assert.equal(f.writes.length, 0);
}
f = fixture(); await run(add, f, { techniqueId: "t2" }); assert.equal(f.writes[0].payload.length, 2);
f = fixture(); await run(save, f, { planIds: ["r1"] }); assert.deepEqual(f.writes[0].ids, ["r1"]); assert.deepEqual(f.writes[1].ids, ["r2"]);
f = fixture(); await run(save, f); assert.deepEqual(f.writes[0].ids, ["r1", "r2"]); assert.equal(f.writes.length, 1);
for (const id of ["foreign", "m"]) {
  f = fixture(); const location = await run(save, f, { planIds: [id], returnTo: "/clases/C?saved=techniques&step=tecnicas#plan" });
  assert.equal(f.writes.length, 0); assert.match(location, /error=plan-technique/); assert.doesNotMatch(location, /saved=/);
}
f = fixture({ technical_plans: [{ id: "foreign", class_id: "other", proposal_type: null }] });
await run(save, f, { planIds: ["foreign"] }); assert.equal(f.writes.length, 0);
console.log("Manual plan action checks passed.");


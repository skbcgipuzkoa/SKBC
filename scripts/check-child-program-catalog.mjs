import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  buildChildExamSnapshot,
  childExamTargetGradesWithoutScorableItems,
  defaultChildExamItemIds,
  normalizeChildGrade,
  normalizeSelectedGrades,
  orderChildExamAssignments,
  resolveChildExamGrades
} from "../src/lib/child-program.ts";

assert.equal(normalizeChildGrade("  azul y marrón  "), "AZUL-MARRON");
assert.equal(normalizeChildGrade("amarillo   naranja"), "AMARILLO-NARANJA");
assert.equal(normalizeChildGrade("1º dan"), "1 DAN");

assert.deepEqual(
  normalizeSelectedGrades([" BLANCO ", "blanco", "azul y marrón", "AZUL-MARRON"]),
  ["BLANCO", "AZUL-MARRON"]
);

assert.deepEqual(
  resolveChildExamGrades([" blanco y amarillo ", "NARANJA"]),
  ["BLANCO", "BLANCO-AMARILLO", "AMARILLO", "AMARILLO-NARANJA", "NARANJA"]
);

const assignments = [
  { id: "yellow-inactive", contentId: "c5", grade: "AMARILLO", title: "Ignored inactive", category: "otro", description: null, active: false, examRelevant: true, sortOrder: 0 },
  { id: "yellow-1", contentId: "c4", grade: " amarillo ", title: "Zeta", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 1 },
  { id: "white-2", contentId: "c2", grade: "BLANCO", title: "Beta", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 2 },
  { id: "white-1", contentId: "c1", grade: " blanco ", title: "Álgebra", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 1 },
  { id: "yellow-practice", contentId: "c6", grade: "AMARILLO", title: "Ignored practice", category: "otro", description: null, active: true, examRelevant: false, sortOrder: 0 },
  { id: "white-title", contentId: "c3", grade: "BLANCO", title: "Abaco", category: "otro", description: null, active: true, examRelevant: true, sortOrder: 1 }
];

assert.deepEqual(
  orderChildExamAssignments(assignments).map((item) => item.id),
  ["white-title", "white-1", "white-2", "yellow-inactive", "yellow-practice", "yellow-1"]
);
assert.deepEqual(
  defaultChildExamItemIds(assignments, [" amarillo "]),
  ["white-title", "white-1", "white-2", "yellow-1"]
);

const selectedAssignments = [
  assignments.find((item) => item.id === "white-2"),
  assignments.find((item) => item.id === "white-1"),
  assignments.find((item) => item.id === "yellow-1")
];
const snapshot = buildChildExamSnapshot(selectedAssignments);
assert.deepEqual(snapshot.map((row) => row.source), ["child_syllabus", "child_syllabus", "cut", "child_syllabus", "cut"]);
assert.deepEqual(snapshot.filter((row) => row.source === "child_syllabus").map((row) => row.childSyllabusItemId), ["white-2", "white-1", "yellow-1"]);
assert.deepEqual(snapshot.filter((row) => row.source === "cut").map((row) => row.cutGrade), ["BLANCO", "AMARILLO"]);

const targetDrivenSnapshot = buildChildExamSnapshot(
  [assignments.find((item) => item.id === "white-2"), assignments.find((item) => item.id === "yellow-1")],
  ["BLANCO-AMARILLO", "AMARILLO-NARANJA", "BLANCO-AMARILLO"]
);
assert.deepEqual(
  targetDrivenSnapshot.map((row) => row.source === "cut" ? `cut:${row.cutGrade}` : row.childSyllabusItemId),
  ["white-2", "cut:BLANCO-AMARILLO", "yellow-1", "cut:AMARILLO-NARANJA"]
);
assert.deepEqual(
  childExamTargetGradesWithoutScorableItems(
    [assignments.find((item) => item.id === "yellow-1")],
    ["BLANCO-AMARILLO", "AMARILLO-NARANJA"]
  ),
  ["BLANCO-AMARILLO"]
);
assert.deepEqual(
  childExamTargetGradesWithoutScorableItems(
    [assignments.find((item) => item.id === "white-2"), assignments.find((item) => item.id === "yellow-practice")],
    ["BLANCO-AMARILLO", "AMARILLO-NARANJA"]
  ),
  []
);

const pureSource = readFileSync(new URL("../src/lib/child-program.ts", import.meta.url), "utf8");
const serverSource = readFileSync(new URL("../src/lib/child-program.server.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
const pageUrl = new URL("../src/app/programa-infantil/page.tsx", import.meta.url);
const editorUrl = new URL("../src/app/programa-infantil/ChildProgramEditor.tsx", import.meta.url);
const sidebarSource = readFileSync(new URL("../src/app/components/SidebarNav.tsx", import.meta.url), "utf8");
const globalStylesSource = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const atomicMigrationUrl = new URL("../supabase/migrations/20261030171000_child_program_atomic_mutations.sql", import.meta.url);
const atomicWritesMigrationUrl = new URL("../supabase/migrations/20261030172000_child_program_atomic_writes.sql", import.meta.url);

assert.equal(existsSync(atomicMigrationUrl), true, "atomic child-program mutation migration must exist");
const atomicMigrationSource = readFileSync(atomicMigrationUrl, "utf8");
assert.equal(existsSync(atomicWritesMigrationUrl), true, "atomic child-program write migration must exist");
const atomicWritesMigrationSource = readFileSync(atomicWritesMigrationUrl, "utf8");

assert.doesNotMatch(pureSource, /createAdminClient|server-only/);
assert.match(serverSource, /^import "server-only";/);
assert.match(serverSource, /\.order\("title", \{ ascending: true \}\)\s*\.order\("id", \{ ascending: true \}\)/);
assert.ok((serverSource.match(/if \(error\) throw error;/g)?.length ?? 0) >= 3);

for (const action of [
  "createChildProgramContentFormAction",
  "updateChildProgramContentFormAction",
  "moveChildProgramAssignmentAction",
  "archiveChildProgramContentAction",
  "restoreChildProgramContentAction",
  "deleteUnusedChildProgramContentAction"
]) {
  assert.match(actionsSource, new RegExp(`export async function ${action}`));
}
assert.doesNotMatch(actionsSource, /export async function (?:create|update)ChildProgramContentAction/);

assert.match(actionsSource, /parseChildProgramContentForm/);
assert.match(actionsSource, /normalizeChildGrade/);
assert.match(actionsSource, /childProgramReturnUrl\(formData, "error", "content-in-use"\)/);
assert.match(actionsSource, /childProgramReturnUrl\(formData, "saved", "child-program-restored"\)/);
assert.doesNotMatch(actionsSource, /child-program-restored-inactive/);
assert.doesNotMatch(actionsSource, /await childProgramContentUsage\(contentId\)/);
for (const path of ["/programa-infantil", "/areas-tecnicas", "/examenes", "/dojo", "/clases", "/delegado", "/ficha", "/kenshis"]) {
  assert.match(actionsSource, new RegExp(`\\"${path.replaceAll("/", "\\/")}\\"`));
}
assert.match(actionsSource, /revalidatePath\(path, "layout"\)/);
assert.match(serverSource, /\.rpc\("delete_unused_child_syllabus_content"/);
for (const rpc of [
  "save_child_program_content",
  "move_child_program_assignment",
  "archive_child_syllabus_content",
  "restore_child_syllabus_content"
]) {
  assert.match(serverSource, new RegExp(`\\.rpc\\(\\"${rpc}\\"`));
}
assert.doesNotMatch(serverSource, /upsert\(reordered/);
assert.doesNotMatch(serverSource, /insertedIds|createdContent|catch \(error\) \{[\s\S]*upsert\(existing/);
assert.doesNotMatch(serverSource, /\.rpc\("remove_child_syllabus_assignment_if_unused"/);

assert.equal(existsSync(pageUrl), true, "dedicated child-program admin page must exist");
assert.equal(existsSync(editorUrl), true, "multi-grade child-program editor must exist");
const pageSource = readFileSync(pageUrl, "utf8");
const editorSource = readFileSync(editorUrl, "utf8");
assert.match(pageSource, /hasInternalAccess\(\)/);
assert.match(pageSource, /redirect\("\/skbc-interno"\)/);
assert.match(pageSource, /getChildProgramCatalog\(\)/);
assert.match(pageSource, /childProgramContentUsage/);
for (const view of ["Temario por grados", "Catalogo general", "Archivados"]) {
  assert.match(pageSource, new RegExp(view));
}
for (const action of [
  "moveChildProgramAssignmentAction",
  "archiveChildProgramContentAction",
  "restoreChildProgramContentAction",
  "deleteUnusedChildProgramContentAction"
]) {
  assert.match(pageSource, new RegExp(action));
}
assert.match(pageSource, /content-in-use/);
assert.match(pageSource, /histori/);
assert.match(pageSource, /<MoveButton[^>]+category=\{category\}/);
assert.match(pageSource, /name="category" value=\{category\}/);
assert.match(pageSource, /function normalizeProgramCategory/);
assert.match(pageSource, /const category = normalizeProgramCategory\(row\.content\.category\);[\s\S]*result\.get\(category\)/);
assert.ok((pageSource.match(/name="returnView"/g)?.length ?? 0) >= 5);
assert.ok((pageSource.match(/name="returnGrade"/g)?.length ?? 0) >= 2);
assert.match(editorSource, /^\"use client\";/);
assert.match(editorSource, /useActionState/);
assert.match(editorSource, /createChildProgramContentFormAction/);
assert.match(editorSource, /updateChildProgramContentFormAction/);
assert.match(editorSource, /state\.values/);
assert.match(editorSource, /state\.fieldErrors/);
assert.match(editorSource, /state\.globalError/);
assert.match(editorSource, /parseAssignmentState/);
assert.match(editorSource, /name="assignments"/);
assert.match(editorSource, /JSON\.stringify/);
for (const field of ["active", "examRelevant", "sortOrder"]) {
  assert.match(editorSource, new RegExp(field));
}
assert.match(editorSource, /CHILD_PROGRAM_GRADES/);
assert.match(sidebarSource, /Programa infantil/);
assert.match(sidebarSource, /\/programa-infantil/);
for (const breakpoint of ["820px", "768px", "390px"]) {
  assert.match(globalStylesSource, new RegExp(`max-width: ${breakpoint}`));
}
assert.match(globalStylesSource, /\.child-program-/);
assert.doesNotMatch(globalStylesSource, /\.child-program-table thead\s*\{\s*display:\s*none/);
assert.match(globalStylesSource, /\.child-program-table thead\s*\{[^}]*clip:/);

for (const definition of [
  /create or replace function public\.remove_child_syllabus_assignment_if_unused/,
  /create or replace function public\.delete_unused_child_syllabus_content/
]) {
  assert.match(atomicMigrationSource, definition);
}
assert.ok((atomicMigrationSource.match(/for update/g) ?? []).length >= 2);
for (const usagePath of ["child_syllabus_history", "child_class_plans", "exam_event_items"]) {
  assert.match(atomicMigrationSource, new RegExp(`public\\.${usagePath}`));
}
assert.match(atomicMigrationSource, /CHILD_PROGRAM_ASSIGNMENT_IN_USE/);
assert.match(atomicMigrationSource, /CHILD_PROGRAM_CONTENT_IN_USE/);
assert.match(atomicMigrationSource, /lock table public\.child_class_plans in share row exclusive mode/);
assert.ok(
  atomicMigrationSource.indexOf("CHILD_PROGRAM_ASSIGNMENT_IN_USE") <
    atomicMigrationSource.indexOf("delete from public.child_syllabus_items")
);
assert.ok(
  atomicMigrationSource.indexOf("CHILD_PROGRAM_CONTENT_IN_USE") <
    atomicMigrationSource.lastIndexOf("delete from public.child_syllabus_contents")
);
assert.doesNotMatch(atomicMigrationSource, /(?:delete from|update) public\.(?:child_syllabus_history|child_class_plans|exam_event_items)/);
assert.match(atomicMigrationSource, /revoke execute on function[\s\S]+from public/);
assert.match(atomicMigrationSource, /grant execute on function[\s\S]+to service_role/);

assert.match(atomicWritesMigrationSource, /add column if not exists active_before_archive boolean/);
assert.match(atomicWritesMigrationSource, /create or replace function public\.normalize_child_program_grade/);
assert.match(atomicWritesMigrationSource, /child_syllabus_items_content_normalized_grade_unique/);
assert.ok((atomicWritesMigrationSource.match(/public\.normalize_child_program_grade\(/g) ?? []).length >= 6);
for (const definition of [
  "save_child_program_content",
  "move_child_program_assignment",
  "archive_child_syllabus_content",
  "restore_child_syllabus_content"
]) {
  assert.match(atomicWritesMigrationSource, new RegExp(`create or replace function public\\.${definition}`));
}
assert.match(atomicWritesMigrationSource, /jsonb_array_elements\(p_assignments\)/);
assert.match(atomicWritesMigrationSource, /order by item\.id[\s\S]*for update/);
assert.match(atomicWritesMigrationSource, /pg_advisory_xact_lock/);
assert.match(atomicWritesMigrationSource, /active_before_archive = item\.active/);
assert.match(atomicWritesMigrationSource, /active = coalesce\(item\.active_before_archive, false\)/);
const reorderFunctionSource = atomicWritesMigrationSource
  .split("create or replace function public.move_child_program_assignment")[1]
  .split("revoke execute on function")[0];
assert.match(actionsSource, /const category = String\(formData\.get\("category"\)/);
assert.match(actionsSource, /category\.replace\(\/\\s\+\/g, " "\)\.trim\(\)\.toLowerCase\(\)/);
assert.match(actionsSource, /moveChildProgramAssignment\(assignmentId, normalizedCategory, direction\)/);
assert.match(actionsSource, /function childProgramReturnUrl/);
assert.match(actionsSource, /returnView === "grades" \|\| returnView === "catalog" \|\| returnView === "archived"/);
assert.match(actionsSource, /CHILD_PROGRAM_GRADES\.includes/);
assert.doesNotMatch(actionsSource, /redirect\(String\(formData\.get\("return/);
assert.match(actionsSource, /export async function createChildProgramContentFormAction/);
assert.match(actionsSource, /export async function updateChildProgramContentFormAction/);
assert.match(actionsSource, /values: childProgramSubmittedValues\(formData\)/);
assert.match(actionsSource, /fieldErrors:/);
assert.match(actionsSource, /globalError:/);
assert.match(actionsSource, /redirect\("\/programa-infantil\?view=catalog&saved=child-program-created"\)/);
assert.match(actionsSource, /redirect\("\/programa-infantil\?view=catalog&saved=child-program-updated"\)/);
assert.match(serverSource, /moveChildProgramAssignment\(assignmentId: string, category: string, direction: "up" \| "down"\)/);
assert.match(serverSource, /p_category: category/);
assert.match(atomicWritesMigrationSource, /move_child_program_assignment\(\s*p_assignment_id uuid,\s*p_category text,\s*p_direction text\s*\)/);
assert.match(reorderFunctionSource, /v_category text/);
assert.match(reorderFunctionSource, /CHILD_PROGRAM_INVALID_CATEGORY/);
assert.match(reorderFunctionSource, /child-program-category:[^\n]+v_grade[^\n]+v_category/);
assert.ok((reorderFunctionSource.match(/lower\(regexp_replace\(trim\(item\.category\), '\[\[:space:\]\]\+', ' ', 'g'\)\) = v_category/g) ?? []).length >= 5);
assert.match(reorderFunctionSource, /set sort_order = reordered\.sort_order/);
assert.doesNotMatch(reorderFunctionSource, /\b(?:active|exam_relevant|title|category|description|updated_by|updated_at)\s*=/);
assert.match(atomicWritesMigrationSource, /move_child_program_assignment\(uuid, text, text\)/);
for (const usagePath of ["child_syllabus_history", "child_class_plans", "exam_event_items"]) {
  assert.match(atomicWritesMigrationSource, new RegExp(`public\\.${usagePath}`));
}
assert.match(atomicWritesMigrationSource, /lock table public\.child_class_plans in share row exclusive mode/);
assert.match(atomicWritesMigrationSource, /CHILD_PROGRAM_ASSIGNMENT_NOT_FOUND/);
assert.match(atomicWritesMigrationSource, /CHILD_PROGRAM_REORDER_TARGET_NOT_FOUND/);
assert.match(atomicWritesMigrationSource, /grant execute on function[\s\S]+to service_role/);

console.log("Child program catalog checks passed.");

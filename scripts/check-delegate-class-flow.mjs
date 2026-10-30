import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  delegateAttendanceGroups,
  delegateClassesForSubmission,
  hasAttendanceForEveryClass,
  hasRequiredDelegateGroups,
  normalizeDelegateStep,
  resolveDelegateMode
} from "../src/lib/delegate-class-flow.ts";

assert.equal(resolveDelegateMode("kids", "adults", "kids"), "adults");
assert.equal(resolveDelegateMode("kids", null, "adults"), "adults");
assert.equal(resolveDelegateMode(null, null, "kids"), "kids");
assert.equal(resolveDelegateMode("combined", null, "kids"), "kids");

assert.equal(normalizeDelegateStep(null, "kids", false, true, false), "start");
assert.equal(normalizeDelegateStep(null, "kids", true, true, false), "kids-attendance");
assert.equal(normalizeDelegateStep(null, "adults", true, false, true), "technical");
assert.equal(normalizeDelegateStep(null, "combined", true, true, true), "kids-attendance");
assert.equal(normalizeDelegateStep("kids-technical", "combined", true, true, true), "kids-attendance");
assert.equal(normalizeDelegateStep("attendance", "kids", true, true, false), "kids-attendance");
assert.equal(normalizeDelegateStep("kids-attendance", "adults", true, false, true), "technical");

assert.deepEqual(delegateAttendanceGroups("kids", "attendance"), ["kids"]);
assert.deepEqual(delegateAttendanceGroups("adults", "attendance"), ["adults"]);
assert.deepEqual(delegateAttendanceGroups("combined", "kids-attendance"), ["kids"]);
assert.deepEqual(delegateAttendanceGroups("combined", "attendance"), ["adults"]);

const classes = [
  { id: "adult-class", class_group: "adults" },
  { id: "kids-class", class_group: "kids" }
];
const kidsSubmission = delegateClassesForSubmission(classes, "kids", "");
assert.deepEqual(kidsSubmission.classes.map((item) => item.id), ["kids-class"]);
assert.equal(kidsSubmission.closeClasses, true);

const kidsAttendanceSubmission = delegateClassesForSubmission(classes, "kids", "kids-technical");
assert.deepEqual(kidsAttendanceSubmission.classes.map((item) => item.id), ["kids-class"]);
assert.equal(kidsAttendanceSubmission.closeClasses, false);

const adultsSubmission = delegateClassesForSubmission(classes, "adults", "");
assert.deepEqual(adultsSubmission.classes.map((item) => item.id), ["adult-class"]);
assert.equal(adultsSubmission.closeClasses, true);

const combinedKids = delegateClassesForSubmission(classes, "combined", "technical");
assert.deepEqual(combinedKids.classes.map((item) => item.id), ["kids-class"]);
assert.equal(combinedKids.closeClasses, false);

const combinedFinal = delegateClassesForSubmission(classes, "combined", "");
assert.deepEqual(combinedFinal.classes.map((item) => item.id), ["adult-class", "kids-class"]);
assert.equal(combinedFinal.closeClasses, true);

assert.equal(hasAttendanceForEveryClass(["kids-class"], ["kids-class"]), true);
assert.equal(hasAttendanceForEveryClass(["adult-class", "kids-class"], ["kids-class", "adult-class"]), true);
assert.equal(hasAttendanceForEveryClass(["adult-class", "kids-class"], ["kids-class"]), false);
assert.equal(hasAttendanceForEveryClass(["kids-class"], []), false);

assert.equal(hasRequiredDelegateGroups("kids", [{ class_group: "kids" }]), true);
assert.equal(hasRequiredDelegateGroups("adults", [{ class_group: "kids" }]), false);
assert.equal(hasRequiredDelegateGroups("combined", classes), true);
assert.equal(hasRequiredDelegateGroups("combined", [{ class_group: "adults" }, { class_group: "adults" }]), false);

const delegatePageSource = readFileSync(new URL("../src/app/delegado/[token]/page.tsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../src/app/actions.ts", import.meta.url), "utf8");
assert.match(delegatePageSource, /Programa tecnico infantil/);
assert.match(delegatePageSource, /saveDelegateChildPlanAction/);
assert.match(delegatePageSource, /child_class_plans/);
assert.match(delegatePageSource, /child_syllabus_items/);
assert.match(delegatePageSource, /child_syllabus_contents!inner\(archived_at\)/);
assert.match(delegatePageSource, /\.is\("child_syllabus_contents\.archived_at", null\)/);
assert.match(delegatePageSource, /historicalChildSyllabusItems/);
assert.match(delegatePageSource, /savedSyllabusItemIds=\{childPlan\?\.syllabus_item_ids \?\? \[\]\}/);
assert.match(delegatePageSource, /const childSyllabusLoadError/);
assert.match(actionsSource, /export async function saveDelegateChildPlanAction/);
assert.match(actionsSource, /step=kids-technical/);
assert.match(actionsSource, /const linkVersion = String\(formData\.get\("linkVersion"\)/);
assert.match(actionsSource, /rpc\("save_delegate_child_plan_if_open"/);
assert.match(actionsSource, /from\("child_syllabus_items"\)[\s\S]*?eq\("active", true\)/);
assert.match(actionsSource, /child_syllabus_contents!inner\(archived_at\)/);
assert.match(actionsSource, /\.is\("child_syllabus_contents\.archived_at", null\)/);
assert.match(actionsSource, /validateChildClassPlanSubmittedIds\(/);
assert.match(actionsSource, /reconcileChildClassPlanItemIds\(/);
assert.match(actionsSource, /const \{ data: finalAttendance[\s\S]*?hasAttendanceForEveryClass/);

console.log("Delegate class flow checks passed.");

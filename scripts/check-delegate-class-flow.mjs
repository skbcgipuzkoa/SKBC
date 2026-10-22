import assert from "node:assert/strict";
import {
  delegateAttendanceGroups,
  delegateClassesForSubmission,
  hasAttendanceForEveryClass,
  hasRequiredDelegateGroups,
  normalizeDelegateStep
} from "../src/lib/delegate-class-flow.ts";

assert.equal(normalizeDelegateStep(null, "kids", false, true, false), "start");
assert.equal(normalizeDelegateStep(null, "kids", true, true, false), "attendance");
assert.equal(normalizeDelegateStep(null, "adults", true, false, true), "technical");
assert.equal(normalizeDelegateStep(null, "combined", true, true, true), "kids-attendance");

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

console.log("Delegate class flow checks passed.");

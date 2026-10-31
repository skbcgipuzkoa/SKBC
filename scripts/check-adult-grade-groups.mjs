import assert from "node:assert/strict";
import {completedExaminerGrades,encodeExamAssignments,decodeExamAssignments} from "../src/lib/integrated-exam-assignments.ts";
const students=[{id:"s1",target_grade:"1 KYU"},{id:"s2",target_grade:"2 KYU"}];const items=[{id:"i1",grade:"1 KYU",active:true,weight:1,source:"technique"},{id:"i2",grade:"2 KYU",active:true,weight:1,source:"technique"}];
const first={event_student_id:"s1",event_item_id:"i1",score:5,skipped:false};
assert.deepEqual(completedExaminerGrades({grades:["1 KYU","2 KYU"],students,items,scores:[first]}),["1 KYU"]);
assert.deepEqual(completedExaminerGrades({grades:["1 KYU","2 KYU"],students,items,scores:[first,{event_student_id:"s2",event_item_id:"i2",score:null,skipped:true}]}),["1 KYU","2 KYU"]);
const settings=decodeExamAssignments(encodeExamAssignments("Teacher",{x:["1 KYU"]},{gradeGroupMode:true,pendingExaminerIds:["x"]}));assert.equal(settings.gradeGroupMode,true);assert.deepEqual(settings.pendingExaminerIds,["x"]);
console.log("Adult grade-group checks passed");

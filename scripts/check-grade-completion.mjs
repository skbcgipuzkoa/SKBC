import assert from 'node:assert/strict';
import { completedExaminerGrades } from '../src/lib/integrated-exam-assignments.ts';

const students = [{id:'a',target_grade:'1 KYU'},{id:'b',target_grade:'1 KYU'}];
const item = (id, extra={}) => ({id,grade:'1 KYU',active:true,weight:1,source:'technique',...extra});
const items = [item('first'),item('second'),item('cut',{source:'cut'}),item('inactive',{active:false}),item('zero',{weight:0})];
const mark = (student, technique, score=10, skipped=false) => ({event_student_id:student,event_item_id:technique,score,skipped});
const rows = [mark('a','first'),mark('a','second'),mark('b','first'),mark('b','second')];
const complete = (scores, overrides={}) => completedExaminerGrades({grades:['1 KYU'],students,items,scores,...overrides});
assert.deepEqual(complete(rows),['1 KYU']);
assert.deepEqual(complete(rows.slice(0,-1)),[], 'every pupil needs every active technique');
assert.deepEqual(complete([...rows.slice(0,-1),rows[0]]),[], 'duplicate marks cannot fill missing coverage');
for (const invalid of [null,NaN,Infinity,-1,11]) {
  assert.deepEqual(complete([...rows.slice(0,-1),mark('b','second',invalid)]),[], 'invalid marks cannot complete a grade');
}
assert.deepEqual(complete([...rows.slice(0,-1),mark('b','second',null,true)]),['1 KYU'], 'explicit omissions complete the route');
assert.deepEqual(complete([...rows.slice(0,-1),mark('other','second')]),[], 'foreign pupil cannot complete the route');
assert.deepEqual(complete([...rows.slice(0,-1),mark('b','other')]),[], 'foreign technique cannot complete the route');
assert.deepEqual(complete(rows,{students:[]}),[]);
assert.deepEqual(complete(rows,{items:[]}),[]);
assert.deepEqual(complete(rows,{grades:['2 KYU']}),[]);
console.log('Grade completion coverage checks passed');

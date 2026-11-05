import assert from 'node:assert/strict';
import { isIsoDate, madridCallToday, attributeExamCall, resolveCallFilter } from '../src/lib/exam-call.ts';
for (const date of ['2024-02-29','2000-02-29','2026-12-05']) assert.equal(isIsoDate(date),true);
for (const date of ['1900-02-29','2025-02-29','2026-04-31','2026-1-01','0000-01-01','2026-01-01T00:00:00Z']) assert.equal(isIsoDate(date),false);
assert.equal(madridCallToday(new Date('2026-12-31T23:30:00Z')),'2027-01-01');
assert.equal(madridCallToday(new Date('2026-06-01T22:30:00Z')),'2026-06-02');
for(const date of ['2027-01-20','2027-02-28']) {
  assert.equal(attributeExamCall(date,{isRetake:false}).callMonth,'2026-12');
  assert.equal(attributeExamCall(date,{isRetake:true}).callMonth,date.slice(0,7));
  assert.equal(attributeExamCall(date).callMonth,date.slice(0,7));
  assert.equal(attributeExamCall(date,{isRetake:false}).actualDate,date);
}
assert.equal(attributeExamCall('2025-02-29',{isRetake:false}),null);
assert.deepEqual(resolveCallFilter(undefined,['2027-06-26','2026-12-05']),{value:'next',callDate:'2026-12-05',all:false});
assert.equal(resolveCallFilter('all',[]).all,true);
assert.equal(resolveCallFilter('invalid',['2026-12-05']).value,'next');
assert.equal(resolveCallFilter('2027-06-26',['2026-12-05','2027-06-26']).callDate,'2027-06-26');
assert.equal(resolveCallFilter(undefined,[]).callDate,null);
console.log('Exam call date and filter checks passed');

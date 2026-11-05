import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {memberTenure} from '../src/lib/member-tenure.ts';
const on=date=>new Date(`${date}T12:00:00Z`);
for(const [joined,today,expected] of [
  ['2026-10-22','2026-11-05','14 días'],
  ['2026-10-22','2026-11-21','30 días'],
  ['2026-10-22','2026-11-22','1 mes'],
  ['2026-11-04','2026-11-05','1 día'],
  ['2026-11-05','2026-11-05','0 días'],
  ['2025-11-06','2026-11-05','11 meses'],
  ['2025-11-05','2026-11-05','1 año'],
  ['2024-10-05','2026-11-05','2 años y 1 mes'],
  ['2025-10-05','2026-12-05','1 año y 2 meses'],
  ['2026-01-31','2026-02-27','27 días'],
  ['2026-01-31','2026-02-28','1 mes'],
  ['2024-02-29','2025-02-28','1 año'],
  ['2024-01-31','2024-02-29','1 mes'],
  ['2026-11-06','2026-11-05','-'],
  [null,'2026-11-05','-'],
  ['','2026-11-05','-'],
  ['2026-02-30','2026-11-05','-'],
  ['2026-02-29','2026-11-05','-'],
  ['2026-13-01','2026-11-05','-'],
  ['2026-1-01','2026-11-05','-'],
  ['2026-11-01T00:00:00Z','2026-11-05','-']
])assert.equal(memberTenure(joined,on(today)),expected,`${joined} through ${today}`);
assert.equal(memberTenure('2026-11-04',new Date('2026-11-04T23:30:00Z')),'1 día','Madrid date after midnight');
assert.equal(memberTenure('2026-07-04',new Date('2026-07-04T22:30:00Z')),'1 día','Madrid summer date');
assert.equal(memberTenure('2026-11-04',new Date('invalid')),'-');
const ficha=readFileSync('src/app/ficha/[token]/page.tsx','utf8');
assert.equal((ficha.match(/memberTenure\(member.joined_on\)/g)||[]).length,2,'adult and child tenure use shared helper');
assert.ok(!ficha.includes('function ageText('));
const admin=readFileSync('src/app/kenshis/[legacyId]/page.tsx','utf8');
assert.ok(!admin.includes('legacy_ficha_url'));
assert.ok(!admin.includes('Abrir ficha antigua'));
console.log('Member tenure calendar and profile integration checks passed');

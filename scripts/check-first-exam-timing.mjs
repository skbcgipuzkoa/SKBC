import assert from 'node:assert/strict';
import { resolveExamEligibilityTime } from '../src/lib/exam-eligibility-time.ts';
const date = value => value?.toLocaleDateString('sv-SE');
const first = { joined_on:'2026-08-31', last_exam_on:null };
for (const memberClass of ['adults','kids']) {
 const timing = resolveExamEligibilityTime({...first,class:memberClass},12,3);
 assert.equal(timing.minimumMonths,6);
 assert.equal(date(timing.eligibilityDate),'2027-02-28');
 assert.equal(timing.isFirstExam,true);
 assert.ok(new Date('2027-02-27T00:00:00') < timing.eligibilityDate);
}
assert.equal(date(resolveExamEligibilityTime({joined_on:'2023-08-31',last_exam_on:null},12).eligibilityDate),'2024-02-29');
assert.equal(resolveExamEligibilityTime({joined_on:null,last_exam_on:null},12),null);
assert.equal(resolveExamEligibilityTime({joined_on:'invalid',last_exam_on:null},12),null);
assert.equal(resolveExamEligibilityTime({joined_on:'2026-02-30',last_exam_on:null},12),null);
assert.equal(resolveExamEligibilityTime({joined_on:'2020-01-01',last_exam_on:'invalid'},12),null);
for (const months of [12,24,36]) {
 const timing=resolveExamEligibilityTime({joined_on:null,last_exam_on:'2025-01-01'},months);
 assert.equal(timing.minimumMonths,months);
 assert.equal(timing.isFirstExam,false);
}
assert.equal(resolveExamEligibilityTime({joined_on:null,last_exam_on:'2025-01-01'},12,3).minimumMonths,9);
console.log('First exam calendar timing and subsequent exam rules passed.');
import ts from 'typescript';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const helper = await import('../src/lib/exam-eligibility-time.ts');
const source = readFileSync(new URL('../src/lib/member-exam-status.ts',import.meta.url),'utf8');
const module = {exports:{}};
const fixedNow = new Date('2027-02-28T12:00:00');
class FixtureDate extends Date { constructor(...args) { super(...(args.length ? args : [fixedNow])); } }
const fixture = { technicalOk:true };
const overrides = `
getExamRequirement = async () => ({min_months:12,attendance_ratio:.4,adult_required_repetitions:2,technical_blocks_exam:true});
calculateEngagementStatus = async () => ({internationalKyuAdvanceMonths:3,attendanceCredit:0,notice:'',points180:0});
countAttendance = async () => 100;
countExpectedTrainingSessions = async () => 100;
getRecentAttendance = async () => ({total180:20,total90:12,total60:8,total21:2,lastAttendance:'2027-02-28'});
getExamCalls = async () => [{call_date:'2027-02-28'}];
calculateTechnicalStatus = async () => ({ok:fixture.technicalOk,notice:'Tecnico comprobado',specialReviewPending:[],missingRequired:fixture.technicalOk?0:1});
module.exports.calculateExamStatus = calculateExamStatus;
module.exports.formatDate = formatDate;
`;
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText + overrides,{module,exports:module.exports,require:p=>p.endsWith('exam-eligibility-time')?helper:{},Date:FixtureDate,fixture,console});
const member={id:'adult',class:'adults',status:'active',grade:'5 KYU',joined_on:'2026-08-31',last_exam_on:null};
let status=await module.exports.calculateExamStatus(member);
assert.equal(status.semaphore,'VERDE');
assert.equal(status.nextExamOn,'2027-02-28');
assert.match(status.notice,/Primer examen: minimo 6 meses desde ingreso/);
fixture.technicalOk=false;
status=await module.exports.calculateExamStatus(member);
assert.equal(status.semaphore,'ROJO','six months must not bypass technical requirements');
fixture.technicalOk=true;
status=await module.exports.calculateExamStatus({...member,joined_on:'2026-09-01'});
assert.equal(status.semaphore,'AZUL','international advance cannot allow first exam one day early');
assert.match(status.notice,/2027-03-01/);
status=await module.exports.calculateExamStatus({...member,joined_on:'2026-02-31'});
assert.equal(status.nextExamOn,null);
assert.notEqual(status.semaphore,'VERDE');
status=await module.exports.calculateExamStatus({...member,class:'kids'});
assert.equal(status.semaphore,'VERDE');
assert.equal(module.exports.formatDate(new Date('2027-02-28T00:00:00')),'2027-02-28');
console.log('Actual member status timing, bonus floor, technical blocking, kids and date formatting passed.');

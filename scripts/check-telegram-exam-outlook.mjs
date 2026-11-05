import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {formatTelegramExamOutlooks} from '../src/lib/telegram-exam-outlook.ts';

const row={memberId:'1',name:'Ana <script> & Luis',memberClass:'adults',currentGrade:'5 KYU',targetGrade:'4 KYU',callDate:'2026-12-05',classification:'projected',candidate:true,currentReady:false,estimatedReadyOn:'2026-11-20',marginDays:15,deficits:['2 asistencias','Técnica <pendiente>'],uncertainty:['Mantener ritmo'],teacherReviewRequired:true,evidence:{windowStart:'2026-09-06',windowEnd:'2026-11-05'}};
let message=formatTelegramExamOutlooks([row,{...row,memberId:'2',name:'Ready',classification:'ready',currentReady:true},{...row,memberId:'3',name:'Unknown',classification:'unknown',candidate:false,callDate:null,estimatedReadyOn:null,marginDays:null}]);
assert.match(message,/hoy \(1\)/);assert.match(message,/ritmo actual \(1\)/);assert.match(message,/faltan datos \(1\)/);
assert.match(message,/Ana &lt;script&gt; &amp; Luis/);assert.doesNotMatch(message,/<script>/);
assert.match(message,/05\/12\/2026/);assert.match(message,/20\/11\/2026/);assert.match(message,/margen corto/);
assert.match(message,/Sin convocatoria futura calculable/);assert.match(message,/periodo anterior/);
message=formatTelegramExamOutlooks(Array.from({length:15},(_,i)=>({...row,memberId:String(i),name:`Kenshi ${i}`})));
assert.match(message,/ritmo actual \(15\)/);assert.match(message,/Y 3 más/);
assert.match(formatTelegramExamOutlooks([]),/Ninguno ahora mismo/);
const outsideWindow=formatTelegramExamOutlooks([{...row,currentReady:true,candidate:false,classification:'unknown',uncertainty:['Convocatoria fuera del horizonte de planificacion']}]);
assert.match(outsideWindow,/hoy \(0\)/);assert.match(outsideWindow,/faltan datos \(1\)/);

// Exercise the actual dispatch function: every scheduled report includes the same new outlook.
const source=readFileSync('src/lib/telegram-notifications.ts','utf8');
const start=source.indexOf('export async function buildNotificationMessage(');
const end=source.indexOf('export async function updateTelegramNotificationSetting(',start);
const compiled=ts.transpileModule(source.slice(start,end),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const mod={exports:{}};
const data={examOutlooks:[row]};
const scope={exports:mod.exports,buildDailyDigest:async()=>data,buildPeriodStats:async()=>data,formatTelegramExamOutlooks,todayIso:()=> '2026-11-05',formatHumanDate:x=>x,html:x=>x};
for(const name of ['formatTodayClasses','formatBirthdayAlerts','formatFreeTrialAlerts','formatRanking','formatClubNumbers','formatYearGrowth','formatActiveGrades','formatAttendanceStats','formatTechnicalStats','formatCourseStats','formatExamStats','formatPeriodAttendance'])scope[name]=()=>'';
vm.runInNewContext(compiled,scope);
for(const type of ['daily_ranking','monthly_stats','semester_stats','yearly_stats']){
 const text=await mod.exports.buildNotificationMessage(type,{start:'2026-10-01',end:'2026-10-31'});
 assert.ok(text.includes('Posibles candidatos'),type);assert.ok(text.includes('Ana &lt;script&gt;'),type);
}
assert.doesNotMatch(source,/function (?:readyForExam|upcomingForExam)\(/,'old semaphore-only logic removed');
console.log('Telegram shared outlook formatting and daily/monthly/semester/yearly dispatch passed');

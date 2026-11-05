import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import vm from 'node:vm';
import {formatTelegramExamOutlooks} from '../src/lib/telegram-exam-outlook.ts';

const row={memberId:'1',name:'Ana <script> & Luis',memberClass:'adults',currentGrade:'5 KYU',targetGrade:'4 KYU',callDate:'2026-12-05',classification:'projected',candidate:true,currentReady:false,estimatedReadyOn:'2026-11-20',marginDays:15,deficits:['2 asistencias','Técnica <pendiente>'],uncertainty:['Mantener ritmo'],teacherReviewRequired:true,evidence:{windowStart:'2026-09-06',windowEnd:'2026-11-05'}};
let message=formatTelegramExamOutlooks([row,{...row,memberId:'2',name:'Ready',classification:'ready',currentReady:true},{...row,memberId:'3',name:'Unknown',classification:'unknown',candidate:false,callDate:null,estimatedReadyOn:null,marginDays:null}]);
assert.match(message,/hoy \(1\)/);assert.match(message,/ritmo actual \(1\)/);assert.match(message,/faltan datos o preparación \(1\)/);
assert.match(message,/Ana &lt;script&gt; &amp; Luis/);assert.doesNotMatch(message,/<script>/);
assert.match(message,/05\/12\/2026/);assert.match(message,/20\/11\/2026/);assert.match(message,/margen corto/);
assert.match(message,/Sin convocatoria futura calculable/);assert.match(message,/periodo anterior/);
message=formatTelegramExamOutlooks(Array.from({length:15},(_,i)=>({...row,memberId:String(i),name:`Kenshi ${i}`})));
assert.match(message,/ritmo actual \(15\)/);assert.match(message,/Y 3 más/);
assert.match(formatTelegramExamOutlooks([]),/Ninguno ahora mismo/);
const outsideWindow=formatTelegramExamOutlooks([{...row,currentReady:true,candidate:false,classification:'unknown',uncertainty:['Convocatoria fuera del horizonte de planificacion']}]);
assert.match(outsideWindow,/hoy \(0\)/);assert.match(outsideWindow,/faltan datos o preparación \(1\)/);
const preparing=formatTelegramExamOutlooks([{...row,currentReady:false,candidate:true,classification:'notyet',estimatedReadyOn:null,marginDays:null,preparationCandidate:true,planningReasons:['Temario trabajado al 90%']}]);
assert.match(preparing,/ritmo actual \(0\)/);assert.match(preparing,/necesitan refuerzo o revisión \(1\)/);
assert.match(preparing,/Temario trabajado al 90%/);assert.match(preparing,/no se prevé completar/);
const impossible=formatTelegramExamOutlooks([{...row,feasibility:'impossible',impossibilityReasons:['Faltan 12 asistencias y quedan 8 clases'],candidate:true,currentReady:false,preparationCandidate:true,estimatedReadyOn:null,marginDays:null}]);
assert.match(impossible,/No llegan con las clases previstas \(1\)/);
assert.match(impossible,/ritmo actual \(0\)/);assert.match(impossible,/necesitan refuerzo o revisión \(0\)/);
assert.match(impossible,/Faltan 12 asistencias y quedan 8 clases/);
assert.doesNotMatch(impossible,/necesita refuerzo\./);

// Exercise the actual dispatch function: every scheduled report includes the same new outlook.
const source=readFileSync('src/lib/telegram-notifications.ts','utf8');
const nextStart=source.indexOf('async function loadNextTelegramExamOutlooks(');
assert.ok(nextStart>=0,'Telegram must scope every digest to the next configured club call');
const nextEnd=source.indexOf('async function buildDailyDigest(',nextStart);
const nextMod={exports:{}};
let configuredCalls=[{call_date:'2026-12-05'},{call_date:'2027-06-26'}];
vm.runInNewContext(ts.transpileModule(source.slice(nextStart,nextEnd)+'\nexports.loadNext = loadNextTelegramExamOutlooks;', {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
 exports:nextMod.exports,
 loadExamOutlooks:async()=>new Map([['next',row],['later',{...row,memberId:'later',callDate:'2027-06-26'}],['missing',{...row,memberId:'missing',callDate:null}]]),
 getUpcomingExamCalls:async()=>configuredCalls,
});
assert.deepEqual(Array.from(await nextMod.exports.loadNext()).map(x=>x.memberId),['1']);
configuredCalls=[];
assert.equal((await nextMod.exports.loadNext()).length,0,'Do not invent a call when none is configured');
assert.equal((source.match(/examOutlooks: await loadNextTelegramExamOutlooks\(\)/g)||[]).length,2,'Both daily and all period reports use next-call data');
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

import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {rankingDates} from '../src/lib/ranking-dates.ts';
assert.equal(rankingDates(new Date('2026-11-20T23:30:00Z')).today,'2026-11-21');
assert.equal(rankingDates(new Date('2026-07-01T22:30:00Z')).today,'2026-07-02');
assert.equal(rankingDates(new Date('2026-03-29T22:30:00Z')).date30,'2026-02-28');
let clock=new Date('2026-11-21T12:00:00Z');
function load(path){const source=fs.readFileSync(path,'utf8');const ast=ts.createSourceFile(path,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const functions=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['buildAdultRanking','countByMember','sumByMember','latestAttendanceByMember','latestByMember','uniqueSorted','possibleClubDays','attendanceRate','trainingDaysBetween','daysBetween','isClubTrainingDay','isSummerBreak','isExplicitlyClosed','adultInactivityPenalty','countCoursePoints'].includes(n.name?.text)).map(n=>n.getText(ast)).join('\n');const ctx={rankingDates:()=>rankingDates(clock),console,onboardingMessage:()=>null,rankingMessage:()=>""};vm.createContext(ctx);vm.runInContext(ts.transpileModule(functions,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,ctx);return ctx;}
const admin=load('src/app/rankings/page.tsx'),telegram=load('src/lib/telegram-notifications.ts'),ficha=load('src/app/ficha/[token]/page.tsx');
const members=['one','two'].map(id=>({id,legacy_id:id,display_name:id,class:'adults',joined_on:'2025-01-01',status:'active'}));
const attendance=Array.from({length:12},(_,i)=>'2026-11-'+String(i+6).padStart(2,'0')).flatMap(attended_on=>members.map(m=>({member_id:m.id,attended_on})));
const scores=(rows)=>({admin:admin.buildAdultRanking(members,rows,[],[],[],[],new Set(),[],[]).map(r=>r.score),telegram:telegram.buildAdultRanking(members,rows,[],[],[],[],[],[]).map(r=>r.score),ficha:members.map(m=>ficha.buildAdultRanking(m.id,members,rows,[],[],[]).score)});
const before=scores(attendance);assert.deepEqual(Array.from(before.admin),[117,117]);assert.deepEqual(Array.from(before.telegram),[117,117]);assert.deepEqual(before.ficha,[117,117]);
const after=scores([...attendance,{member_id:'one',attended_on:'2026-11-19'}]);assert.deepEqual(Array.from(after.admin),[117,109]);assert.deepEqual(Array.from(after.telegram),[117,109]);assert.deepEqual(after.ficha,[117,109]);
clock=new Date('2027-05-21T12:00:00Z');const aged=scores(attendance);assert.equal(aged.admin.every(s=>s===0),true);assert.equal(aged.telegram.every(s=>s===0),true);assert.equal(aged.ficha.every(s=>s===0),true);
for(const path of ['src/app/rankings/page.tsx','src/lib/telegram-notifications.ts'])assert.doesNotMatch(fs.readFileSync(path,'utf8'),/^const (today|date30|date60|date90|date180) =/m);
console.log('Madrid dates, DST, long-lived module refresh, all three ranking formulas unchanged, and missed-class score differentiation passed.');


clock=new Date('2026-11-21T12:00:00Z');
function bonusScores(bonuses){return [admin.buildAdultRanking(members,attendance,[],[],bonuses,[],new Set(),[],[]).find(r=>r.id==='one').score,telegram.buildAdultRanking(members,attendance,[],[],bonuses,[],[],[]).find(r=>r.name==='one').score,ficha.buildAdultRanking('one',members,attendance,[],bonuses,[]).score];}
const fixed={member_id:'one',points:3,active:true,permanent:true,bonus_date:'2026-09-08'};
const punctual={...fixed,permanent:false,bonus_date:'2026-11-17'};
assert.deepEqual(bonusScores([fixed]),[123,123,123]);
assert.deepEqual(bonusScores([punctual]),[123,123,123]);
assert.deepEqual(bonusScores([fixed,punctual]),[129,129,129]);
assert.deepEqual(bonusScores([{...punctual,bonus_date:'2026-11-16'}]),[117,117,117]);
assert.deepEqual(bonusScores([{...fixed,active:false}]),[117,117,117]);
assert.deepEqual(bonusScores([{...fixed,points:-3}]),[111,111,111]);
console.log('Fixed and punctual bonuses add twice their signed points across admin, ficha and Telegram; lifetime and activation rules preserved.');

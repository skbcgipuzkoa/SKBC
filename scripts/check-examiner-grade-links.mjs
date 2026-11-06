import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { decodeExamAssignments } from "../src/lib/integrated-exam-assignments.ts";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
let reads = 0;
const token = "a".repeat(32);
let parent = {
  id: "parent",
  name: "Synthetic examiner",
  revoked_at: null,
  source_examiner_id: null,
  exam_events: {
    program_type: "adults",
    notes: JSON.stringify({
      examAssignmentsVersion: 1,
      text: "",
      scopes: { parent: ["2 KYU"] },
    }),
  },
};
let children = [
  {
    access_token: "b".repeat(32),
    revoked_at: null,
    exam_events: {
      id: "two",
      title: "2 KYU",
      target_grade: "2 KYU",
      call_month: "2026-12",
      exam_date: "2026-12-20",
      date_confirmed: true,
      status: "active",
    },
  },
  {
    access_token: "c".repeat(32),
    revoked_at: null,
    exam_events: {
      id: "one",
      title: "1 KYU",
      target_grade: "1 KYU",
      call_month: "2026-12",
      exam_date: "2026-12-20",
      date_confirmed: true,
      status: "active",
    },
  },
];
const db = {
  from: () => ({
    select() {
      return this;
    },
    eq() {
      return this;
    },
    order() {
      return this;
    },
    maybeSingle: async () => {
      reads++;
      return { data: parent, error: null };
    },
    returns: async () => {
      reads++;
      return { data: children, error: null };
    },
  }),
};
const mod = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/lib/examiner-grade-links.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: mod.exports,
    require: (id) =>
      id.endsWith("supabase/admin")
        ? { createAdminClient: () => db }
        : id.endsWith("integrated-exam-assignments")
          ? { decodeExamAssignments }
          : {},
  },
);
const get = mod.exports.getExaminerGradeLinks;
assert.equal(await get("bad"), null);
assert.equal(reads, 0);
const disabledReads = reads;
assert.equal(await get("disabled_" + "d".repeat(32)), null);
assert.equal(
  reads,
  disabledReads,
  "Reserved disabled credentials fail before any database access",
);
const enabledChild = children[0].access_token;
children[0].access_token = "disabled_" + "e".repeat(32);
assert.equal(
  (await get(token)).links.length,
  0,
  "A parent alias cannot expose a disabled child credential",
);
children[0].access_token = enabledChild;

assert.equal(
  (await get(token)).links.length,
  1,
  "Parent grade restrictions apply to alias links too",
);
assert.equal((await get(token)).links[0].targetGrade, "2 KYU");
assert.equal(
  (await get(token, "1 KYU")).links.length,
  0,
  "A changed grade query cannot expand permission",
);
parent.revoked_at = "2026-11-01";
assert.equal(await get(token), null);
parent.revoked_at = null;
parent.exam_events.notes = JSON.stringify({
  examAssignmentsVersion: 1,
  text: "",
  scopes: { parent: ["2 KYU"] },
  pendingExaminerIds: ["parent"],
});
assert.equal(
  (await get(token)).links.length,
  0,
  "Pending identities cannot acquire clone access",
);
parent.exam_events.notes = null;
assert.equal(
  (await get(token)).links.length,
  2,
  "Existing unrestricted parent keeps its existing grades",
);
children[1].revoked_at = "2026-11-01";
assert.equal((await get(token)).links.length, 1);
parent.source_examiner_id = "another-parent";
assert.equal(
  await get(token),
  null,
  "A direct new link must use the normal examiner validation",
);
console.log(
  "Examiner old-link grade permissions, revocation, pending identities and normal-link fallback passed",
);
const require = createRequire(import.meta.url);
const navigationCalls=[];
const navigationWindow={history:{length:2}};
const navigation={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/app/examinar/ExamAccessNavigation.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports:navigation.exports,window:navigationWindow,require:id=>id==='next/navigation'?{useRouter:()=>({back:()=>navigationCalls.push('back'),replace:path=>navigationCalls.push(path)})}:require(id)});
const navigationElement=navigation.exports.ExamAccessNavigation();
const backButton=navigationElement.props.children.find(child=>child.type==='button');
backButton.props.onClick();assert.deepEqual(navigationCalls,['back'],'Use browser history when the previous page exists');
navigationWindow.history.length=1;backButton.props.onClick();assert.deepEqual(navigationCalls,['back','/examenes'],'A directly opened exam link has a deterministic fallback');
const navigationMarkup=renderToStaticMarkup(navigationElement);assert.match(navigationMarkup,/href="\/examenes"/);assert.match(navigationMarkup,/min-height:48px/);
let routedGroup = null,
  baseReads = 0,
  lookupError = false,
  baseLookupError = false;
const route = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/app/examinar/[token]/page.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    },
  ).outputText,
  {
    exports: route.exports,
    require: (id) =>
      id === "@/app/examinar/ExamAccessNavigation" ? navigation.exports :
      id === "@/lib/examiner-grade-links"
        ? {
            getExaminerGradeLinks: async () => {
              if (lookupError) throw new Error("Internal failure");
              return routedGroup;
            },
          }
        : id === "@/lib/exam-call"
          ? { formatExamCallMonth: () => "Diciembre de 2026" }
          : id === "@/lib/integrated-exams"
            ? {
                getExaminerExamByToken: async () => {
                  baseReads++;
                  if (baseLookupError) throw new Error('Expired credential');
                  return {};
                },
              }
            : id === "next/navigation"
              ? {
                  redirect: (url) => {
                    throw new Error("REDIRECT:" + url);
                  },
                }
              : id === "@/app/actions"
                ? {}
                : id === "@/app/examenes/components/ExamEvaluationForm"
                  ? {
                      ExamEvaluationForm: () =>
                        React.createElement(
                          "p",
                          null,
                          "Ordinary examiner route",
                        ),
                    }
                  : require(id),
  },
);
const page = () =>
  route.exports.default({
    params: Promise.resolve({ token }),
    searchParams: Promise.resolve({}),
  });
routedGroup = {
  examinerName: "Synthetic",
  links: [
    {
      token: "b".repeat(32),
      eventId: "one",
      targetGrade: "2 KYU",
      dateConfirmed: true,
      examDate: "2026-12-20",
      callMonth: "2026-12",
    },
    {
      token: "c".repeat(32),
      eventId: "two",
      targetGrade: "1 KYU",
      dateConfirmed: true,
      examDate: "2026-12-20",
      callMonth: "2026-12",
    },
  ],
};
assert.match(renderToStaticMarkup(await page()), /Exámenes por grado/);
assert.equal(baseReads, 0);
routedGroup.links.pop();
await assert.rejects(page, /REDIRECT:\/examinar\/b{32}/);
routedGroup.links[0].dateConfirmed = false;
routedGroup.links[0].examDate = null;
const pendingMarkup = renderToStaticMarkup(await page());
assert.match(pendingMarkup, /día pendiente de confirmar/);
assert.doesNotMatch(pendingMarkup, /href="\/examinar\//);
routedGroup = null;
assert.match(renderToStaticMarkup(await page()), /Ordinary examiner route/);
assert.equal(baseReads, 1);
lookupError = true;
const failedMarkup = renderToStaticMarkup(await page());
assert.match(failedMarkup, /No se puede abrir/);
assert.match(failedMarkup, /Volver/, 'An invalid exam access must provide an escape from the error screen');
assert.doesNotMatch(failedMarkup, /Internal failure/);
lookupError=false;baseLookupError=true;
const invalidMarkup=renderToStaticMarkup(await page());
assert.match(invalidMarkup,/Enlace no valido/);
assert.match(invalidMarkup,/>Volver<\/button>/);
assert.match(invalidMarkup,/href="\/examenes"/);
assert.doesNotMatch(invalidMarkup,/Expired credential/);
console.log(
  "Examiner alias chooser, one-grade redirect, pending-date display and ordinary route fallback passed",
);

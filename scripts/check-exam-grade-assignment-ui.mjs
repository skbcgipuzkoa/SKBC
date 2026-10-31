import { resolveAdultExamTargetGrade } from "../src/lib/integrated-exam-assignments.ts";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
const jsx = await import("react/jsx-runtime");
const file = "src/app/examenes/components/ExamGradeAssignmentForm.tsx";
const module = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText,
  {
    exports: module.exports,
    require: (name) =>
      name === "react/jsx-runtime"
        ? jsx
        : { saveIntegratedExamAssignmentsAction: async () => {} },
  },
);
const props = {
  eventId: "e",
  examiners: [
    { id: "a", name: "Uno", revoked_at: null },
    { id: "b", name: "Dos", revoked_at: null },
  ],
  grades: ["5 KYU", "4 KYU"],
  scopes: { a: ["5 KYU"], b: ["5 KYU", "4 KYU"] },
  locked: false,
};
const html = renderToStaticMarkup(
  React.createElement(module.exports.ExamGradeAssignmentForm, props),
);
assert.equal((html.match(/name="scope:a"/g) || []).length, 2);
assert.equal((html.match(/checked=""/g) || []).length, 3);
assert(html.includes('name="eventId" value="e"'));
assert(html.includes("grado objetivo"));
const locked = renderToStaticMarkup(
  React.createElement(module.exports.ExamGradeAssignmentForm, {
    ...props,
    locked: true,
  }),
);
assert(locked.includes('<fieldset disabled=""'));
assert(!locked.includes('type="submit"'));
assert(locked.includes("evaluacion enviada"));
console.log("Adult examiner grade assignment UI checks passed.");

const actions = { exports: {} };
let allowed = true,
  received = null;
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/app/examenes/review-actions.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: actions.exports,
    require: (name) =>
      name === "@/lib/auth"
        ? { hasInternalAccess: async () => allowed }
        : name === "next/navigation"
          ? {
              redirect: (url) => {
                throw new Error("REDIRECT:" + url);
              },
            }
          : name === "next/cache"
            ? { revalidatePath: () => {} }
            : name === "@/lib/integrated-exams"
              ? {
                  saveAdultGradeGroups: async (input) => {
                    received = input;
                  },
                }
              : {},
  },
);
const form = new FormData();
form.append("eventId", "event");
form.append("examinerIds", "a");
form.append("examinerIds", "b");
form.append("examinerName:a", "Persona A");
form.append("examinerName:b", "Persona B");
form.append("examinerName:new", "Persona C");
form.append("scope:new", "5 KYU");
form.append("scope:a", "5 KYU");
form.append("scope:a", "4 KYU");
form.append("scope:b", "4 KYU");
await assert.rejects(
  () => actions.exports.saveIntegratedExamAssignmentsAction(form),
  /saved=assignments/,
);
assert.equal(received.eventId, "event");
assert.deepEqual(Array.from(received.examiners[0].grades), ["5 KYU", "4 KYU"]);
assert.deepEqual(Array.from(received.examiners[1].grades), ["4 KYU"]);
assert.equal(received.examiners[0].name, "Persona A");
assert.equal(received.examiners[2].name, "Persona C");
assert.equal(received.examiners[2].id, undefined);
allowed = false;
received = null;
await assert.rejects(
  () => actions.exports.saveIntegratedExamAssignmentsAction(form),
  /REDIRECT:\//,
);
assert.equal(received, null);
console.log(
  "Assignment action checks passed: multi-grade payload and internal authorization.",
);

const evaluation = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      "src/app/examenes/components/ExamEvaluationForm.tsx",
      "utf8",
    ),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: evaluation.exports,
    require: (name) =>
      name === "react/jsx-runtime"
        ? jsx
        : name === "@/lib/integrated-exam-session"
          ? {
              decodeScoreNotes: (notes) => ({
                text: notes ?? "",
                adjustments: [],
              }),
            }
          : name === "./ExamStepNavigator"
            ? {
                StudentExamPhoto: () => null,
                StudentPointControls: () => null,
                ExamScoreFeedback: ({ children }) =>
                  React.createElement("div", null, children),
                ExamStepNavigator: ({ children, steps }) =>
                  React.createElement(
                    "div",
                    { "data-steps": steps.map((step) => step.title).join("|") },
                    children,
                  ),
              }
            : {
                driveImageUrl: (src) => src,
                isExamItemRelevantForStudent: (_program, student, item) =>
                  student.target_grade === item.grade,
                isKidsProgressiveCutForStudent: () => false,
              },
  },
);
const adultHtml = renderToStaticMarkup(
  React.createElement(evaluation.exports.ExamEvaluationForm, {
    payload: {
      event: { title: "Adultos", program_type: "adults", status: "draft" },
      examiner: { name: "Profesor" },
      assignedGrades: ["5 KYU", "4 KYU"],
      students: [
        { id: "s5", target_grade: "5 KYU", members: { display_name: "Cinco" } },
        {
          id: "s4",
          target_grade: "4 KYU",
          members: { display_name: "Cuatro" },
        },
      ],
      items: [
        {
          id: "a",
          name: "Primera",
          source: "manual",
          weight: 1,
          grade: "5 KYU",
        },
        {
          id: "b",
          name: "Segunda",
          source: "manual",
          weight: 1,
          grade: "4 KYU",
        },
      ],
      existingScores: [],
    },
    fields: { eventId: "e", examinerId: "a" },
    action: async () => {},
  }),
);
assert(adultHtml.includes("Grados objetivo asignados:"));
assert(adultHtml.includes("5 KYU, 4 KYU"));
assert(adultHtml.includes("5 KYU · Primera|4 KYU · Segunda"));
assert(adultHtml.includes('name="score:s5:a"'));
assert(!adultHtml.includes('name="score:s4:a"'));
assert(adultHtml.includes('name="score:s4:b"'));
console.log(
  "Assigned adult evaluation hero and grade steps render checks passed.",
);

assert(html.includes('name="examinerName:a"'));
assert(html.includes('name="examinerName:new"'));
assert(html.includes("un solo enlace personal"));

const baseAdultPayload = {
  event: { title: "Adultos", program_type: "adults", status: "active" },
  examiner: { name: "Pendiente" },
  assignedGrades: ["5 KYU", "4 KYU"],
  routeGrades: ["5 KYU"],
  completedGrades: [],
  needsExaminerName: true,
  students: [{ id: "private", members: { display_name: "No mostrar aun" } }],
  items: [],
  existingScores: [],
};
const pending = renderToStaticMarkup(
  React.createElement(evaluation.exports.ExamEvaluationForm, {
    payload: baseAdultPayload,
    fields: { token: "secret", grade: "5 KYU" },
    action: async () => {},
  }),
);
assert(pending.includes("Identificate antes de evaluar"));
assert(pending.includes('name="examinerName"'));
assert(pending.includes('name="grade" value="5 KYU"'));
assert(!pending.includes("No mostrar aun"));
assert(!pending.includes('name="score:'));
const pendingInternal = renderToStaticMarkup(
  React.createElement(evaluation.exports.ExamEvaluationForm, {
    payload: baseAdultPayload,
    fields: { eventId: "e", examinerId: "pending" },
    backHref: "/examenes/e",
    action: async () => {},
  }),
);
assert(pendingInternal.includes("Asigna el nombre"));
assert(!pendingInternal.includes('name="token"'));
const completedGrade = renderToStaticMarkup(
  React.createElement(evaluation.exports.ExamEvaluationForm, {
    payload: {
      ...baseAdultPayload,
      needsExaminerName: false,
      completedGrades: ["5 KYU"],
    },
    fields: { token: "secret", grade: "5 KYU" },
    action: async () => {},
  }),
);
assert(completedGrade.includes("Evaluacion de 5 KYU recibida"));
assert(completedGrade.includes("Continuar con grados pendientes: 4 KYU"));
assert(!completedGrade.includes('type="submit"'));
console.log(
  "Pending identity gates and separate grade completion UI checks passed.",
);
const creation = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/app/examenes/IntegratedExamCreateForm.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: creation.exports,
    require: (name) =>
      name === "react"
        ? React
        : name === "react/jsx-runtime"
          ? jsx
          : name === "@/lib/integrated-exam-assignments"
            ? { resolveAdultExamTargetGrade }
            : name === "@/lib/grades"
              ? { adultGrades: ["MINARAI", "5 KYU", "4 KYU", "5 DAN"] }
              : name === "@/lib/child-program"
                ? {
                    CHILD_PROGRAM_GRADES: [],
                    resolveChildExamScopeTargets: () => [],
                    resolveChildExamGrades: () => [],
                  }
                : name === "lucide-react"
                  ? { ChevronDown: () => null, ChevronUp: () => null }
                  : { createIntegratedExamEventAction: async () => {} },
  },
);
const creationHtml = renderToStaticMarkup(
  React.createElement(creation.exports.IntegratedExamCreateForm, {
    adultMembers: [
      {
        id: "s",
        display_name: "Alumno seleccionado",
        class: "adults",
        grade: "MINARAI",
      },
    ],
    kidMembers: [],
    catalogAssignments: [],
    duplicationTemplate: {
      id: "old",
      title: "Copia",
      program_type: "adults",
      memberIds: ["s"],
      examinerNames: [],
      items: [],
    },
  }),
);
assert(
  creationHtml.indexOf('name="memberIds"') <
    creationHtml.indexOf('name="examDate"'),
);
assert(creationHtml.includes("5 KYU · 1 alumnos"));
assert(!creationHtml.includes('name="examinerNames"'));
assert(!creationHtml.includes('name="examineMyself"'));
assert(creationHtml.includes("las personas del examen original no se copian"));
console.log(
  "Adult pupil-first creation and live-group initial preview checks passed.",
);

const admin = { exports: {} };
let adminData = {
  event: {
    id: "e",
    title: "Reconciliar",
    status: "active",
    program_type: "adults",
    pass_percentage: 70,
  },
  students: [
    { id: "s", target_grade: "5 KYU", members: { display_name: "Alumno" } },
  ],
  items: [],
  examiners: [
    {
      id: "a",
      name: "Profesor",
      submitted_at: null,
      revoked_at: null,
      access_token: "t",
    },
  ],
  scores: [],
  summaries: [
    {
      studentId: "s",
      complete: true,
      items: [],
      review: { decision: "pass", adjustments: {} },
      percentage: 80,
      basePercentage: 80,
      scoredItems: 1,
      totalItems: 1,
    },
  ],
  examinerGradeScopes: { a: ["5 KYU"] },
  adultTargetGrades: ["5 KYU"],
  pendingExaminerIds: [],
  completedGradesByExaminer: { a: ["5 KYU"] },
  gradeGroupMode: true,
  hasSubmittedScores: true,
};
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync("src/app/examenes/[eventId]/page.tsx", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText,
  {
    exports: admin.exports,
    process: { env: {} },
    require: (name) =>
      name === "react/jsx-runtime"
        ? jsx
        : name === "@/lib/integrated-exams"
          ? { getIntegratedExamAdmin: async () => adminData }
          : name === "@/lib/auth"
            ? { hasInternalAccess: async () => true }
            : name === "@/lib/integrated-exam-review"
              ? { isReviewCurrent: () => true }
              : name === "@/lib/integrated-exam-session"
                ? { decodeScoreNotes: () => ({ adjustments: [] }) }
                : name === "@/lib/drive"
                  ? { driveImageUrl: () => null }
                  : name.includes("ExamGradeAssignmentForm")
                    ? { ExamGradeAssignmentForm: () => null }
                    : name.includes("ExamStepNavigator")
                      ? { StudentExamPhoto: () => null }
                      : name.includes("SidebarNav")
                        ? { SidebarNav: () => null }
                        : name === "lucide-react"
                          ? { LogOut: () => null }
                          : new Proxy({}, { get: () => async () => {} }),
  },
);
async function registrationDisabled() {
  const html = renderToStaticMarkup(
    await admin.exports.default({
      params: Promise.resolve({ eventId: "e" }),
      searchParams: Promise.resolve({}),
    }),
  );
  const tag = html.match(
    /<button[^>]*>Registrar resultados y actualizar fichas<\/button>/,
  )?.[0];
  assert(tag);
  return tag.includes("disabled");
}
assert.equal(
  await registrationDisabled(),
  false,
  "Complete grade matrix permits timestamp reconciliation",
);
adminData.pendingExaminerIds = ["a"];
assert.equal(
  await registrationDisabled(),
  true,
  "Pending identity cannot finalize",
);
adminData.pendingExaminerIds = [];
adminData.completedGradesByExaminer = { a: [] };
assert.equal(
  await registrationDisabled(),
  true,
  "Incomplete assigned grade blocks finalization",
);
adminData.event.program_type = "kids_progressive";
adminData.completedGradesByExaminer = { a: ["5 KYU"] };
assert.equal(
  await registrationDisabled(),
  true,
  "Child events retain submitted timestamp requirement",
);
console.log("Admin complete-grade finalization readiness checks passed.");

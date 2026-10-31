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
                  saveIntegratedExamAssignments: async (input) => {
                    received = input;
                  },
                }
              : {},
  },
);
const form = new FormData();
form.append("eventId", "event");
form.append("scope:a", "5 KYU");
form.append("scope:a", "4 KYU");
form.append("scope:b", "4 KYU");
await assert.rejects(
  () => actions.exports.saveIntegratedExamAssignmentsAction(form),
  /saved=assignments/,
);
assert.equal(received.eventId, "event");
assert.deepEqual(Array.from(received.scopes.a), ["5 KYU", "4 KYU"]);
assert.deepEqual(Array.from(received.scopes.b), ["4 KYU"]);
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

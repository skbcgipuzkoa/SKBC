import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  isReviewItemRelevantForStudent,
  buildStudentReview,
} from "../src/lib/integrated-exam-review.ts";

import { decodeScoreNotes } from "../src/lib/integrated-exam-session.ts";
import { driveImageUrl } from "../src/lib/drive.ts";

const source = fs.readFileSync(
  "src/app/examenes/components/ExamEvaluationForm.tsx",
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
const jsx = await import("react/jsx-runtime");
const navigation = { exports: {} };
vm.runInNewContext(
  ts.transpileModule(
    fs.readFileSync(
      "src/app/examenes/components/ExamStepNavigator.tsx",
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
    exports: navigation.exports,
    require: (name) => (name === "react" ? React : jsx),
  },
);
vm.runInNewContext(compiled, {
  exports: module.exports,
  require: (name) =>
    name === "react/jsx-runtime"
      ? jsx
      : name === "@/lib/drive"
        ? { driveImageUrl }
        : name === "@/lib/integrated-exam-session"
          ? { decodeScoreNotes }
          : name === "./ExamStepNavigator"
            ? navigation.exports
            : {
                isExamItemRelevantForStudent: isReviewItemRelevantForStudent,
                isKidsProgressiveCutForStudent: (student, item) =>
                  student.target_grade === item.cut_grade,
              },
});
const students = [
  {
    id: "low",
    current_grade: "BLANCO-AMARILLO",
    target_grade: "AMARILLO",
    members: {
      display_name: "Alumno amarillo",
      photo_url: "https://example.com/student.jpg",
    },
  },
  {
    id: "high",
    current_grade: "VERDE",
    target_grade: "VERDE-AZUL",
    members: { display_name: "Alumno verde" },
  },
];
const items = [
  {
    id: "basic",
    name: "Ejercicio basico",
    grade: "AMARILLO",
    source: "manual",
    weight: 1,
  },
  {
    id: "cut",
    name: "Corte amarillo",
    grade: "AMARILLO",
    cut_grade: "AMARILLO",
    source: "cut",
    weight: 0,
  },
  {
    id: "advanced",
    name: "Ejercicio avanzado",
    grade: "VERDE",
    source: "manual",
    weight: 1,
  },
];
const payload = {
  event: {
    title: "Grupo",
    exam_date: "2026-10-31",
    program_type: "kids_progressive",
    status: "active",
  },
  examiner: { name: "Profesor", submitted_at: null },
  items,
  students,
  existingScores: [
    {
      event_student_id: "low",
      event_item_id: "basic",
      score: 0,
      skipped: false,
    },
    {
      event_student_id: "high",
      event_item_id: "advanced",
      score: null,
      skipped: true,
    },
  ],
};
const html = renderToStaticMarkup(
  React.createElement(module.exports.ExamEvaluationForm, {
    payload,
    action: async () => {},
    fields: { eventId: "event", examinerId: "teacher" },
    backHref: "/examenes/event",
  }),
);
for (const [score, notes, prompted] of [
  [5, "", true],
  [10, "", false],
  [0, "Revisar guardia", false],
]) {
  const feedbackHtml = renderToStaticMarkup(
    React.createElement(
      navigation.exports.ExamScoreFeedback,
      {
        initialScore: String(score),
        initialNotes: notes,
        name: "notes:student:item",
        studentName: "Alumno",
      },
      React.createElement("input", {
        type: "radio",
        name: "score:student:item",
        value: String(score),
        defaultChecked: true,
      }),
    ),
  );
  assert.equal(
    feedbackHtml.includes("Puedes anadir que necesita mejorar"),
    prompted,
  );
  assert.ok(
    feedbackHtml.includes('name="notes:student:item"'),
    "Feedback uses the report's existing observation field",
  );
  assert.ok(!feedbackHtml.includes("required"), "Feedback stays optional");
}
assert.equal(
  (html.match(/type="radio"/g) || []).length,
  12,
  "Four options for every relevant student on the same exercise screen",
);
for (const value of ["10", "5", "0", "skip"])
  assert.ok(
    html.includes(`name="score:low:basic"`) &&
      html.includes(`value="${value}"`),
  );
const radioTags = html.match(/<input[^>]+type="radio"[^>]*>/g) || [];
assert.ok(
  radioTags.some(
    (tag) => tag.includes('value="0"') && tag.includes('checked=""'),
  ),
);
assert.ok(
  radioTags.some(
    (tag) => tag.includes('value="skip"') && tag.includes('checked=""'),
  ),
);
assert.ok(
  !html.includes('name="score:low:advanced"'),
  "Seated students are not assessed after their target",
);
assert.ok(
  !html.includes('name="score:low:cut"'),
  "Cuts are instructions, not scored items",
);
assert.ok(html.includes("Se sientan aqui"));
assert.ok(html.includes("Omitir"));
assert.ok(
  html.includes('src="https://example.com/student.jpg"'),
  "Examiner can identify a pupil by their existing photo",
);
assert.ok(
  html.includes('aria-label="Sin foto de Alumno verde"'),
  "Missing photos have a named initials fallback",
);
assert.ok(
  html.includes("Puedes anadir que necesita mejorar"),
  "Low rating invites optional feedback inline",
);
assert.ok(
  !/<textarea[^>]*required/.test(html),
  "Observations never block the exam",
);
assert.equal(
  (html.match(/Sumar un punto a /g) || []).length,
  3,
  "Each assessed pupil row has a direct reward button",
);
assert.equal(
  (html.match(/Restar un punto a /g) || []).length,
  3,
  "Each assessed pupil row has a direct penalty button",
);
assert.ok(
  !html.includes("<select"),
  "No pupil selector needed for point adjustments",
);
assert.ok(
  !/<select[^>]*name="score:/.test(html),
  "No numeric dropdown per student",
);
assert.ok(
  !html.includes('name="token"'),
  "Internal form never exposes shared token",
);
const actions = fs.readFileSync("src/app/actions.ts", "utf8");
const creator = actions.slice(
  actions.indexOf("export async function createIntegratedExamEventAction"),
  actions.indexOf("export async function deleteIntegratedExamEventAction"),
);
assert.ok(
  !creator.includes("/evaluar?"),
  "Creating an exam must never start evaluation",
);
assert.ok(
  creator.includes("#examenes-creados"),
  "Created exam returns to the waiting list",
);
const averaged = buildStudentReview({
  studentId: "low",
  items: [items[0]],
  scores: [
    {
      event_student_id: "low",
      event_item_id: "basic",
      examiner_id: "a",
      score: 10,
      skipped: false,
    },
    {
      event_student_id: "low",
      event_item_id: "basic",
      examiner_id: "b",
      score: 0,
      skipped: false,
    },
    {
      event_student_id: "low",
      event_item_id: "basic",
      examiner_id: "c",
      score: null,
      skipped: true,
    },
  ],
  passPercentage: 70,
});
assert.equal(
  averaged.items[0].score,
  5,
  "All assessed examiner scores are averaged; omission is not zero",
);
console.log("Group exam evaluation checks passed.");

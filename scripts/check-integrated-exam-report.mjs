import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { PDFDocument } from "pdf-lib";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const source = fs.readFileSync(
  new URL("../src/lib/integrated-exam-documents.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const module = { exports: {} };
const serviceCalls = [];
vm.runInNewContext(compiled, {
  module,
  exports: module.exports,
  Buffer,
  Array,
  Uint8Array,
  require: (id) => {
    if (id === "pdf-lib") return require(id);
    if (id === "@/lib/integrated-exam-review")
      return {
        isReviewItemRelevantForStudent: (_program, student, item) =>
          student.target_grade === item.grade,
      };
    return new Proxy(
      {},
      {
        get:
          (_target, name) =>
          async (...args) => {
            serviceCalls.push({ name, args });
            if (name === "examsRootFolderId") return "root";
            if (name === "getGoogleDriveAccessToken") return "mock-token";
            if (name === "ensureStudentExamFolder") return "folder";
            if (name === "uploadPdfToDrive") return { id: "mock-file" };
          },
      },
    );
  },
});
const drawing = [];
const pdfLib = require("pdf-lib");
const originalCreate = pdfLib.PDFDocument.create.bind(pdfLib.PDFDocument);
pdfLib.PDFDocument.create = async (...args) => {
  const document = await originalCreate(...args);
  const addPage = document.addPage.bind(document);
  document.addPage = (...pageArgs) => {
    const page = addPage(Array.from(pageArgs[0]));
    const drawText = page.drawText.bind(page);
    page.drawText = (text, options) => {
      drawing.push(text);
      return drawText(text, options);
    };
    return page;
  };
  return document;
};
const item = {
  id: "item",
  name: "Tecnica 日本",
  source: "syllabus",
  section: null,
  summary: "Descripcion",
  grade: "3 KYU",
  category: null,
  weight: 1,
  order_index: 0,
  active: true,
};
const args = {
  event: {
    title: "Examen",
    exam_date: "2026-10-31",
    program_type: "adults",
    pass_percentage: 70,
  },
  student: {
    id: "student",
    member_id: "member",
    current_grade: "4 KYU",
    target_grade: "3 KYU",
    members: {
      display_name: "Alumno 日本",
      legacy_id: null,
      class: "adults",
      grade: "4 KYU",
    },
  },
  items: [
    item,
    { ...item, id: "other", name: "IRRELEVANT", grade: "1 DAN" },
    { ...item, id: "cut", name: "CUT", source: "cut" },
    { ...item, id: "zero", name: "ZERO WEIGHT", weight: 0 },
    { ...item, id: "negative", name: "NEGATIVE WEIGHT", weight: -1 },
  ],
  examiners: [
    { id: "valid", name: "Examinador", submitted_at: "now", revoked_at: null },
    { id: "draft", name: "DRAFT", submitted_at: null, revoked_at: null },
  ],
  scores: [
    {
      event_student_id: "student",
      event_item_id: "item",
      examiner_id: "valid",
      score: 0,
      skipped: false,
      notes:
        "Comentario original " +
        "Observacion extensa. ".repeat(500) +
        " FIN ORIGINAL",
    },
    {
      event_student_id: "student",
      event_item_id: "item",
      examiner_id: "draft",
      score: 10,
      skipped: false,
      notes: "DRAFT NOTE",
    },
  ],
  summary: {
    studentId: "student",
    percentage: 90,
    passed: false,
    scoredItems: 1,
    totalItems: 1,
  },
  review: {
    version: 1,
    adjustments: { item: { score: 9, notes: "Correccion administrativa" } },
    decision: "fail",
    conclusion: "Motivo explicito: suspenso sobre umbral.",
    sourceSignature: "source",
  },
};
const pdf = await module.exports.renderIntegratedExamReportPdf(args);
assert.ok((await PDFDocument.load(pdf)).getPageCount() > 2);
const text = drawing.join("\n");
for (const expected of [
  "NO APTO",
  "Media original: 0.0/10",
  "Nota efectiva: 9.0/10",
  "FIN ORIGINAL",
  "Correccion administrativa",
  "Motivo explicito",
  "[U+65E5]",
])
  assert.ok(text.includes(expected), expected);
for (const omitted of [
  "IRRELEVANT",
  "CUT",
  "DRAFT NOTE",
  "ZERO WEIGHT",
  "NEGATIVE WEIGHT",
])
  assert.ok(!text.includes(omitted), omitted);
drawing.length = 0;
await module.exports.renderIntegratedExamReportPdf({
  ...args,
  summary: { ...args.summary, percentage: 30, passed: true },
  review: { ...args.review, decision: "pass" },
});
assert.ok(drawing.some((line) => line === "Decision final: APTO"));
console.log(
  "Integrated exam report checks passed (pure PDF rendering, no external writes).",
);

assert.equal(
  serviceCalls.length,
  0,
  "Pure rendering calls no external service",
);
const failedUrl =
  await module.exports.generateIntegratedExamDocumentsForStudent({
    ...args,
    examId: null,
    createdBy: "admin",
  });
assert.equal(failedUrl, "https://drive.google.com/file/d/mock-file/view");
assert.equal(
  serviceCalls.filter((call) => call.name === "saveExamReport").length,
  0,
);
await module.exports.generateIntegratedExamDocumentsForStudent({
  ...args,
  examId: "official-id",
  review: { ...args.review, decision: "pass" },
  summary: { ...args.summary, passed: true },
  createdBy: "admin",
});
const savedReports = serviceCalls.filter(
  (call) => call.name === "saveExamReport",
);
assert.equal(savedReports.length, 1);
assert.equal(savedReports[0].args[0].examId, "official-id");
assert.equal(savedReports[0].args[0].reportUrl, failedUrl);
console.log(
  "Report wrapper checks passed with mocked Drive and official report writes.",
);

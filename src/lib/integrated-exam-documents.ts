import { PDFDocument, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { decodeScoreNotes } from "@/lib/integrated-exam-session";
import {
  isReviewItemRelevantForStudent,
  type ReviewEnvelope,
} from "@/lib/integrated-exam-review";
import { ensureStudentExamFolder, examsRootFolderId } from "@/lib/diplomas";
import { saveExamReport } from "@/lib/exams";
import {
  getGoogleDriveAccessToken,
  makeDriveFilePublic,
  uploadPdfToDrive,
} from "@/lib/google-drive-api";

type EventData = {
  title: string;
  exam_date: string;
  program_type: string;
  pass_percentage: number;
};

type StudentData = {
  id: string;
  member_id: string;
  current_grade: string | null;
  target_grade: string | null;
  members?: {
    legacy_id: string | null;
    display_name: string;
    class: "kids" | "adults";
    grade: string | null;
  } | null;
};

type ItemData = {
  id: string;
  source: string;
  section: string | null;
  name: string;
  summary: string | null;
  grade: string | null;
  category: string | null;
  weight: number;
  order_index: number;
  active: boolean;
};

type ExaminerData = {
  id: string;
  name: string;
  submitted_at: string | null;
  revoked_at: string | null;
};

type ScoreData = {
  event_student_id: string;
  event_item_id: string;
  examiner_id: string;
  score: number | null;
  skipped: boolean;
  notes?: string | null;
};

type SummaryData = {
  studentId: string;
  percentage: number;
  passed: boolean;
  scoredItems: number;
  totalItems: number;
};

export async function generateIntegratedExamDocumentsForStudent({
  examId,
  event,
  student,
  items,
  examiners,
  scores,
  summary,
  review,
  createdBy,
}: {
  examId?: string | null;
  event: EventData;
  student: StudentData;
  items: ItemData[];
  examiners: ExaminerData[];
  scores: ScoreData[];
  summary: SummaryData;
  review?: ReviewEnvelope;
  createdBy: string;
}) {
  const member = student.members;
  if (!member?.display_name)
    throw new Error("El alumno no tiene nombre para generar el informe.");

  const accessToken = await getGoogleDriveAccessToken();
  const folderId = await ensureStudentExamFolder({
    accessToken,
    rootFolderId: examsRootFolderId(),
    legacyId: member.legacy_id,
    name: member.display_name,
    memberClass: member.class,
  });
  const pdf = await renderIntegratedExamReportPdf({
    event,
    student,
    items,
    examiners,
    scores,
    summary,
    review,
  });
  const fileName = `Informe_${formatCompactDate(event.exam_date)}_${cleanFileName(member.display_name)}_${cleanFileName(student.target_grade || "examen")}.pdf`;
  const file = await uploadPdfToDrive({ accessToken, folderId, fileName, pdf });
  await makeDriveFilePublic(accessToken, file.id);
  const url = `https://drive.google.com/file/d/${file.id}/view`;

  if (examId)
    await saveExamReport({
      examId,
      reportUrl: url,
      reportType:
        event.program_type === "kids_progressive" ||
        event.program_type === "kids"
          ? "Infantil"
          : "Adultos",
      reportFileName: fileName,
      createdBy,
    });

  return url;
}

export async function renderIntegratedExamReportPdf({
  event,
  student,
  items,
  examiners,
  scores,
  summary,
  review,
}: {
  event: EventData;
  student: StudentData;
  items: ItemData[];
  examiners: ExaminerData[];
  scores: ScoreData[];
  summary: SummaryData;
  review?: ReviewEnvelope;
}) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage;
  let y = 0;
  const ink = rgb(0.04, 0.09, 0.18);
  const muted = rgb(0.35, 0.39, 0.45);
  // Standard PDF fonts cannot encode every script. Make unsupported characters
  // visible as code points rather than silently discarding user observations.
  function printable(value: string) {
    return Array.from(value)
      .map((character) => {
        if (["\n", "\r", "\t"].includes(character)) return character;
        try {
          regular.encodeText(character);
          return character;
        } catch {
          return (
            "[U+" + character.codePointAt(0)!.toString(16).toUpperCase() + "]"
          );
        }
      })
      .join("");
  }
  function newPage() {
    page = pdfDoc.addPage([595, 842]);
    y = 788;
    page.drawText("SKBC Gipuzkoa | Informe de examen", {
      x: 42,
      y,
      size: 14,
      font: bold,
      color: ink,
    });
    y -= 30;
  }
  function paragraph(
    value: string,
    options: { bold?: boolean; size?: number; indent?: number } = {},
  ) {
    const font = options.bold ? bold : regular;
    const size = options.size ?? 10;
    const x = 42 + (options.indent ?? 0);
    const width = 510 - (options.indent ?? 0);
    const lines: string[] = [];
    for (const block of printable(value).replace(/\r/g, "").split("\n")) {
      let line = "";
      for (const character of block.replace(/\t/g, "    ")) {
        if (line && font.widthOfTextAtSize(line + character, size) > width) {
          const space = line.lastIndexOf(" ");
          if (space > line.length / 2) {
            lines.push(line.slice(0, space));
            line = line.slice(space + 1);
          } else {
            lines.push(line);
            line = "";
          }
        }
        line += character;
      }
      lines.push(line);
    }
    for (const line of lines) {
      if (y < 63 + size) newPage();
      page.drawText(line, {
        x,
        y,
        size,
        font,
        color: options.bold ? ink : muted,
      });
      y -= size + 5;
    }
    y -= 4;
  }
  newPage();
  paragraph(student.members?.display_name ?? "Kenshi", {
    bold: true,
    size: 21,
  });
  paragraph(event.title + " | " + formatDate(event.exam_date));
  paragraph(
    "Grado actual: " +
      (student.current_grade || "Sin grado") +
      " | Objetivo: " +
      (student.target_grade || "Sin objetivo"),
  );
  const decision = review ? review.decision : summary.passed ? "pass" : "fail";
  paragraph(
    "Decision final: " +
      (decision === "pass"
        ? "APTO"
        : decision === "fail"
          ? "NO APTO"
          : "PENDIENTE DE REVISION"),
    { bold: true, size: 16 },
  );
  paragraph(
    "Puntuacion efectiva: " +
      summary.percentage +
      "% | Umbral orientativo: " +
      event.pass_percentage +
      "% | Puntos evaluados: " +
      summary.scoredItems +
      "/" +
      summary.totalItems,
  );
  paragraph(
    decision === "pass"
      ? "Decision del responsable: aprobado para el grado objetivo."
      : decision === "fail"
        ? "Decision del responsable: suspenso; conserva su grado actual."
        : "El responsable aun no ha confirmado la decision final.",
  );
  if (review?.conclusion) {
    paragraph("Conclusion y motivo de revision", { bold: true, size: 13 });
    paragraph(review.conclusion);
  }
  const submitted = examiners.filter(
    (examiner) => examiner.submitted_at && !examiner.revoked_at && scores.some((score)=>score.event_student_id===student.id&&score.examiner_id===examiner.id),
  );
  const submittedIds = new Set(submitted.map((examiner) => examiner.id));
  const sessionScores = scores.filter(
    (score) =>
      score.event_student_id === student.id &&
      submittedIds.has(score.examiner_id),
  );
  for (const score of sessionScores) {
    const session = decodeScoreNotes(score.notes);
    const examinerName =
      submitted.find((examiner) => examiner.id === score.examiner_id)?.name ??
      "Examinador";
    for (const movement of session.adjustments) {
      paragraph(
        `${examinerName}: ${movement.delta > 0 ? "+" : ""}${movement.delta} punto acumulado. Motivo: ${movement.reason}`,
      );
    }
    if (session.stop) {
      const lastItem = items.find(
        (item) => item.id === session.stop!.afterItemId,
      );
      paragraph(
        `${examinerName}: finalizacion anticipada despues de ${lastItem?.name ?? "la ultima actividad completada"}. Motivo: ${session.stop.reason}`,
        { bold: true },
      );
    }
  }
  const rows = items
    .filter(
      (item) =>
        item.active &&
        Number.isFinite(item.weight) &&
        item.weight > 0 &&
        item.source !== "cut" &&
        isReviewItemRelevantForStudent(event.program_type, student, item),
    )
    .sort((a, b) => a.order_index - b.order_index)
    .map((item) => {
      const originals = scores.filter(
        (score) =>
          score.event_student_id === student.id &&
          score.event_item_id === item.id &&
          submittedIds.has(score.examiner_id),
      );
      const valid = originals.filter(
        (score) =>
          !score.skipped &&
          typeof score.score === "number" &&
          Number.isFinite(score.score) &&
          score.score >= 0 &&
          score.score <= 10,
      );
      const original = valid.length
        ? valid.reduce((sum, score) => sum + score.score!, 0) / valid.length
        : null;
      const outsideRoute =
        originals.length > 0 &&
        originals.every((score) => decodeScoreNotes(score.notes).outsideRoute);
      const adjustment = outsideRoute
        ? undefined
        : review?.adjustments[item.id];
      return {
        item,
        originals,
        original,
        adjustment,
        outsideRoute,
        effective: adjustment?.score ?? original,
      };
    });
  paragraph("Puntos con menor puntuacion efectiva", { bold: true, size: 13 });
  const lowest = rows
    .filter((row) => row.effective !== null)
    .sort((a, b) => a.effective! - b.effective!)
    .slice(0, 5);
  paragraph(
    lowest.length
      ? lowest
          .map(
            (row) => row.item.name + ": " + row.effective!.toFixed(1) + "/10",
          )
          .join("; ")
      : "Sin puntuaciones evaluadas.",
  );
  paragraph("Detalle de evaluaciones originales y revision", {
    bold: true,
    size: 13,
  });
  for (const row of rows) {
    if (y < 120) newPage();
    paragraph(
      row.item.name +
        " | " +
        (row.item.grade || "-") +
        " | " +
        (row.item.section || row.item.category || "Item"),
      { bold: true, size: 11 },
    );
    if (row.item.summary) paragraph(row.item.summary, { size: 9 });
    paragraph(
      "Media original: " +
        (row.outsideRoute
          ? "No realizado (fuera del recorrido evaluado)"
          : row.original === null
            ? "No evaluado"
            : row.original.toFixed(1) + "/10") +
        " | Nota efectiva: " +
        (row.effective === null
          ? "No evaluado"
          : row.effective.toFixed(1) + "/10"),
      { bold: true },
    );
    for (const examiner of submitted) {
      const original = row.originals.find(
        (score) => score.examiner_id === examiner.id,
      );
      paragraph(
        examiner.name +
          ": " +
          (original && decodeScoreNotes(original.notes).outsideRoute
            ? "No realizado (fuera del recorrido evaluado)"
            : !original || original.skipped || original.score === null
              ? "No evaluado"
              : original.score + "/10"),
        { indent: 10 },
      );
      const observation = decodeScoreNotes(original?.notes).text;
      if (observation)
        paragraph("Recomendaciones de " + examiner.name + ": " + observation, {
          indent: 10,
        });
    }
    if (row.adjustment) {
      paragraph("Ajuste del responsable: " + row.adjustment.score + "/10", {
        bold: true,
        indent: 10,
      });
      if (row.adjustment.notes)
        paragraph("Motivo / observaciones: " + row.adjustment.notes, {
          indent: 10,
        });
    }
    y -= 10;
  }
  const pages = pdfDoc.getPages();
  pages.forEach((reportPage, index) =>
    reportPage.drawText("SKBC | " + (index + 1) + "/" + pages.length, {
      x: 42,
      y: 30,
      size: 8,
      font: regular,
      color: muted,
    }),
  );
  return Buffer.from(await pdfDoc.save());
}

function formatDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function formatCompactDate(value: string) {
  return value.replace(/-/g, "");
}

function cleanFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 70);
}

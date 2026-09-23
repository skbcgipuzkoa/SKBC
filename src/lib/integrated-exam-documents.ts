import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { ensureStudentExamFolder, examsRootFolderId } from "@/lib/diplomas";
import { saveExamReport } from "@/lib/exams";
import { getGoogleDriveAccessToken, makeDriveFilePublic, uploadPdfToDrive } from "@/lib/google-drive-api";

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
  createdBy
}: {
  examId: string;
  event: EventData;
  student: StudentData;
  items: ItemData[];
  examiners: ExaminerData[];
  scores: ScoreData[];
  summary: SummaryData;
  createdBy: string;
}) {
  const member = student.members;
  if (!member?.display_name) throw new Error("El alumno no tiene nombre para generar el informe.");

  const accessToken = await getGoogleDriveAccessToken();
  const folderId = await ensureStudentExamFolder({
    accessToken,
    rootFolderId: examsRootFolderId(),
    legacyId: member.legacy_id,
    name: member.display_name,
    memberClass: member.class
  });
  const pdf = await renderIntegratedExamReportPdf({ event, student, items, examiners, scores, summary });
  const fileName = `Informe_${formatCompactDate(event.exam_date)}_${cleanFileName(member.display_name)}_${cleanFileName(student.target_grade || "examen")}.pdf`;
  const file = await uploadPdfToDrive({ accessToken, folderId, fileName, pdf });
  await makeDriveFilePublic(accessToken, file.id);
  const url = `https://drive.google.com/file/d/${file.id}/view`;

  await saveExamReport({
    examId,
    reportUrl: url,
    reportType: event.program_type === "kids_progressive" || event.program_type === "kids" ? "Infantil" : "Adultos",
    reportFileName: fileName,
    createdBy
  });

  return url;
}

async function renderIntegratedExamReportPdf({
  event,
  student,
  items,
  examiners,
  scores,
  summary
}: {
  event: EventData;
  student: StudentData;
  items: ItemData[];
  examiners: ExaminerData[];
  scores: ScoreData[];
  summary: SummaryData;
}) {
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);
  let page = pdfDoc.addPage([595, 842]);
  let y = 785;

  const colors = {
    navy: rgb(0.04, 0.09, 0.18),
    blue: rgb(0, 0.35, 0.73),
    gold: rgb(0.74, 0.54, 0.18),
    muted: rgb(0.38, 0.43, 0.52),
    light: rgb(0.95, 0.97, 1),
    green: rgb(0.05, 0.55, 0.25),
    red: rgb(0.75, 0.08, 0.08)
  };

  page.drawRectangle({ x: 0, y: 742, width: 595, height: 100, color: colors.navy });
  page.drawRectangle({ x: 0, y: 738, width: 595, height: 4, color: colors.gold });
  page.drawText("SKBC Gipuzkoa", { x: 42, y: 794, size: 22, font: bold, color: rgb(1, 1, 1) });
  page.drawText("Informe oficial de examen", { x: 42, y: 766, size: 13, font: regular, color: rgb(0.88, 0.92, 1) });
  page.drawText(formatDate(event.exam_date), { x: 430, y: 777, size: 13, font: bold, color: rgb(1, 1, 1) });

  y = 700;
  page.drawText(student.members?.display_name ?? "Kenshi", { x: 42, y, size: fitText(student.members?.display_name ?? "Kenshi", 28, 430, bold), font: bold, color: colors.navy });
  y -= 28;
  page.drawText(`${student.members?.class === "kids" ? "Ficha infantil" : "Ficha adulta"} - ${student.current_grade || "Sin grado"} -> ${student.target_grade || "Sin objetivo"}`, { x: 42, y, size: 13, font: regular, color: colors.muted });

  y -= 52;
  drawMetric(page, { x: 42, y, title: "Resultado", value: summary.passed ? "APTO" : "REVISAR", note: `${summary.percentage}%`, color: summary.passed ? colors.green : colors.red, bold, regular });
  drawMetric(page, { x: 220, y, title: "Items evaluados", value: `${summary.scoredItems}/${summary.totalItems}`, note: "puntuaciones validas", color: colors.blue, bold, regular });
  drawMetric(page, { x: 398, y, title: "Minimo", value: `${event.pass_percentage}%`, note: "para aprobar", color: colors.gold, bold, regular });

  y -= 105;
  page.drawText("Resumen", { x: 42, y, size: 18, font: bold, color: colors.navy });
  y -= 28;
  const intro = summary.passed
    ? "El examen queda registrado como aprobado tras la revision del responsable. El grado se actualiza en la ficha personal y queda enlazado con su informe y diploma."
    : "El examen queda guardado para revision. El responsable puede ajustar el resultado final antes de registrar oficialmente el cambio de grado.";
  y = drawParagraph(page, intro, { x: 42, y, width: 500, font: regular, size: 11, lineHeight: 16, color: colors.muted });

  y -= 18;
  page.drawText("Examinadores", { x: 42, y, size: 15, font: bold, color: colors.navy });
  y -= 21;
  const submitted = examiners.filter((examiner) => examiner.submitted_at && !examiner.revoked_at);
  y = drawParagraph(page, submitted.map((examiner) => examiner.name).join(", ") || "Sin evaluaciones enviadas", { x: 42, y, width: 500, font: regular, size: 11, lineHeight: 15, color: colors.muted });

  y -= 18;
  page.drawText("Detalle evaluado", { x: 42, y, size: 15, font: bold, color: colors.navy });
  y -= 18;

  const rows = items
    .filter((item) => item.active && item.source !== "cut")
    .map((item) => ({ item, average: averageScore(scores.filter((score) => score.event_student_id === student.id && score.event_item_id === item.id && !score.skipped && score.score !== null)) }))
    .filter((row) => row.average !== null || row.item.grade === student.target_grade || student.members?.class === "kids")
    .slice(0, 80);

  for (const row of rows) {
    if (y < 72) {
      page = pdfDoc.addPage([595, 842]);
      y = 790;
    }
    page.drawRectangle({ x: 42, y: y - 11, width: 510, height: 24, color: colors.light });
    page.drawText(row.item.name, { x: 52, y, size: 10, font: bold, color: colors.navy });
    page.drawText(`${row.item.grade || "-"} - ${row.item.section || row.item.category || "item"}`, { x: 290, y, size: 9, font: regular, color: colors.muted });
    page.drawText(row.average === null ? "-" : `${row.average.toFixed(1)}/10`, { x: 500, y, size: 10, font: bold, color: row.average !== null && row.average >= 7 ? colors.green : colors.muted });
    y -= 28;
    if (row.item.summary) {
      y = drawParagraph(page, row.item.summary, { x: 52, y, width: 470, font: italic, size: 8.5, lineHeight: 12, color: colors.muted, maxLines: 2 });
      y -= 8;
    }
  }

  page.drawText("Documento generado por el sistema nuevo SKBC. Los PDFs se guardan en Google Drive y Supabase conserva solo el enlace.", {
    x: 42,
    y: 30,
    size: 8,
    font: regular,
    color: colors.muted
  });

  return Buffer.from(await pdfDoc.save());
}

function drawMetric(
  page: PDFPage,
  { x, y, title, value, note, color, bold, regular }: { x: number; y: number; title: string; value: string; note: string; color: ReturnType<typeof rgb>; bold: PDFFont; regular: PDFFont }
) {
  page.drawRectangle({ x, y: y - 44, width: 155, height: 66, borderColor: rgb(0.86, 0.9, 0.95), borderWidth: 1, color: rgb(0.98, 0.99, 1) });
  page.drawText(title, { x: x + 14, y: y - 4, size: 10, font: bold, color: rgb(0.38, 0.43, 0.52) });
  page.drawText(value, { x: x + 14, y: y - 31, size: 20, font: bold, color });
  page.drawText(note, { x: x + 78, y: y - 27, size: 9, font: regular, color: rgb(0.38, 0.43, 0.52) });
}

function drawParagraph(page: PDFPage, text: string, options: { x: number; y: number; width: number; font: PDFFont; size: number; lineHeight: number; color: ReturnType<typeof rgb>; maxLines?: number }) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (options.font.widthOfTextAtSize(next, options.size) <= options.width || !current) {
      current = next;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  const visible = options.maxLines ? lines.slice(0, options.maxLines) : lines;
  visible.forEach((line, index) => {
    page.drawText(line, { x: options.x, y: options.y - index * options.lineHeight, size: options.size, font: options.font, color: options.color });
  });
  return options.y - visible.length * options.lineHeight;
}

function averageScore(scores: ScoreData[]) {
  if (!scores.length) return null;
  return scores.reduce((sum, score) => sum + Number(score.score ?? 0), 0) / scores.length;
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

function fitText(text: string, preferredSize: number, maxWidth: number, font: PDFFont) {
  let size = preferredSize;
  while (size > 16 && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 1;
  }
  return size;
}

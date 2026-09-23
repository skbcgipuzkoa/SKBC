import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { ensureDriveFolder, getGoogleDriveAccessToken, makeDriveFilePublic, uploadPdfToDrive } from "@/lib/google-drive-api";
import { createAdminClient } from "@/lib/supabase/admin";

type ExamForDiploma = {
  id: string;
  exam_date: string;
  grade: string;
  diploma_url: string | null;
  diploma_registry: string | null;
  members: {
    legacy_id: string | null;
    display_name: string;
    class: "kids" | "adults";
  } | null;
};

const gradeEu: Record<string, string> = {
  BLANCO: "ZURIA",
  "BLANCO-AMARILLO": "ZURI-HORIA",
  AMARILLO: "HORIA",
  "AMARILLO-NARANJA": "HORI-LARANJA",
  NARANJA: "LARANJA",
  "NARANJA-VERDE": "LARANJA-BERDEA",
  VERDE: "BERDEA",
  "VERDE-AZUL": "BERDE-URDINA",
  AZUL: "URDINA",
  "AZUL-MARRON": "URDIN-MARROIA",
  MARRON: "MARROIA"
};

const monthsEs = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const monthsEu = ["Urtarrilak", "Otsailak", "Martxoak", "Apirilak", "Maiatzak", "Ekainak", "Uztailak", "Abuztuak", "Irailak", "Urriak", "Azaroak", "Abenduak"];

export async function generateDiplomaForExam(examId: string) {
  const supabase = createAdminClient();
  const { data: exam, error } = await supabase
    .from("exams")
    .select("id,exam_date,grade,diploma_url,diploma_registry,members(legacy_id,display_name,class)")
    .eq("id", examId)
    .single<ExamForDiploma>();

  if (error || !exam) throw new Error("Examen no encontrado.");
  if (exam.diploma_url) return exam.diploma_url;
  if (!exam.members?.display_name) throw new Error("El examen no tiene kenshi vinculado.");

  const rootFolderId = examsRootFolderId();
  const accessToken = await getGoogleDriveAccessToken();
  const folderId = await ensureStudentExamFolder({
    accessToken,
    rootFolderId,
    legacyId: exam.members.legacy_id,
    name: exam.members.display_name,
    memberClass: exam.members.class
  });
  const examDate = parseDate(exam.exam_date);
  const registry = exam.diploma_registry || await reserveDiplomaRegistry(supabase, exam.id, exam.exam_date);
  const diploma = await generateDiplomaPdf({
    accessToken,
    folderId,
    name: exam.members.display_name,
    grade: exam.grade,
    examDate,
    registry
  });

  try {
    const { error: updateError } = await supabase
      .from("exams")
      .update({
        diploma_url: diploma.url,
        diploma_registry: registry
      })
      .eq("id", exam.id);

    if (updateError) throw updateError;
    return diploma.url;
  } catch (error) {
    throw error;
  }
}

async function reserveDiplomaRegistry(
  supabase: ReturnType<typeof createAdminClient>,
  examId: string,
  examDate: string
) {
  const { data, error } = await supabase.rpc("next_diploma_registry", { registry_date: examDate });
  if (error || !data) throw new Error("No se ha podido crear el registro del diploma.");
  const registry = String(data);
  const { error: updateError } = await supabase
    .from("exams")
    .update({ diploma_registry: registry })
    .eq("id", examId);
  if (updateError) throw updateError;
  return registry;
}

export async function verifyDiplomaSetup() {
  const folderId = examsRootFolderId();
  const accessToken = await getGoogleDriveAccessToken();
  return generateDiplomaPdf({
    accessToken,
    folderId,
    name: "PRUEBA SKBC",
    grade: "5 KYU",
    examDate: new Date(),
    registry: "TEST"
  });
}

async function generateDiplomaPdf({
  accessToken,
  folderId,
  name,
  grade,
  examDate,
  registry
}: {
  accessToken: string;
  folderId: string;
  name: string;
  grade: string;
  examDate: Date;
  registry: string;
}) {
  const fileBaseName = `Diploma_${formatCompactDate(examDate)}_${cleanFileName(name)}_${cleanFileName(grade)}`;
  const pdf = await renderDiplomaPdf({ name, grade, examDate, registry });
  const pdfFile = await uploadPdfToDrive({
    accessToken,
    folderId,
    fileName: `${fileBaseName}.pdf`,
    pdf
  });

  await makeDriveFilePublic(accessToken, pdfFile.id);

  return {
    id: pdfFile.id,
    fileName: `${fileBaseName}.pdf`,
    url: `https://drive.google.com/file/d/${pdfFile.id}/view`
  };
}

async function renderDiplomaPdf({
  name,
  grade,
  examDate,
  registry
}: {
  name: string;
  grade: string;
  examDate: Date;
  registry: string;
}) {
  const backgroundPath = path.join(process.cwd(), "private", "diploma-background.png");
  const backgroundBytes = await readFile(backgroundPath);
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([841, 595]);
  const background = await pdfDoc.embedPng(backgroundBytes);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const black = rgb(0, 0, 0);
  page.drawImage(background, { x: 0, y: 0, width: 841, height: 595 });

  drawCenteredText(page, name, {
    font: bold,
    size: fitFontSize(name, 44, 640, bold),
    x: 79,
    y: 313,
    width: 685,
    color: black
  });

  drawWrappedText(page, `Ha realizado y culminado con éxito el examen de ${grade}. Para que así conste, hoy ${formatDateEs(examDate)}, hacemos entrega del presente certificado.`, {
    font: italic,
    size: 16,
    x: 112,
    y: 282,
    width: 310,
    lineHeight: 19,
    color: black
  });

  drawWrappedText(page, `${translateGradeEu(grade)} azterketa egin eta gainditu du. Hala jakinarazten dugu gaur, ${formatDateEu(examDate)}, agiri honen bidez.`, {
    font: italic,
    size: 16,
    x: 464,
    y: 282,
    width: 300,
    lineHeight: 19,
    color: black
  });

  page.drawText(`Reg.: ${registry}`, {
    font: bold,
    size: 12,
    x: 610,
    y: 224,
    color: black
  });

  return Buffer.from(await pdfDoc.save());
}

export async function ensureStudentExamFolder({
  accessToken,
  rootFolderId,
  legacyId,
  name,
  memberClass
}: {
  accessToken: string;
  rootFolderId: string;
  legacyId: string | null;
  name: string;
  memberClass: "kids" | "adults";
}) {
  const classFolder = await ensureDriveFolder({
    accessToken,
    parentFolderId: rootFolderId,
    name: memberClass === "kids" ? "Ninos" : "Adultos"
  });
  return ensureDriveFolder({
    accessToken,
    parentFolderId: classFolder,
    name: `${legacyId ? `${legacyId} - ` : ""}${cleanFileNameForFolder(name)}`
  });
}

export function examsRootFolderId() {
  return optionalEnv("SKBC_EXAMS_DRIVE_FOLDER_ID") || requiredEnv("DIPLOMA_EXAMEN_FOLDER_ID");
}

function translateGradeEu(grade: string) {
  const key = grade.trim().toUpperCase();
  if (/^\d+\s*(KYU|DAN)$/.test(key)) return key;
  return gradeEu[key] ?? key;
}

function formatDateEs(date: Date) {
  return `${date.getDate()} de ${monthsEs[date.getMonth()]} de ${date.getFullYear()}`;
}

function formatDateEu(date: Date) {
  return `${date.getFullYear()}ko ${monthsEu[date.getMonth()]} ${date.getDate()}an`;
}

function formatCompactDate(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

function parseDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) throw new Error("Fecha de examen no valida.");
  return date;
}

function cleanFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

function cleanFileNameForFolder(value: string) {
  return cleanFileName(value).replace(/_/g, " ") || "Kenshi";
}

function optionalEnv(name: string) {
  return process.env[name]?.trim() || "";
}

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function drawCenteredText(
  page: PDFPage,
  text: string,
  options: {
    font: PDFFont;
    size: number;
    x: number;
    y: number;
    width: number;
    color: ReturnType<typeof rgb>;
  }
) {
  const textWidth = options.font.widthOfTextAtSize(text, options.size);
  page.drawText(text, {
    font: options.font,
    size: options.size,
    x: options.x + Math.max(0, (options.width - textWidth) / 2),
    y: options.y,
    color: options.color
  });
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  options: {
    font: PDFFont;
    size: number;
    x: number;
    y: number;
    width: number;
    lineHeight: number;
    color: ReturnType<typeof rgb>;
  }
) {
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

  lines.forEach((line, index) => {
    page.drawText(line, {
      font: options.font,
      size: options.size,
      x: options.x,
      y: options.y - index * options.lineHeight,
      color: options.color
    });
  });
}

function fitFontSize(text: string, preferredSize: number, maxWidth: number, font: PDFFont) {
  let size = preferredSize;
  while (size > 24 && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 1;
  }
  return size;
}

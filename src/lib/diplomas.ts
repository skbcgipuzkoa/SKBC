import { createSign } from "crypto";
import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from "pdf-lib";
import { createAdminClient } from "@/lib/supabase/admin";

type ExamForDiploma = {
  id: string;
  exam_date: string;
  grade: string;
  diploma_url: string | null;
  members: {
    legacy_id: string | null;
    display_name: string;
  } | null;
};

const scopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/presentations"
].join(" ");

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
    .select("id,exam_date,grade,diploma_url,members(legacy_id,display_name)")
    .eq("id", examId)
    .single<ExamForDiploma>();

  if (error || !exam) throw new Error("Examen no encontrado.");
  if (exam.diploma_url) return exam.diploma_url;
  if (!exam.members?.display_name) throw new Error("El examen no tiene kenshi vinculado.");

  const folderId = requiredEnv("DIPLOMA_EXAMEN_FOLDER_ID");
  const accessToken = await getGoogleAccessToken();
  const examDate = parseDate(exam.exam_date);
  const diploma = await generateDiplomaPdf({
    accessToken,
    folderId,
    name: exam.members.display_name,
    grade: exam.grade,
    examDate,
    registry: exam.members.legacy_id ?? ""
  });

  try {
    const { error: updateError } = await supabase
      .from("exams")
      .update({
        diploma_url: diploma.url,
        report_url: diploma.url,
        report_created_at: new Date().toISOString(),
        report_created_by: "WEB SKBC",
        report_type: "Diploma",
        report_file_name: diploma.fileName
      })
      .eq("id", exam.id);

    if (updateError) throw updateError;
    return diploma.url;
  } catch (error) {
    throw error;
  }
}

export async function verifyDiplomaSetup() {
  const folderId = requiredEnv("DIPLOMA_EXAMEN_FOLDER_ID");
  const accessToken = await getGoogleAccessToken();
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

  await googleJson(
    `https://www.googleapis.com/drive/v3/files/${pdfFile.id}/permissions?supportsAllDrives=true`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({ role: "reader", type: "anyone" })
    }
  );

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
  const templatePath = path.join(process.cwd(), "private", "diploma-template.pdf");
  const templateBytes = await readFile(templatePath);
  const pdfDoc = await PDFDocument.load(templateBytes);
  const page = pdfDoc.getPages()[0];
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const black = rgb(0, 0, 0);
  const white = rgb(1, 1, 1);

  page.drawRectangle({ x: 50, y: 294, width: 741, height: 76, color: white });
  page.drawRectangle({ x: 78, y: 185, width: 365, height: 135, color: white });
  page.drawRectangle({ x: 420, y: 185, width: 365, height: 135, color: white });
  page.drawRectangle({ x: 620, y: 124, width: 175, height: 42, color: white });
  page.drawRectangle({ x: 672, y: 52, width: 120, height: 18, color: white });

  drawCenteredText(page, name, {
    font: bold,
    size: fitFontSize(name, 44, 690, bold),
    x: 50,
    y: 318,
    width: 741,
    color: black
  });

  drawWrappedText(page, `Ha realizado y culminado con éxito el examen de ${grade}. Para que así conste, hoy ${formatDateEs(examDate)}, hacemos entrega del presente certificado.`, {
    font: italic,
    size: 13,
    x: 126,
    y: 278,
    width: 285,
    lineHeight: 16,
    color: black
  });

  drawWrappedText(page, `${translateGradeEu(grade)} azterketa egin eta gainditu du. Hala jakinarazten dugu gaur, ${formatDateEu(examDate)}, agiri honen bidez.`, {
    font: italic,
    size: 13,
    x: 454,
    y: 278,
    width: 285,
    lineHeight: 16,
    color: black
  });

  page.drawText(`Reg.: ${registry}`, {
    font: bold,
    size: 11,
    x: 686,
    y: 57,
    color: black
  });

  return Buffer.from(await pdfDoc.save());
}

async function getGoogleAccessToken() {
  if (process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET && process.env.GOOGLE_OAUTH_REFRESH_TOKEN) {
    return getGoogleOAuthAccessToken();
  }

  const clientEmail = requiredEnv("GOOGLE_CLIENT_EMAIL");
  const privateKey = requiredEnv("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const jwtHeader = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const jwtClaim = base64Url(JSON.stringify({
    iss: clientEmail,
    scope: scopes,
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${jwtHeader}.${jwtClaim}`;
  const signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey);
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error(`Google auth error ${response.status}: ${await response.text()}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google no devolvio access_token.");
  return data.access_token;
}

async function getGoogleOAuthAccessToken() {
  const body = new URLSearchParams({
    client_id: requiredEnv("GOOGLE_OAUTH_CLIENT_ID"),
    client_secret: requiredEnv("GOOGLE_OAUTH_CLIENT_SECRET"),
    refresh_token: requiredEnv("GOOGLE_OAUTH_REFRESH_TOKEN"),
    grant_type: "refresh_token"
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });

  if (!response.ok) throw new Error(`Google OAuth error ${response.status}: ${await response.text()}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Google OAuth no devolvio access_token.");
  return data.access_token;
}

async function googleJson<T = unknown>(url: string, accessToken: string, init: RequestInit = {}) {
  const response = await fetch(url, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  if (!response.ok) throw new Error(`Google API error ${response.status}: ${await response.text()}`);
  return response.status === 204 ? ({} as T) : await response.json() as T;
}

async function uploadPdfToDrive({
  accessToken,
  folderId,
  fileName,
  pdf
}: {
  accessToken: string;
  folderId: string;
  fileName: string;
  pdf: Buffer;
}) {
  const boundary = `skbc_${Date.now()}`;
  const metadata = JSON.stringify({
    name: fileName,
    parents: [folderId],
    mimeType: "application/pdf"
  });
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\ncontent-type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\ncontent-type: application/pdf\r\n\r\n`),
    pdf,
    Buffer.from(`\r\n--${boundary}--`)
  ]);

  const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!response.ok) throw new Error(`Google upload error ${response.status}: ${await response.text()}`);
  return await response.json() as { id: string };
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

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta configurar ${name}.`);
  return value;
}

function base64Url(value: string | Buffer) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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

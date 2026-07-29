import { createSign } from "crypto";
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

  const templateId = requiredEnv("DIPLOMA_EXAMEN_TEMPLATE_ID");
  const folderId = requiredEnv("DIPLOMA_EXAMEN_FOLDER_ID");
  const accessToken = await getGoogleAccessToken();
  const examDate = parseDate(exam.exam_date);
  const fileBaseName = `Diploma_${formatCompactDate(examDate)}_${cleanFileName(exam.members.display_name)}_${cleanFileName(exam.grade)}`;

  const copy = await googleJson<{ id: string }>(
    `https://www.googleapis.com/drive/v3/files/${templateId}/copy?supportsAllDrives=true`,
    accessToken,
    {
      method: "POST",
      body: JSON.stringify({
        name: fileBaseName,
        parents: [folderId]
      })
    }
  );

  try {
    await googleJson(
      `https://slides.googleapis.com/v1/presentations/${copy.id}:batchUpdate`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          requests: [
            replaceText("{{NOMBRE}}", exam.members.display_name),
            replaceText("{{GRADO_ES}}", exam.grade),
            replaceText("{{GRADO_EU}}", translateGradeEu(exam.grade)),
            replaceText("{{FECHA_ES}}", formatDateEs(examDate)),
            replaceText("{{FECHA_EU}}", formatDateEu(examDate)),
            replaceText("{{REGISTRO}}", exam.members.legacy_id ?? "")
          ]
        })
      }
    );

    const pdf = await googleBinary(
      `https://www.googleapis.com/drive/v3/files/${copy.id}/export?mimeType=application/pdf`,
      accessToken
    );
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

    const pdfUrl = `https://drive.google.com/file/d/${pdfFile.id}/view`;
    const { error: updateError } = await supabase
      .from("exams")
      .update({
        diploma_url: pdfUrl,
        report_url: pdfUrl,
        report_created_at: new Date().toISOString(),
        report_created_by: "WEB SKBC",
        report_type: "Diploma",
        report_file_name: `${fileBaseName}.pdf`
      })
      .eq("id", exam.id);

    if (updateError) throw updateError;
    return pdfUrl;
  } finally {
    await googleJson(
      `https://www.googleapis.com/drive/v3/files/${copy.id}?supportsAllDrives=true`,
      accessToken,
      {
        method: "PATCH",
        body: JSON.stringify({ trashed: true })
      }
    ).catch((error) => console.error("Error trashing temporary diploma presentation", error));
  }
}

async function getGoogleAccessToken() {
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

async function googleBinary(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` }
  });
  if (!response.ok) throw new Error(`Google export error ${response.status}: ${await response.text()}`);
  return Buffer.from(await response.arrayBuffer());
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

function replaceText(text: string, replaceTextValue: string) {
  return {
    replaceAllText: {
      containsText: {
        text,
        matchCase: true
      },
      replaceText: replaceTextValue
    }
  };
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

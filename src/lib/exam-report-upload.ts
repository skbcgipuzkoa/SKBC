import { createAdminClient } from "@/lib/supabase/admin";
import { findMemberForExternalExam, saveExamReport } from "@/lib/exams";

const bucketName = "exam-reports";
const maxPdfBytes = 12 * 1024 * 1024;

type ExternalExamReportPayload = {
  memberId?: string;
  legacyId?: string;
  alumnoId?: string;
  alumnoRef?: string;
  alumno?: string;
  nombre?: string;
  fechaExamen?: string;
  examDate?: string;
  grado?: string;
  grade?: string;
  examinador?: string;
  registeredBy?: string;
  registradoPor?: string;
  informeTipo?: string;
  reportType?: string;
  informeNombreArchivo?: string;
  reportFileName?: string;
  informePdfBase64?: string;
  pdfBase64?: string;
};

export async function uploadExternalExamReport(payload: ExternalExamReportPayload) {
  const examDate = normalizeDate(payload.fechaExamen ?? payload.examDate);
  const grade = String(payload.grado ?? payload.grade ?? "").trim();
  const reportFileName = safeFileName(String(payload.informeNombreArchivo ?? payload.reportFileName ?? "informe-examen.pdf"));
  const reportType = String(payload.informeTipo ?? payload.reportType ?? "").trim() || null;
  const createdBy = String(payload.registradoPor ?? payload.registeredBy ?? "EXTERNAL EXAM APP").trim();
  const pdfBase64 = String(payload.informePdfBase64 ?? payload.pdfBase64 ?? "").trim();

  if (!examDate) throw new Error("Falta fechaExamen.");
  if (!grade) throw new Error("Falta grado.");
  if (!pdfBase64) throw new Error("Falta informePdfBase64.");

  const bytes = Buffer.from(pdfBase64, "base64");
  if (!bytes.length || bytes.length > maxPdfBytes) {
    throw new Error("El PDF no es valido o supera el tamano maximo.");
  }

  const member = await findMemberForExternalExam(payload);
  const supabase = createAdminClient();
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id")
    .eq("member_id", member.id)
    .eq("exam_date", examDate)
    .eq("grade", grade)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (examError) throw examError;
  if (!exam?.id) throw new Error("Primero registra el examen en el sistema nuevo.");

  await ensureReportsBucket();
  const safeLegacyId = (member.legacy_id || member.id).replace(/[^a-zA-Z0-9_-]/g, "-");
  const path = `${safeLegacyId}/${examDate}-${Date.now()}-${reportFileName}`;

  const { error: uploadError } = await supabase.storage.from(bucketName).upload(path, bytes, {
    contentType: "application/pdf",
    upsert: true
  });

  if (uploadError) throw uploadError;

  const { data } = supabase.storage.from(bucketName).getPublicUrl(path);
  await saveExamReport({
    examId: exam.id,
    reportUrl: data.publicUrl,
    reportType,
    reportFileName,
    createdBy
  });

  return { ok: true, examId: exam.id, memberId: member.id, memberLegacyId: member.legacy_id, reportUrl: data.publicUrl };
}

async function ensureReportsBucket() {
  const supabase = createAdminClient();
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets.some((bucket) => bucket.name === bucketName)) return;

  const { error: createError } = await supabase.storage.createBucket(bucketName, {
    public: true,
    allowedMimeTypes: ["application/pdf"],
    fileSizeLimit: maxPdfBytes
  });

  if (createError) throw createError;
}

function normalizeDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function safeFileName(value: string) {
  const fileName = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return fileName.endsWith(".pdf") ? fileName : `${fileName || "informe-examen"}.pdf`;
}

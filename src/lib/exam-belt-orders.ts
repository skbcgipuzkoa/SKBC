import { createAdminClient } from "@/lib/supabase/admin";

export const pendingBeltSize = "Pendiente de indicar";

const gradeColors = new Map<string, string>([
  ["BLANCO", "Blanco"],
  ["BLANCO-AMARILLO", "Blanco-amarillo"],
  ["AMARILLO", "Amarillo"],
  ["AMARILLO-NARANJA", "Amarillo-naranja"],
  ["NARANJA", "Naranja"],
  ["NARANJA-VERDE", "Naranja-verde"],
  ["VERDE", "Verde"],
  ["VERDE-AZUL", "Verde-azul"],
  ["AZUL", "Azul"],
  ["AZUL-MARRON", "Azul-marron"],
  ["MARRON", "Marron"],
  ["MINARAI", "Blanco"],
  ["5 KYU", "Amarillo"],
  ["4 KYU", "Naranja"],
  ["3 KYU", "Verde"],
  ["2 KYU", "Azul"],
  ["1 KYU", "Marron"],
  ["1 DAN", "Negro"],
  ["2 DAN", "Negro"],
  ["3 DAN", "Negro"],
  ["4 DAN", "Negro"],
  ["5 DAN", "Negro"],
  ["6 DAN", "Negro"],
  ["7 DAN", "Negro"],
  ["8 DAN", "Negro"],
  ["9 DAN", "Negro"],
  ["10 DAN", "Negro"]
]);

export function beltColorForGrade(grade: string | null | undefined) {
  const normalized = normalizeGrade(grade);
  return gradeColors.get(normalized) ?? (normalized || "Pendiente de confirmar");
}

export function isPendingBeltSize(size: string | null | undefined) {
  const normalized = String(size ?? "").trim().toLocaleLowerCase("es");
  return !normalized || normalized === pendingBeltSize.toLocaleLowerCase("es");
}

export async function ensureExamBeltOrder(input: {
  examId: string;
  memberId: string;
  studentName: string;
  examDate: string;
  targetGrade: string;
  program: "kids" | "adults";
  createdBy: string;
}) {
  const supabase = createAdminClient();
  const { data: existing, error: existingError } = await supabase
    .from("belt_order_lines")
    .select("id")
    .eq("exam_id", input.examId)
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingError) throw existingError;
  if (existing) return { id: existing.id, created: false };

  const { data, error } = await supabase
    .from("belt_order_lines")
    .insert({
      exam_id: input.examId,
      exam_title: `Examen ${input.examDate}`,
      program: input.program,
      grade: input.targetGrade,
      member_id: input.memberId,
      student_name: input.studentName,
      item: "Cinturon",
      color: beltColorForGrade(input.targetGrade),
      size: pendingBeltSize,
      quantity: 1,
      requested_on: input.examDate,
      status: "pending",
      payment_status: "unpaid",
      notes: `Generado automaticamente al aprobar ${input.targetGrade}.`,
      created_by: input.createdBy
    })
    .select("id")
    .single<{ id: string }>();

  if (error?.code === "23505") {
    const { data: duplicate, error: duplicateError } = await supabase
      .from("belt_order_lines")
      .select("id")
      .eq("exam_id", input.examId)
      .single<{ id: string }>();
    if (duplicateError) throw duplicateError;
    return { id: duplicate.id, created: false };
  }
  if (error) throw error;
  return { id: data.id, created: true };
}

function normalizeGrade(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

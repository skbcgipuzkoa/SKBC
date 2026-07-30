import { createAdminClient } from "@/lib/supabase/admin";
import { syncLegacyExam } from "@/lib/legacy-sheet-sync";
import { recalculateMemberExamStatus } from "@/lib/member-exam-status";

type MemberForExam = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  joined_on: string | null;
  last_exam_on: string | null;
  exam_history: string | null;
  attendance_history: string | null;
};

export const externalExamAuth = {
  supabaseUrl: "https://zipfwmmwcawfbqofhwmc.supabase.co",
  supabaseAnonKey: "sb_publishable_j1dhehxot0jJ98uUNblN4A_c3ujTqn6"
};

type ExternalExamPayload = {
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
  examiner?: string;
  registradoPor?: string;
  registeredBy?: string;
  informeUrl?: string;
  reportUrl?: string;
  diplomaUrl?: string;
};

export async function registerExam({
  memberId,
  examDate,
  grade,
  examiner,
  registeredBy
}: {
  memberId: string;
  examDate: string;
  grade: string;
  examiner: string | null;
  registeredBy: string;
}) {
  const supabase = createAdminClient();
  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id,legacy_id,display_name,class,grade,joined_on,last_exam_on,exam_history,attendance_history")
    .eq("id", memberId)
    .single<MemberForExam>();

  if (memberError || !member) throw new Error("Kenshi no encontrado.");

  const cycleStart = member.last_exam_on ?? member.joined_on ?? null;
  const cycleAttendance = await countCycleAttendance(member.id, cycleStart, examDate);
  const nextExamHistory = appendHistory(member.exam_history, `${examDate} (${grade})`);
  const nextAttendanceHistory = appendHistory(member.attendance_history, `${grade}: ${cycleAttendance}`);

  const { data: existingExam, error: existingExamError } = await supabase
    .from("exams")
    .select("id")
    .eq("member_id", member.id)
    .eq("exam_date", examDate)
    .eq("grade", grade)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string }>();

  if (existingExamError) throw existingExamError;

  let examId = existingExam?.id ?? null;
  if (!examId) {
    const { data: insertedExam, error: examError } = await supabase
      .from("exams")
      .insert({
        exam_date: examDate,
        member_id: member.id,
        grade,
        cycle_attendance: cycleAttendance,
        examiner,
        registered_by: registeredBy
      })
      .select("id")
      .single<{ id: string }>();

    if (examError) throw examError;
    examId = insertedExam.id;
  }

  const { error: updateError } = await supabase
    .from("members")
    .update({
      grade,
      last_exam_on: examDate,
      next_exam_on: null,
      exam_history: nextExamHistory,
      attendance_history: nextAttendanceHistory,
      updated_at: new Date().toISOString()
    })
    .eq("id", member.id);

  if (updateError) throw updateError;

  await recalculateMemberExamStatus(member.id);

  try {
    await syncLegacyExam(examId);
  } catch (error) {
    console.error("Error syncing exam to legacy sheet", error);
  }

  return { examId, memberLegacyId: member.legacy_id, cycleAttendance };
}

export async function registerExternalExam(payload: ExternalExamPayload) {
  const examDate = normalizeDate(payload.fechaExamen ?? payload.examDate);
  const grade = String(payload.grado ?? payload.grade ?? "").trim();
  const examiner = String(payload.examinador ?? payload.examiner ?? "").trim() || null;
  const registeredBy = String(payload.registradoPor ?? payload.registeredBy ?? "EXTERNAL EXAM APP").trim();

  if (!examDate) throw new Error("Falta fechaExamen.");
  if (!grade) throw new Error("Falta grado.");

  const member = await findMemberForExternalExam(payload);
  const result = await registerExam({
    memberId: member.id,
    examDate,
    grade,
    examiner,
    registeredBy
  });

  const documentUrl = String(payload.informeUrl ?? payload.reportUrl ?? payload.diplomaUrl ?? "").trim();
  if (documentUrl) {
    await saveExamReport({
      examId: result.examId,
      reportUrl: documentUrl,
      reportType: null,
      reportFileName: null,
      createdBy: registeredBy
    });
  }

  return {
    ok: true,
    examId: result.examId,
    memberId: member.id,
    memberLegacyId: result.memberLegacyId,
    cycleAttendance: result.cycleAttendance
  };
}

export async function saveExamReport({
  examId,
  reportUrl,
  reportType,
  reportFileName,
  createdBy
}: {
  examId: string;
  reportUrl: string;
  reportType: string | null;
  reportFileName: string | null;
  createdBy: string;
}) {
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("exams")
    .update({
      diploma_url: reportUrl
    })
    .eq("id", examId);

  if (error) throw error;
}

export async function deleteExam(examId: string) {
  const supabase = createAdminClient();
  const { data: exam, error: examError } = await supabase
    .from("exams")
    .select("id,member_id")
    .eq("id", examId)
    .single<{ id: string; member_id: string }>();

  if (examError || !exam) throw new Error("Examen no encontrado.");

  const { error: deleteError } = await supabase
    .from("exams")
    .delete()
    .eq("id", exam.id);

  if (deleteError) throw deleteError;

  await rebuildMemberExamSummary(exam.member_id);
  await recalculateMemberExamStatus(exam.member_id);
}

async function rebuildMemberExamSummary(memberId: string) {
  const supabase = createAdminClient();
  const { data: exams, error } = await supabase
    .from("exams")
    .select("exam_date,grade,cycle_attendance")
    .eq("member_id", memberId)
    .order("exam_date", { ascending: true })
    .returns<{ exam_date: string; grade: string; cycle_attendance: number | null }[]>();

  if (error) throw error;

  const lastExam = exams?.at(-1) ?? null;
  const update: {
    last_exam_on: string | null;
    exam_history: string | null;
    attendance_history: string | null;
    next_exam_on: null;
    updated_at: string;
    grade?: string;
  } = {
    last_exam_on: lastExam?.exam_date ?? null,
    exam_history: exams?.length ? exams.map((item) => `${item.exam_date} (${item.grade})`).join(" | ") : null,
    attendance_history: exams?.length ? exams.map((item) => `${item.grade}: ${item.cycle_attendance ?? 0}`).join(" | ") : null,
    next_exam_on: null,
    updated_at: new Date().toISOString()
  };

  if (lastExam?.grade) update.grade = lastExam.grade;

  const { error: updateError } = await supabase
    .from("members")
    .update(update)
    .eq("id", memberId);

  if (updateError) throw updateError;
}

async function countCycleAttendance(memberId: string, cycleStart: string | null, examDate: string) {
  const supabase = createAdminClient();
  let query = supabase
    .from("attendance_logs")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .lte("attended_on", examDate);

  if (cycleStart) {
    query = query.gt("attended_on", cycleStart);
  }

  const { count, error } = await query;
  if (error) throw error;
  return count ?? 0;
}

function appendHistory(current: string | null, next: string) {
  return current?.trim() ? `${current.trim()} | ${next}` : next;
}

export async function findMemberForExternalExam(payload: ExternalExamPayload) {
  const supabase = createAdminClient();
  const directId = String(payload.memberId ?? "").trim();
  const legacyId = String(payload.legacyId ?? payload.alumnoId ?? payload.alumnoRef ?? "").trim();

  if (directId) {
    const { data, error } = await supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,joined_on,last_exam_on,exam_history,attendance_history")
      .eq("id", directId)
      .single<MemberForExam>();
    if (!error && data) return data;
  }

  if (legacyId) {
    const { data, error } = await supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,joined_on,last_exam_on,exam_history,attendance_history")
      .eq("legacy_id", legacyId)
      .single<MemberForExam>();
    if (!error && data) return data;
  }

  const name = normalizeText(String(payload.alumno ?? payload.nombre ?? ""));
  if (name) {
    const { data, error } = await supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,joined_on,last_exam_on,exam_history,attendance_history")
      .ilike("display_name", `%${name}%`)
      .limit(2)
      .returns<MemberForExam[]>();

    if (error) throw error;
    if (data.length === 1) return data[0];
    if (data.length > 1) throw new Error("Hay mas de un kenshi que coincide con ese nombre.");
  }

  throw new Error("No se encontro el kenshi en el sistema nuevo.");
}

function normalizeDate(value: string | null | undefined) {
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

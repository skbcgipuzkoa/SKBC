import { createAdminClient } from "@/lib/supabase/admin";

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

  const { error: examError } = await supabase.from("exams").insert({
    exam_date: examDate,
    member_id: member.id,
    grade,
    cycle_attendance: cycleAttendance,
    examiner,
    registered_by: registeredBy
  });

  if (examError) throw examError;

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

  return { memberLegacyId: member.legacy_id, cycleAttendance };
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

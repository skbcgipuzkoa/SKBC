import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllPages } from "@/lib/load-all-pages";
import { madridCallToday } from "@/lib/exam-call";
import { evaluateExamContinuity, examContinuityWindows, type ContinuityClosure } from "@/lib/exam-continuity";

export async function getExamContinuity(memberId: string, memberClass: "kids" | "adults", exceptionAuthorized = false) {
  const db = createAdminClient(), today = madridCallToday();
  const closures = await loadAllPages<ContinuityClosure>((from, to) => db.from("skbc_calendar_closures")
    .select("id,starts_on,ends_on,applies_to").eq("active", true).lte("starts_on", today).order("id").range(from, to));
  const { from60 } = examContinuityWindows(today, closures, memberClass);
  const attendance = await loadAllPages<{ id: string; class_id: string | null; attended_on: string }>((from, to) => db.from("attendance_logs")
    .select("id,class_id,attended_on").eq("member_id", memberId).gte("attended_on", from60).lte("attended_on", today).order("id").range(from, to));
  return evaluateExamContinuity({ today, memberClass, closures, attendance, exceptionAuthorized });
}

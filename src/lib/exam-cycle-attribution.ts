import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllPages } from "@/lib/load-all-pages";
import { attributeExamCall, isIsoDate } from "@/lib/exam-call";

export type ExamCycleAttribution = { member_id: string; actual_exam_on: string; call_month: string; is_retake: boolean; reference_on: string; source: string };

export async function loadExamCycleAttributions(memberIds: string[]) {
  const db = createAdminClient();
  const result = new Map<string, ExamCycleAttribution>();
  const ids = [...new Set(memberIds)];
  for (let i = 0; i < ids.length; i += 100) {
    const rows = await loadAllPages<ExamCycleAttribution>((from, to) => db.from("member_exam_cycle_attributions")
      .select("member_id,actual_exam_on,call_month,is_retake,reference_on,source")
      .in("member_id", ids.slice(i, i + 100)).order("member_id").order("actual_exam_on")
      .range(from, to).returns<ExamCycleAttribution[]>());
    for (const row of rows) if (isIsoDate(row.reference_on)) result.set(`${row.member_id}:${row.actual_exam_on}`, row);
  }
  return result;
}

export function withExamCycleAttribution<T extends { id: string; last_exam_on: string | null }>(member: T, rows: Map<string, ExamCycleAttribution>) {
  const row = rows.get(`${member.id}:${member.last_exam_on}`);
  return { ...member, last_exam_cycle_on: row?.reference_on ?? null };
}

/** Explicit provenance only. A reference date is never the historical exam date. */
export async function recordExamCycleAttribution(input: { memberId: string; actualExamOn: string; isRetake: boolean; source: string }) {
  const attribution = attributeExamCall(input.actualExamOn, { isRetake: input.isRetake });
  if (!attribution || !input.memberId || !input.source.trim()) throw new Error("Invalid exam cycle attribution");
  const normalWinterDelay = !input.isRetake && Number(input.actualExamOn.slice(5, 7)) <= 2;
  const { error } = await createAdminClient().from("member_exam_cycle_attributions").upsert({
    member_id: input.memberId, actual_exam_on: input.actualExamOn, call_month: attribution.callMonth,
    is_retake: input.isRetake, reference_on: normalWinterDelay ? `${attribution.callMonth}-01` : input.actualExamOn,
    source: input.source.trim(),
  }, { onConflict: "member_id,actual_exam_on" });
  if (error) throw error;
}

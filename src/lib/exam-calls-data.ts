import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllPages } from "@/lib/load-all-pages";
import { isIsoDate, madridCallToday } from "@/lib/exam-call";

export type UpcomingExamCall = { id: string; call_date: string; title: string };

/** Active configured calls, with a stable order across pagination. Read-only. */
export async function getUpcomingExamCalls(options: { now?: Date } = {}): Promise<UpcomingExamCall[]> {
  const db = createAdminClient();
  const calls = await loadAllPages<UpcomingExamCall>((from, to) => db
    .from("skbc_exam_calls").select("id,call_date,title").eq("active", true)
    .gte("call_date", madridCallToday(options.now)).order("call_date").order("id")
    .range(from, to).returns<UpcomingExamCall[]>());
  return calls.filter((call) => isIsoDate(call.call_date));
}

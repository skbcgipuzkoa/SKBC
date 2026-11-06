import { createAdminClient } from "@/lib/supabase/admin";
import { decodeExamAssignments } from "@/lib/integrated-exam-assignments";

/** Keep an already-shared examiner link scoped to its original authorised grades. Read-only. */
export async function getExaminerGradeLinks(token: string, grade?: string) {
  if (token.startsWith("disabled_") || !/^[A-Za-z0-9_-]{16,256}$/.test(token))
    return null;
  const db = createAdminClient();
  const result = await db
    .from("exam_event_examiners")
    .select(
      "id,name,revoked_at,source_examiner_id,exam_events(program_type,notes)",
    )
    .eq("access_token", token)
    .maybeSingle();
  if (result.error) throw result.error;
  const parent = result.data as {
    id: string;
    name: string;
    revoked_at: string | null;
    source_examiner_id: string | null;
    exam_events: { program_type: string; notes: string | null } | null;
  } | null;
  if (
    !parent ||
    parent.revoked_at ||
    parent.source_examiner_id ||
    !parent.exam_events
  )
    return null;
  const children = await db
    .from("exam_event_examiners")
    .select(
      "access_token,revoked_at,exam_events(id,title,target_grade,call_month,exam_date,date_confirmed,status)",
    )
    .eq("source_examiner_id", parent.id)
    .order("created_at")
    .returns<
      Array<{
        access_token: string;
        revoked_at: string | null;
        exam_events: {
          id: string;
          title: string;
          target_grade: string | null;
          call_month: string | null;
          exam_date: string;
          date_confirmed?: boolean;
          status: string;
        } | null;
      }>
    >();
  if (children.error) throw children.error;
  if (!children.data?.length) return null;
  const assignments = decodeExamAssignments(parent.exam_events.notes);
  const restricted =
    ["adults", "dan_tribunal"].includes(parent.exam_events.program_type) &&
    assignments.scopes !== null;
  const pending = assignments.pendingExaminerIds?.includes(parent.id);
  const links = children.data
    .filter((row) => {
      const event = row.exam_events;
      return (
        !row.access_token.startsWith("disabled_") &&
        !pending &&
        !row.revoked_at &&
        event &&
        ["active", "draft", "review"].includes(event.status) &&
        (!grade || event.target_grade === grade) &&
        (!restricted ||
          assignments.scopes?.[parent.id]?.includes(event.target_grade ?? ""))
      );
    })
    .map((row) => ({
      token: row.access_token,
      eventId: row.exam_events!.id,
      targetGrade: row.exam_events!.target_grade ?? "Grado por revisar",
      title: row.exam_events!.title,
      callMonth:
        row.exam_events!.call_month ?? row.exam_events!.exam_date.slice(0, 7),
      dateConfirmed: row.exam_events!.date_confirmed !== false,
      examDate:
        row.exam_events!.date_confirmed === false
          ? null
          : row.exam_events!.exam_date,
    }));
  return { examinerName: parent.name, links };
}

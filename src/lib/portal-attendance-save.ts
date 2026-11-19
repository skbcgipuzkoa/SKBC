import { createAdminClient } from "@/lib/supabase/admin";
import { withIndividualWorkSnapshot } from "@/lib/individual-work-snapshot";
import { recalculateMemberExamStatus } from "@/lib/member-exam-status";

// Called only after requireDojo has authorized this host. Preserve people added
// after the attendance form was opened; remove only explicitly unchecked rows.
export async function savePortalAttendance(slug: string, classId: string, selectedIds: string[], renderedIds: string[]) {
  const db = createAdminClient();
  const { data: session, error } = await db.from("classes").select("id")
    .eq("id", classId).eq("dojo_slug", slug).eq("closed", false).eq("status", "pending").maybeSingle();
  if (error || !session) throw error ?? new Error("Clase no disponible en este dojo.");
  await withIndividualWorkSnapshot(classId, async () => {
    const { data, error: attendanceError } = await db.from("attendance_logs")
      .select("member_id").eq("class_id", classId);
    if (attendanceError) throw attendanceError;
    const rendered = new Set(renderedIds);
    const members = [...new Set([...selectedIds, ...(data ?? []).filter(row => !rendered.has(row.member_id)).map(row => row.member_id)])];
    const { error: saveError } = await db.rpc("save_dojo_attendance", {
      p_slug: slug, p_class: classId, p_members: members
    });
    if (saveError) throw saveError;
    const selected = new Set(selectedIds);
    for (const memberId of new Set(renderedIds.filter(id => !selected.has(id)))) {
      await recalculateMemberExamStatus(memberId);
    }
  });
}

import { createAdminClient } from "@/lib/supabase/admin";

export async function convertProvisionalMember(provisionalId: string, memberId: string) {
  const supabase = createAdminClient();
  const { data: provisional, error } = await supabase.from("provisional_members").select("id,status").eq("id", provisionalId).single();
  if (error || !provisional || provisional.status !== "pending") throw error ?? new Error("Invitado no disponible");

  const [{ data: provisionalRows, error: attendanceError }, { data: existing, error: existingError }, { data: member, error: memberError }] = await Promise.all([
    supabase.from("provisional_attendance").select("class_id,attended_on").eq("provisional_member_id", provisionalId),
    supabase.from("attendance_logs").select("class_id").eq("member_id", memberId),
    supabase.from("members").select("id,grade").eq("id", memberId).single()
  ]);
  if (attendanceError || existingError || memberError || !member) throw attendanceError ?? existingError ?? memberError ?? new Error("Kenshi no encontrado");

  const existingClasses = new Set((existing ?? []).map((row) => row.class_id));
  const inserts = (provisionalRows ?? []).filter((row) => !existingClasses.has(row.class_id)).map((row) => ({
    class_id: row.class_id,
    member_id: memberId,
    attended_on: row.attended_on,
    official_grade: member.grade,
    trained_grade: member.grade,
    technical_role: "training",
    use_for_history: true
  }));
  if (inserts.length) {
    const { error: insertError } = await supabase.from("attendance_logs").insert(inserts);
    if (insertError) throw insertError;
  }
  const { error: updateError } = await supabase.from("provisional_members").update({
    status: "converted", converted_member_id: memberId, converted_at: new Date().toISOString(), updated_at: new Date().toISOString()
  }).eq("id", provisionalId).eq("status", "pending");
  if (updateError) throw updateError;
  return { inserted: inserts.length, skipped: (provisionalRows?.length ?? 0) - inserts.length };
}

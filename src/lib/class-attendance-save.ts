import { createAdminClient } from "@/lib/supabase/admin";
import { withIndividualWorkSnapshot } from "@/lib/individual-work-snapshot";

type AttendanceInput = {
  class_id: string; member_id: string; legacy_id: string; attended_on: string;
  official_grade: string | null; trained_grade: string | null;
  technical_role: string; technical_note?: string; use_for_history: boolean;
};

// Adding attendance is idempotent even when a visitor was registered by an RPC
// without a legacy_id. Existing rows retain their visit, roles and adjustments.
export async function saveClassAttendanceRows(classId: string, input: AttendanceInput[], allowClosed = false): Promise<{
  data: Array<{ id: string }> | null; error: unknown;
}> {
  try {
    const data = await withIndividualWorkSnapshot(classId, async () => {
      const db = createAdminClient();
      const rows = [...new Map(input.map(row => [row.member_id, row])).values()];
      if (rows.some(row => row.class_id !== classId)) throw new Error("Asistencia ajena a esta clase.");
      const existing = new Map<string, { id: string }>();
      for (let offset = 0; offset < rows.length; offset += 100) {
        const { data, error } = await db.from("attendance_logs").select("id,member_id")
          .eq("class_id", classId).in("member_id", rows.slice(offset, offset + 100).map(row => row.member_id));
        if (error) throw error;
        for (const row of data ?? []) {
          if (existing.has(row.member_id)) throw new Error("Ya hay asistencias duplicadas de un alumno en esta clase. Revisa el acta.");
          existing.set(row.member_id, { id: row.id });
        }
      }
      const missing = rows.filter(row => !existing.has(row.member_id));
      if (missing.length) {
        const { data: session, error: classError } = await db.from("classes").select("closed")
          .eq("id", classId).maybeSingle();
        if (classError || !session) throw classError ?? new Error("Clase no encontrada.");
        if (session.closed && !allowClosed) throw new Error("La clase ya se ha cerrado. Recarga para revisar la asistencia.");
        const { data, error } = await db.from("attendance_logs")
          .upsert(missing, { onConflict: "legacy_id" }).select("id,member_id");
        if (error) throw error;
        for (const row of data ?? []) existing.set(row.member_id, { id: row.id });
      }
      return rows.map(row => {
        const saved = existing.get(row.member_id);
        if (!saved) throw new Error("No se ha confirmado el guardado de la asistencia.");
        return saved;
      });
    });
    return { data, error: null };
  } catch (error) { return { data: null, error }; }
}

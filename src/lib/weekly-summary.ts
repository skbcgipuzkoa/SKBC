import { createAdminClient } from "@/lib/supabase/admin";
import { previousWeekPeriod } from "@/lib/operational-follow-up";
import { sendTelegramMessage } from "@/lib/telegram-notifications";

export type WeeklySummaryPayload = {
  classes: number; openClasses: number; correctedClasses: number;
  attendance: number; kidsAttendance: number; adultAttendance: number; uniqueAttendees: number;
  newMembers: number; newProvisionals: number; pendingProvisionals: number; importantNotes: number;
};

export async function generateWeeklySummary(options: { sendTelegram?: boolean; force?: boolean; period?: { start: string; end: string } } = {}) {
  const supabase = createAdminClient();
  const period = options.period ?? previousWeekPeriod();
  const [classesResult, attendanceResult, membersResult, provisionalResult, pendingResult, notesResult] = await Promise.all([
    supabase.from("classes").select("id,class_group,closed,status").gte("class_date", period.start).lte("class_date", period.end),
    supabase.from("attendance_logs").select("member_id,attended_on,members(class)").gte("attended_on", period.start).lte("attended_on", period.end),
    supabase.from("members").select("id").gte("created_at", `${period.start}T00:00:00`).lte("created_at", `${period.end}T23:59:59`),
    supabase.from("provisional_members").select("id").gte("created_at", `${period.start}T00:00:00`).lte("created_at", `${period.end}T23:59:59`),
    supabase.from("provisional_members").select("id", { count: "exact", head: true }).eq("status", "pending"),
    supabase.from("member_notes").select("id", { count: "exact", head: true }).eq("important", true).is("resolved_at", null)
  ]);
  const failure = [classesResult, attendanceResult, membersResult, provisionalResult, pendingResult, notesResult].find((item) => item.error)?.error;
  if (failure) throw failure;
  const classes = classesResult.data ?? [];
  const attendance = attendanceResult.data ?? [];
  const payload: WeeklySummaryPayload = {
    classes: classes.length,
    openClasses: classes.filter((row) => !row.closed).length,
    correctedClasses: classes.filter((row) => row.status === "correction").length,
    attendance: attendance.length,
    kidsAttendance: attendance.filter((row) => (Array.isArray(row.members) ? row.members[0] : row.members)?.class === "kids").length,
    adultAttendance: attendance.filter((row) => (Array.isArray(row.members) ? row.members[0] : row.members)?.class === "adults").length,
    uniqueAttendees: new Set(attendance.map((row) => row.member_id)).size,
    newMembers: membersResult.data?.length ?? 0,
    newProvisionals: provisionalResult.data?.length ?? 0,
    pendingProvisionals: pendingResult.count ?? 0,
    importantNotes: notesResult.count ?? 0
  };
  if (options.sendTelegram) {
    const key = `weekly:${period.start}`;
    const { data: prior } = await supabase.from("notification_deliveries").select("status").eq("delivery_key", key).eq("channel", "telegram").maybeSingle();
    if (prior?.status !== "sent" || options.force) {
      await supabase.from("notification_deliveries").upsert({ delivery_key: key, channel: "telegram", status: "pending", updated_at: new Date().toISOString() }, { onConflict: "delivery_key,channel" });
      try {
        await sendTelegramMessage(formatWeeklyTelegram(period, payload));
        await supabase.from("notification_deliveries").update({ status: "sent", delivered_at: new Date().toISOString(), error_message: null, updated_at: new Date().toISOString() }).eq("delivery_key", key).eq("channel", "telegram");
      } catch (telegramError) {
        await supabase.from("notification_deliveries").update({ status: "failed", error_message: telegramError instanceof Error ? telegramError.message : String(telegramError), updated_at: new Date().toISOString() }).eq("delivery_key", key).eq("channel", "telegram");
        throw telegramError;
      }
    }
  }
  return { period, payload };
}

function formatWeeklyTelegram(period: { start: string; end: string }, value: WeeklySummaryPayload) {
  return [`<b>Resumen semanal SKBC</b>`, `${period.start} a ${period.end}`, "", `Clases: <b>${value.classes}</b> · abiertas ${value.openClasses} · en correccion ${value.correctedClasses}`, `Asistencias: <b>${value.attendance}</b> · ninos ${value.kidsAttendance} · adultos ${value.adultAttendance} · ${value.uniqueAttendees} kenshis`, `Altas: ${value.newMembers} · invitados nuevos ${value.newProvisionals}`, `Pendientes: <b>${value.pendingProvisionals}</b> provisionales · <b>${value.importantNotes}</b> notas importantes`].join("\n");
}

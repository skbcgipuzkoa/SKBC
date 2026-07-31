import { NextRequest, NextResponse } from "next/server";
import { recalculateMemberExamStatus } from "@/lib/member-exam-status";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(request: NextRequest) {
  const accessCode = process.env.SKBC_INTERNAL_ACCESS_CODE ?? "SKBC2026";
  const recalculateToken = process.env.SKBC_RECALCULATE_TOKEN;
  const headerCode = request.headers.get("x-skbc-admin-code");
  const headerToken = request.headers.get("x-skbc-recalculate-token");
  const cookieCode = request.cookies.get("skbc_internal_access")?.value;
  const hasRecalculateToken = Boolean(recalculateToken && headerToken === recalculateToken);
  if (headerCode !== accessCode && cookieCode !== accessCode && !hasRecalculateToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: members, error } = await supabase
    .from("members")
    .select("id")
    .eq("status", "active")
    .returns<Array<{ id: string }>>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let recalculatedMembers = 0;
  for (const member of members ?? []) {
    await recalculateMemberExamStatus(member.id);
    recalculatedMembers += 1;
  }

  const recalculatedChildRankings = await recalculateChildRankings();

  return NextResponse.json({
    ok: true,
    recalculatedMembers,
    recalculatedChildRankings
  });
}

async function recalculateChildRankings() {
  const supabase = createAdminClient();
  const [{ data: kids, error: kidsError }, { data: attendance, error: attendanceError }] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id")
      .eq("class", "kids")
      .eq("status", "active")
      .returns<Array<{ id: string; legacy_id: string | null }>>(),
    supabase
      .from("attendance_logs")
      .select("member_id,attended_on")
      .returns<Array<{ member_id: string; attended_on: string }>>()
  ]);

  if (kidsError) throw kidsError;
  if (attendanceError) throw attendanceError;

  const today = startOfLocalDay(new Date());
  const byMember = new Map<string, string[]>();
  for (const row of attendance ?? []) {
    const current = byMember.get(row.member_id) ?? [];
    current.push(row.attended_on);
    byMember.set(row.member_id, current);
  }

  const rows = (kids ?? []).map((member) => {
    const dates = (byMember.get(member.id) ?? []).sort((a, b) => b.localeCompare(a));
    const attendance30d = countIsoDatesSince(dates, today, 30);
    const attendance90d = countIsoDatesSince(dates, today, 90);
    const lastAttendanceOn = dates[0] ?? null;
    const daysWithoutAttendance = lastAttendanceOn ? daysBetweenLocal(parseLocalDate(lastAttendanceOn), today) : null;
    const score = attendance30d * 3 + attendance90d;
    return {
      member_id: member.id,
      legacy_id: member.legacy_id ?? member.id,
      attendance_30d: attendance30d,
      attendance_90d: attendance90d,
      last_attendance_on: lastAttendanceOn,
      days_without_attendance: daysWithoutAttendance,
      score,
      position: null as number | null,
      level: null as string | null,
      constancy_status: childConstancyStatus(attendance30d, daysWithoutAttendance),
      motivational_message: "",
      calculated_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
  });

  rows
    .sort((a, b) => b.score - a.score || (a.days_without_attendance ?? 9999) - (b.days_without_attendance ?? 9999))
    .forEach((row, index) => {
      row.position = index + 1;
      row.level = childRankingLevel(row.position, row.score);
      row.motivational_message = childMotivationalMessage(row.level, row.position, row.attendance_30d, row.days_without_attendance);
    });

  const { error: deleteError } = await supabase
    .from("child_rankings")
    .delete()
    .not("id", "is", null);

  if (deleteError) throw deleteError;
  if (!rows.length) return 0;

  const { error: insertError } = await supabase
    .from("child_rankings")
    .insert(rows);

  if (insertError) throw insertError;
  return rows.length;
}

function countIsoDatesSince(dates: string[], today: Date, days: number) {
  return dates.filter((value) => daysBetweenLocal(parseLocalDate(value), today) <= days).length;
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return startOfLocalDay(new Date(year, (month || 1) - 1, day || 1));
}

function startOfLocalDay(date: Date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function daysBetweenLocal(from: Date, to: Date) {
  return Math.floor((startOfLocalDay(to).getTime() - startOfLocalDay(from).getTime()) / 86400000);
}

function childConstancyStatus(attendance30d: number, daysWithoutAttendance: number | null) {
  if (daysWithoutAttendance === null) return "SIN DATOS";
  if (daysWithoutAttendance <= 10 && attendance30d >= 4) return "MUY CONSTANTE";
  if (daysWithoutAttendance <= 21 && attendance30d >= 2) return "CONSTANTE";
  if (daysWithoutAttendance <= 35) return "A REFORZAR";
  return "SIN ACTIVIDAD RECIENTE";
}

function childRankingLevel(position: number | null, score: number) {
  if (score <= 0) return "INICIO";
  if (position === 1) return "ORO";
  if (position && position <= 3) return "PODIO";
  if (position && position <= 10) return "TOP 10";
  return "EN PROGRESO";
}

function childMotivationalMessage(level: string | null, position: number | null, attendance30d: number, daysWithoutAttendance: number | null) {
  if (level === "ORO") return "Vas liderando el ranking infantil. Sigue entrenando asi.";
  if (level === "PODIO") return `Estas en el puesto ${position}. Muy buen trabajo.`;
  if (attendance30d >= 4) return "Muy buena constancia este mes.";
  if (daysWithoutAttendance !== null && daysWithoutAttendance > 35) return "Vamos a recuperar el ritmo poco a poco.";
  return "Cada asistencia cuenta. Sigue sumando.";
}

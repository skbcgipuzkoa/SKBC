import { createAdminClient } from "@/lib/supabase/admin";

type NotificationType = "daily_ranking" | "monthly_stats" | "semester_stats" | "yearly_stats" | "test";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: "active" | "inactive";
  semaphore: string | null;
  next_exam_on: string | null;
  attendance_count: number | null;
  minimum_attendance: number | null;
  missing_attendance: number | null;
};

type Attendance = {
  member_id: string;
  attended_on: string;
};

type TechnicalHistory = {
  member_id: string;
  class_date: string;
};

type Course = {
  member_id: string;
  course_date: string;
  kind: "national" | "international";
};

type AdultBonus = {
  member_id: string;
  bonus_date: string;
  points: number;
  active: boolean;
  permanent: boolean;
};

type ChildRanking = {
  member_id: string;
  score: number;
  position: number | null;
  attendance_30d: number;
  attendance_90d: number;
  members: {
    display_name: string;
    legacy_id: string | null;
    grade: string | null;
    status: "active" | "inactive";
  } | null;
};

type CalendarClosure = {
  starts_on: string;
  ends_on: string;
  applies_to: "all" | "kids" | "adults";
};

type NotificationResult = {
  notificationType: NotificationType;
  status: "sent" | "failed" | "skipped";
  message: string;
  error?: string;
};

const today = new Date();
const date30 = daysAgo(30);
const date90 = daysAgo(90);
const date180 = daysAgo(180);

export async function sendTelegramDigest(notificationType: NotificationType, options: { force?: boolean } = {}): Promise<NotificationResult> {
  const period = resolvePeriod(notificationType);
  const message = await buildNotificationMessage(notificationType, period);
  const supabase = createAdminClient();

  const existing = period
    ? await supabase
      .from("telegram_notification_logs")
      .select("id,status")
      .eq("notification_type", notificationType)
      .eq("period_start", period.start)
      .eq("period_end", period.end)
      .maybeSingle<{ id: string; status: string }>()
    : null;

  if (!options.force && existing?.data?.status === "sent") {
    return { notificationType, status: "skipped", message };
  }

  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
  try {
    await sendTelegramMessage(message);
    await upsertNotificationLog({
      notificationType,
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
      status: "sent",
      telegramChatId: chatId ?? null,
      message,
      errorMessage: null
    });
    return { notificationType, status: "sent", message };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    await upsertNotificationLog({
      notificationType,
      periodStart: period?.start ?? null,
      periodEnd: period?.end ?? null,
      status: "failed",
      telegramChatId: chatId ?? null,
      message,
      errorMessage
    });
    return { notificationType, status: "failed", message, error: errorMessage };
  }
}

export async function buildNotificationMessage(notificationType: NotificationType, period = resolvePeriod(notificationType)) {
  if (notificationType === "test") {
    return `SKBC Gipuzkoa\nPrueba Telegram correcta.\n${formatHumanDate(todayIso())}`;
  }

  if (notificationType === "daily_ranking") {
    const digest = await buildDailyDigest();
    return [
      `SKBC Gipuzkoa - Parte diario`,
      formatHumanDate(todayIso()),
      "",
      formatTodayClasses(digest.todayClasses),
      "",
      formatRanking("Top adultos", digest.adults),
      "",
      formatRanking("Top ninos", digest.kids),
      "",
      formatExamReady(digest.readyForExam)
    ].join("\n").trim();
  }

  const stats = await buildPeriodStats(period);
  const title = notificationType === "monthly_stats"
    ? "Resumen mensual"
    : notificationType === "semester_stats"
      ? "Resumen semestral"
      : "Resumen anual";

  return [
    `SKBC Gipuzkoa - ${title}`,
    `${formatHumanDate(period.start)} - ${formatHumanDate(period.end)}`,
    "",
    `Clases registradas: ${stats.classes}`,
    `Asistencias adultos: ${stats.adultAttendance}`,
    `Asistencias ninos: ${stats.kidsAttendance}`,
    `Tecnicas marcadas: ${stats.techniques}`,
    `Examenes aprobados: ${stats.passedExams}`,
    `Cursos nacionales: ${stats.nationalCourses}`,
    `Cursos internacionales: ${stats.internationalCourses}`,
    "",
    formatExamReady(stats.readyForExam)
  ].join("\n").trim();
}

async function buildDailyDigest() {
  const supabase = createAdminClient();
  const [
    membersResult,
    attendanceResult,
    technicalResult,
    coursesResult,
    bonusesResult,
    childRankingResult,
    blackBeltResult,
    shakujoResult,
    closuresResult,
    todayClassesResult
  ] = await Promise.all([
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,status,semaphore,next_exam_on,attendance_count,minimum_attendance,missing_attendance")
      .eq("status", "active")
      .returns<Member[]>(),
    supabase.from("attendance_logs").select("member_id,attended_on").returns<Attendance[]>(),
    supabase
      .from("member_technical_history")
      .select("member_id,class_date")
      .gte("class_date", date90)
      .eq("completed", true)
      .returns<TechnicalHistory[]>(),
    supabase.from("courses").select("member_id,course_date,kind").gte("course_date", date180).returns<Course[]>(),
    supabase.from("adult_ranking_bonuses").select("member_id,bonus_date,points,active,permanent").returns<AdultBonus[]>(),
    supabase
      .from("child_rankings")
      .select("member_id,score,position,attendance_30d,attendance_90d,members(display_name,legacy_id,grade,status)")
      .order("position", { ascending: true, nullsFirst: false })
      .order("score", { ascending: false })
      .limit(10)
      .returns<ChildRanking[]>(),
    supabase.from("black_belt_special_attendance").select("member_id,status,black_belt_special_classes(class_date)").returns<any[]>(),
    supabase.from("shakujo_attendance").select("member_id,shakujo_classes(class_date)").returns<any[]>(),
    supabase
      .from("skbc_calendar_closures")
      .select("starts_on,ends_on,applies_to")
      .eq("active", true)
      .lte("starts_on", todayIso())
      .gte("ends_on", "2000-01-01")
      .in("applies_to", ["all", "adults"])
      .returns<CalendarClosure[]>(),
    supabase
      .from("classes")
      .select("name,class_group,closed,plan_generated")
      .eq("class_date", todayIso())
      .order("class_group")
      .returns<Array<{ name: string; class_group: "kids" | "adults"; closed: boolean; plan_generated: boolean }>>()
  ]);

  if (membersResult.error) throw membersResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (technicalResult.error) throw technicalResult.error;
  if (coursesResult.error) throw coursesResult.error;

  const members = membersResult.data ?? [];
  const adults = buildAdultRanking(
    members,
    attendanceResult.data ?? [],
    technicalResult.data ?? [],
    coursesResult.data ?? [],
    bonusesResult.error ? [] : bonusesResult.data ?? [],
    blackBeltResult.error ? [] : blackBeltResult.data ?? [],
    shakujoResult.error ? [] : shakujoResult.data ?? [],
    closuresResult.error ? [] : closuresResult.data ?? []
  ).slice(0, 10);

  const kids = (childRankingResult.error ? [] : childRankingResult.data ?? [])
    .filter((row) => row.members?.status === "active")
    .slice(0, 10)
    .map((row, index) => ({
      name: row.members?.display_name ?? "Kenshi",
      grade: row.members?.grade ?? "-",
      score: row.score,
      detail: `30/90: ${row.attendance_30d}/${row.attendance_90d}`,
      position: row.position ?? index + 1
    }));

  return {
    adults,
    kids,
    todayClasses: todayClassesResult.data ?? [],
    readyForExam: readyForExam(members)
  };
}

async function buildPeriodStats(period: { start: string; end: string }) {
  const supabase = createAdminClient();
  const [
    classesResult,
    attendanceResult,
    techniquesResult,
    examsResult,
    coursesResult,
    membersResult
  ] = await Promise.all([
    supabase.from("classes").select("id", { count: "exact", head: true }).gte("class_date", period.start).lte("class_date", period.end),
    supabase
      .from("attendance_logs")
      .select("member_id,attended_on,members(class)")
      .gte("attended_on", period.start)
      .lte("attended_on", period.end)
      .returns<Array<{ member_id: string; attended_on: string; members: { class: "kids" | "adults" } | null }>>(),
    supabase.from("member_technical_history").select("id", { count: "exact", head: true }).gte("class_date", period.start).lte("class_date", period.end).eq("completed", true),
    supabase.from("exams").select("id", { count: "exact", head: true }).gte("exam_date", period.start).lte("exam_date", period.end).eq("result", "passed"),
    supabase.from("courses").select("kind,course_date").gte("course_date", period.start).lte("course_date", period.end).returns<Array<{ kind: "national" | "international"; course_date: string }>>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,status,semaphore,next_exam_on,attendance_count,minimum_attendance,missing_attendance")
      .eq("status", "active")
      .returns<Member[]>()
  ]);

  if (classesResult.error) throw classesResult.error;
  if (attendanceResult.error) throw attendanceResult.error;
  if (techniquesResult.error) throw techniquesResult.error;
  if (examsResult.error) throw examsResult.error;
  if (coursesResult.error) throw coursesResult.error;
  if (membersResult.error) throw membersResult.error;

  const attendance = attendanceResult.data ?? [];
  const courses = coursesResult.data ?? [];
  return {
    classes: classesResult.count ?? 0,
    adultAttendance: attendance.filter((row) => row.members?.class === "adults").length,
    kidsAttendance: attendance.filter((row) => row.members?.class === "kids").length,
    techniques: techniquesResult.count ?? 0,
    passedExams: examsResult.count ?? 0,
    nationalCourses: courses.filter((row) => row.kind === "national").length,
    internationalCourses: courses.filter((row) => row.kind === "international").length,
    readyForExam: readyForExam(membersResult.data ?? [])
  };
}

async function sendTelegramMessage(text: string) {
  const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) {
    throw new Error("Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID.");
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4000),
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Telegram ${response.status}: ${detail.slice(0, 300)}`);
  }
}

async function upsertNotificationLog(input: {
  notificationType: NotificationType;
  periodStart: string | null;
  periodEnd: string | null;
  status: "sent" | "failed" | "skipped";
  telegramChatId: string | null;
  message: string;
  errorMessage: string | null;
}) {
  const supabase = createAdminClient();
  const payload = {
    notification_type: input.notificationType,
    period_start: input.periodStart,
    period_end: input.periodEnd,
    status: input.status,
    telegram_chat_id: input.telegramChatId,
    message: input.message,
    error_message: input.errorMessage,
    sent_at: input.status === "sent" ? new Date().toISOString() : null,
    updated_at: new Date().toISOString()
  };

  if (input.periodStart && input.periodEnd) {
    const { error } = await supabase
      .from("telegram_notification_logs")
      .upsert(payload, { onConflict: "notification_type,period_start,period_end" });
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("telegram_notification_logs").insert(payload);
  if (error) throw error;
}

function buildAdultRanking(members: Member[], attendance: Attendance[], technical: TechnicalHistory[], courses: Course[], bonuses: AdultBonus[], blackBeltRows: any[], shakujoRows: any[], closures: CalendarClosure[]) {
  const adults = members.filter((member) => member.class === "adults" && member.legacy_id !== "13");
  const attendance30 = countByMember(attendance.filter((row) => row.attended_on >= date30));
  const attendance90 = countByMember(attendance.filter((row) => row.attended_on >= date90));
  const technical90 = countByMember(technical);
  const nationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "national").map((row) => ({ member_id: row.member_id, points: 1 })));
  const internationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "international").map((row) => ({ member_id: row.member_id, points: 3 })));
  const manualBonus = sumByMember(
    bonuses
      .filter((row) => row.active && (row.permanent || row.bonus_date >= date180))
      .map((row) => ({ member_id: row.member_id, points: row.points }))
  );
  const blackBeltPoints = sumByMember(
    blackBeltRows
      .filter((row) => row.black_belt_special_classes?.class_date >= date180)
      .map((row) => ({ member_id: row.member_id, points: row.status === "present" ? 2 : row.status === "absent" ? -4 : 0 }))
  );
  const shakujoPoints = sumByMember(
    shakujoRows
      .filter((row) => row.shakujo_classes?.class_date >= date180)
      .map((row) => ({ member_id: row.member_id, points: 2 }))
  );
  const lastAttendance = latestAttendanceByMember(attendance);

  return adults
    .map((member) => {
      const a30 = attendance30.get(member.id) ?? 0;
      const a90 = attendance90.get(member.id) ?? 0;
      const t90 = technical90.get(member.id) ?? 0;
      const last = lastAttendance.get(member.id);
      const daysWithoutAttendance = last ? trainingDaysBetween(last, todayIso(), closures) : 999;
      const score = Math.max(
        0,
        a30 * 4 +
          a90 +
          t90 +
          (nationalCoursePoints.get(member.id) ?? 0) +
          (internationalCoursePoints.get(member.id) ?? 0) +
          (manualBonus.get(member.id) ?? 0) +
          (blackBeltPoints.get(member.id) ?? 0) +
          (shakujoPoints.get(member.id) ?? 0) -
          adultInactivityPenalty(daysWithoutAttendance)
      );
      return {
        name: member.display_name,
        grade: member.grade ?? "-",
        score,
        detail: `30/90: ${a30}/${a90} - tecnicas ${t90}`,
        position: 0
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, position: index + 1 }));
}

function readyForExam(members: Member[]) {
  return members
    .filter((member) => member.semaphore === "VERDE")
    .sort((a, b) => (a.next_exam_on ?? "9999-12-31").localeCompare(b.next_exam_on ?? "9999-12-31") || a.display_name.localeCompare(b.display_name))
    .map((member) => ({
      name: member.display_name,
      grade: member.grade ?? "-",
      className: member.class === "kids" ? "ninos" : "adultos",
      nextExamOn: member.next_exam_on,
      attendance: member.attendance_count,
      minimum: member.minimum_attendance
    }));
}

function formatTodayClasses(classes: Array<{ name: string; class_group: "kids" | "adults"; closed: boolean; plan_generated: boolean }>) {
  if (!classes.length) return "Clase de hoy: no hay clase creada.";
  return [
    "Clase de hoy:",
    ...classes.map((item) => {
      const group = item.class_group === "kids" ? "ninos" : "adultos";
      const status = item.closed ? "cerrada" : "abierta";
      const plan = item.class_group === "adults" ? (item.plan_generated ? "plan OK" : "plan pendiente") : "solo asistencia";
      return `- ${item.name} (${group}): ${status}, ${plan}`;
    })
  ].join("\n");
}

function formatRanking(title: string, rows: Array<{ name: string; grade: string; score: number; detail: string; position: number }>) {
  if (!rows.length) return `${title}: sin datos.`;
  return [
    `${title}:`,
    ...rows.slice(0, 5).map((row) => `${row.position}. ${row.name} - ${row.score} pts (${row.grade}; ${row.detail})`)
  ].join("\n");
}

function formatExamReady(rows: ReturnType<typeof readyForExam>) {
  if (!rows.length) {
    return "Kenshis listos para examen: ninguno hoy.";
  }
  return [
    "Kenshis listos para examen:",
    ...rows.slice(0, 12).map((row) => {
      const attendance = row.attendance !== null && row.minimum !== null ? ` - asist. ${row.attendance}/${row.minimum}` : "";
      return `- ${row.name} (${row.className}, ${row.grade})${row.nextExamOn ? ` - ${formatHumanDate(row.nextExamOn)}` : ""}${attendance}`;
    }),
    rows.length > 12 ? `Y ${rows.length - 12} mas.` : ""
  ].filter(Boolean).join("\n");
}

function resolvePeriod(notificationType: NotificationType) {
  const now = new Date();
  if (notificationType === "monthly_stats") {
    const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: isoDate(first), end: isoDate(last) };
  }
  if (notificationType === "semester_stats") {
    const semesterStartMonth = now.getMonth() < 6 ? 0 : 6;
    const first = new Date(now.getFullYear(), semesterStartMonth, 1);
    const last = new Date(now.getFullYear(), semesterStartMonth + 6, 0);
    return { start: isoDate(first), end: isoDate(last) };
  }
  if (notificationType === "yearly_stats") {
    const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
    return { start: `${year}-01-01`, end: `${year}-12-31` };
  }
  return { start: todayIso(), end: todayIso() };
}

function countByMember(rows: Array<{ member_id: string }>) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.member_id, (counts.get(row.member_id) ?? 0) + 1));
  return counts;
}

function sumByMember(rows: Array<{ member_id: string; points: number }>) {
  const counts = new Map<string, number>();
  rows.forEach((row) => counts.set(row.member_id, (counts.get(row.member_id) ?? 0) + row.points));
  return counts;
}

function latestAttendanceByMember(rows: Attendance[]) {
  const latest = new Map<string, string>();
  rows.forEach((row) => {
    const current = latest.get(row.member_id);
    if (!current || row.attended_on > current) latest.set(row.member_id, row.attended_on);
  });
  return latest;
}

function trainingDaysBetween(from: string, to: string, closures: CalendarClosure[]) {
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start >= end) return 0;
  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    if (!isSummerBreak(cursor) && !isExplicitlyClosed(cursor, closures)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function isExplicitlyClosed(date: Date, closures: CalendarClosure[]) {
  return closures.some((closure) => {
    const starts = new Date(`${closure.starts_on}T00:00:00`);
    const ends = new Date(`${closure.ends_on}T00:00:00`);
    return starts <= date && date <= ends;
  });
}

function isSummerBreak(date: Date) {
  const month = date.getMonth() + 1;
  return month === 7 || month === 8;
}

function adultInactivityPenalty(daysWithoutAttendance: number) {
  if (daysWithoutAttendance >= 999) return 40;
  if (daysWithoutAttendance <= 7) return 0;
  if (daysWithoutAttendance <= 14) return 3;
  if (daysWithoutAttendance <= 30) return 8;
  if (daysWithoutAttendance <= 60) return 15;
  if (daysWithoutAttendance <= 90) return 25;
  return 35;
}

function daysAgo(days: number) {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

function todayIso() {
  return isoDate(new Date());
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatHumanDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

function cleanEnv(value: string | undefined) {
  return value?.replace(/^\uFEFF/, "").trim();
}

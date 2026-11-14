import { clubMilestones } from "@/lib/club-milestones";
import { loadExamOutlooks } from "@/lib/exam-outlook-data";
import { getUpcomingExamCalls } from "@/lib/exam-calls-data";
import { formatTelegramExamOutlooks } from "@/lib/telegram-exam-outlook";
import { summarizePeriod } from "@/lib/telegram-period-stats";
import { getPendingFamilyBillingContexts } from "@/lib/family-units";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAllPages } from "@/lib/load-all-pages";

type NotificationType = "daily_ranking" | "monthly_stats" | "semester_stats" | "yearly_stats" | "test";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: "active" | "inactive";
  birth_date?: string | null;
  joined_on?: string | null;
  semaphore: string | null;
  next_exam_on: string | null;
  attendance_count: number | null;
  minimum_attendance: number | null;
  missing_attendance: number | null;
  exam_notice: string | null;
  free_trial_enabled?: boolean | null;
  free_trial_started_on?: string | null;
  free_trial_ends_on?: string | null;
  free_trial_notice_read_at?: string | null;
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
  member_id?: string;
  course_date: string;
  kind: "national" | "international" | "taikai";
  title?: string | null;
  location?: string | null;
  sensei?: string | null;
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

type PeriodClass = {
  id: string;
  name: string;
  class_date: string;
  class_group: "kids" | "adults";
  closed: boolean;
};

type PeriodAttendance = {
  class_id: string | null;
  member_id: string;
  attended_on: string;
  members: {
    display_name: string;
    legacy_id?: string | null;
    class: "kids" | "adults";
  } | null;
};

type PeriodTechnique = {
  class_id: string | null;
  technique_id: string | null;
  counts_for_stats: boolean | null;
  classes: { class_group: "kids" | "adults" } | null;
  member_id: string;
  class_date: string;
  technique_name: string;
  technique_grade: string | null;
  category: string | null;
  members: {
    class: "kids" | "adults";
    display_name: string;
    legacy_id: string | null;
  } | null;
};

type PeriodExam = {
  exam_date: string;
  grade: string;
  members: {
    display_name: string;
    class: "kids" | "adults";
  } | null;
};

type NotificationResult = {
  notificationType: NotificationType;
  status: "sent" | "failed" | "skipped";
  message: string;
  error?: string;
};

type NotificationSetting = {
  notification_type: NotificationType;
  enabled: boolean;
  paused_reason: string | null;
  pause_starts_on: string | null;
  pause_ends_on: string | null;
};

const today = new Date();
const date30 = daysAgo(30);
const date60 = daysAgo(60);
const date90 = daysAgo(90);
const date180 = daysAgo(180);

export async function sendTelegramDigest(notificationType: NotificationType, options: { force?: boolean } = {}): Promise<NotificationResult> {
  const period = resolvePeriod(notificationType);
  const supabase = createAdminClient();

  if (!options.force && notificationType !== "test") {
    const setting = await getNotificationSetting(notificationType);
    const pauseReason = setting ? notificationPauseReason(setting, todayIso()) : null;
    if (pauseReason) {
      const message = pauseReason;
      await upsertNotificationLog({
        notificationType,
        periodStart: period?.start ?? null,
        periodEnd: period?.end ?? null,
        status: "skipped",
        telegramChatId: cleanEnv(process.env.TELEGRAM_CHAT_ID) ?? null,
        message,
        errorMessage: null
      });
      return { notificationType, status: "skipped", message };
    }
  }

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
    return { notificationType, status: "skipped", message: "Notificacion ya enviada para este periodo." };
  }

  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
  let message = "";
  try {
    message = await buildNotificationMessage(notificationType, period);
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
    if (!message) message = `No se pudo construir la notificacion ${notificationType}.`;
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
    return `<b>SKBC Gipuzkoa</b>\nPrueba Telegram correcta.\n${formatHumanDate(todayIso())}`;
  }

  if (notificationType === "daily_ranking") {
    const digest = await buildDailyDigest();
    return [
      `🥋 <b>SKBC GIPUZKOA · PARTE DIARIO</b>`,
      `<i>${formatHumanDate(todayIso())}</i>`,
      "",
      formatTodayClasses(digest.todayClasses),
      "",
      formatBirthdayAlerts(digest.birthdayAlerts),
      "",
      formatFreeTrialAlerts(digest.freeTrialAlerts),
      "",
      formatRanking("🏆 Top adultos", digest.adults),
      "",
      formatRanking("🌱 Top niños", digest.kids),
      "",
      formatTelegramExamOutlooks(digest.examOutlooks)
    ].filter(Boolean).join("\n").trim();
  }

  const stats = await buildPeriodStats(period);
  const dojoMilestones = notificationType === "yearly_stats" ? await formatDojoMilestones(period) : "";
  const title = notificationType === "monthly_stats"
    ? "Resumen mensual"
    : notificationType === "semester_stats"
      ? "Resumen semestral"
      : "Resumen anual";

  return [
    `🥋 <b>SKBC GIPUZKOA · ${html(title.toUpperCase())}</b>`,
    `<i>${formatHumanDate(period.start)} - ${formatHumanDate(period.end)}</i>`,
    ...(period.end > todayIso() ? [`<i>Periodo en curso; datos registrados a ${formatHumanDate(todayIso())}. El balance no es el cierre definitivo del periodo.</i>`] : []),
    "",
    formatClubNumbers(stats),
    "",
    formatYearGrowth(stats),
    dojoMilestones,
    "",
    formatActiveGrades(stats),
    "",
    formatAttendanceStats(stats),
    "",
    formatTechnicalStats(stats),
    "",
    formatCourseStats(stats),
    "",
    formatExamStats(stats),
    "",
    formatPeriodAttendance("🏆 Asistencia adultos", stats.topAdultAttendance),
    "",
    formatPeriodAttendance("🌱 Asistencia niños", stats.topKidsAttendance),
    "",
    formatTelegramExamOutlooks(stats.examOutlooks)
  ].join("\n").trim();
}

export async function updateTelegramNotificationSetting(
  notificationType: NotificationType,
  enabled: boolean,
  pausedReason: string | null,
  pauseStartsOn: string | null = null,
  pauseEndsOn: string | null = null
) {
  const configurableTypes: NotificationType[] = ["daily_ranking", "monthly_stats", "semester_stats", "yearly_stats"];
  if (!configurableTypes.includes(notificationType)) {
    throw new Error("Tipo de notificacion no configurable.");
  }

  const { error } = await createAdminClient()
    .from("telegram_notification_settings")
    .upsert({
      notification_type: notificationType,
      enabled,
      paused_reason: enabled ? null : pausedReason,
      pause_starts_on: normalizeDateOrNull(pauseStartsOn),
      pause_ends_on: normalizeDateOrNull(pauseEndsOn),
      updated_at: new Date().toISOString()
    }, { onConflict: "notification_type" });

  if (error) throw error;
}

async function loadNextTelegramExamOutlooks() {
  const [outlooks, calls] = await Promise.all([loadExamOutlooks({ includeNotificationReadiness: true }), getUpcomingExamCalls()]);
  const nextDate = calls[0]?.call_date;
  return [...outlooks.values()].filter(row => row.notificationReady || row.notificationApproval || (nextDate && row.callDate === nextDate));
}

async function buildDailyDigest() {
  const supabase = createAdminClient();
  const [
    membersResult,
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
      .select("id,legacy_id,display_name,class,grade,status,birth_date,joined_on,semaphore,next_exam_on,attendance_count,minimum_attendance,missing_attendance,exam_notice,free_trial_enabled,free_trial_started_on,free_trial_ends_on,free_trial_notice_read_at")
      .eq("status", "active")
      .returns<Member[]>(),
    supabase.from("courses").select("member_id,course_date,kind").gte("course_date", date60).returns<Course[]>(),
    supabase.from("adult_ranking_bonuses").select("member_id,bonus_date,points,active,permanent").returns<AdultBonus[]>(),
    supabase
      .from("child_rankings")
      .select("member_id,score,position,attendance_30d,attendance_90d,members(display_name,legacy_id,grade,status)")
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

  const [attendance, technical] = await Promise.all([
    loadAllPages<Attendance>((from, to) => supabase
      .from("attendance_logs")
      .select("member_id,attended_on")
      .gte("attended_on", date180)
      .order("attended_on", { ascending: false })
      .range(from, to)
      .returns<Attendance[]>()),
    loadAllPages<TechnicalHistory>((from, to) => supabase
      .from("member_technical_history")
      .select("member_id,class_date")
      .gte("class_date", date90)
      .eq("completed", true)
      .order("class_date", { ascending: false })
      .range(from, to)
      .returns<TechnicalHistory[]>())
  ]);

  if (membersResult.error) throw membersResult.error;
  if (coursesResult.error) throw coursesResult.error;

  const members = membersResult.data ?? [];
  const adults = buildAdultRanking(
    members,
    attendance,
    technical,
    coursesResult.data ?? [],
    bonusesResult.error ? [] : bonusesResult.data ?? [],
    blackBeltResult.error ? [] : blackBeltResult.data ?? [],
    shakujoResult.error ? [] : shakujoResult.data ?? [],
    closuresResult.error ? [] : closuresResult.data ?? []
  ).slice(0, 10);

  const attendanceByKid = new Map<string, { attendance30: number; attendance90: number }>();
  for (const row of attendance) {
    if (row.attended_on < date90) continue;
    const current = attendanceByKid.get(row.member_id) ?? { attendance30: 0, attendance90: 0 };
    current.attendance90 += 1;
    if (row.attended_on >= date30) current.attendance30 += 1;
    attendanceByKid.set(row.member_id, current);
  }

  const kids = (childRankingResult.error ? [] : childRankingResult.data ?? [])
    .filter((row) => row.members?.status === "active")
    .map((row) => {
      const live = attendanceByKid.get(row.member_id) ?? { attendance30: 0, attendance90: 0 };
      return { ...row, attendance_30d: live.attendance30, attendance_90d: live.attendance90, score: live.attendance30 * 3 + live.attendance90 };
    })
    .sort((a, b) => b.score - a.score || (a.members?.display_name ?? "").localeCompare(b.members?.display_name ?? "", "es"))
    .slice(0, 10)
    .map((row, index) => ({
      name: row.members?.display_name ?? "Kenshi",
      grade: row.members?.grade ?? "-",
      score: row.score,
      detail: `30/90: ${row.attendance_30d}/${row.attendance_90d}`,
      position: index + 1
    }));

  return {
    adults,
    kids,
    todayClasses: todayClassesResult.data ?? [],
    birthdayAlerts: birthdayAlerts(members),
    freeTrialAlerts: await freeTrialAlerts(),
    examOutlooks: await loadNextTelegramExamOutlooks()
  };
}

async function loadPeriodRows(period: { start: string; end: string }) {
  const supabase = createAdminClient();
  const [classes, attendance, techniques, exams, courses, allMembers] =
    await Promise.all([
      loadAllPages<PeriodClass>((from, to) =>
        supabase
          .from("classes")
          .select("id,name,class_date,class_group,closed")
          .gte("class_date", period.start)
          .lte("class_date", period.end)
          .order("id")
          .range(from, to)
          .returns<PeriodClass[]>(),
      ),
      loadAllPages<PeriodAttendance>((from, to) =>
        supabase
          .from("attendance_logs")
          .select(
            "class_id,member_id,attended_on,members(display_name,legacy_id,class)",
          )
          .gte("attended_on", period.start)
          .lte("attended_on", period.end)
          .order("id")
          .range(from, to)
          .returns<PeriodAttendance[]>(),
      ),
      loadAllPages<PeriodTechnique>((from, to) =>
        supabase
          .from("member_technical_history")
          .select(
            "class_id,technique_id,counts_for_stats,member_id,class_date,technique_name,technique_grade,category,members(display_name,legacy_id,class),classes(class_group)",
          )
          .gte("class_date", period.start)
          .lte("class_date", period.end)
          .eq("completed", true)
          .order("id")
          .range(from, to)
          .returns<PeriodTechnique[]>(),
      ),
      loadAllPages<PeriodExam>((from, to) =>
        supabase
          .from("exams")
          .select("exam_date,grade,members(display_name,class)")
          .gte("exam_date", period.start)
          .lte("exam_date", period.end)
          .order("id")
          .range(from, to)
          .returns<PeriodExam[]>(),
      ),
      loadAllPages<Course>((from, to) =>
        supabase
          .from("courses")
          .select("member_id,kind,course_date,title,location,sensei")
          .gte("course_date", period.start)
          .lte("course_date", period.end)
          .order("id")
          .range(from, to)
          .returns<Course[]>(),
      ),
      loadAllPages<Member>((from, to) =>
        supabase
          .from("members")
          .select(
            "id,legacy_id,display_name,class,grade,status,joined_on,semaphore,next_exam_on,attendance_count,minimum_attendance,missing_attendance,exam_notice",
          )
          .order("id")
          .range(from, to)
          .returns<Member[]>(),
      ),
    ]);
  return { classes, attendance, techniques, exams, courses, allMembers };
}
async function buildPeriodStats(period: { start: string; end: string }) {
  const { classes, attendance, techniques, exams, courses, allMembers } =
    await loadPeriodRows(period);
  const members = allMembers.filter((m) => m.status === "active");
  const summary = summarizePeriod(classes, attendance, techniques, members);
  const nationalCourseRows = courses.filter((r) => r.kind === "national");
  const internationalCourseRows = courses.filter(
    (r) => r.kind === "international",
  );
  const taikaiCourseRows = courses.filter((r) => r.kind === "taikai");
  const nationalCourseEvents = uniqueCourseEvents(nationalCourseRows);
  const internationalCourseEvents = uniqueCourseEvents(internationalCourseRows);
  const taikaiCourseEvents = uniqueCourseEvents(taikaiCourseRows);
  const newMembers = allMembers.filter(
    (m) =>
      m.joined_on && m.joined_on >= period.start && m.joined_on <= period.end,
  ).length;
  const yearGrowth = await buildYearGrowthStats(period, {
    classes: summary.classes,
    attendance: summary.totalAttendance,
    adultAttendance: summary.adultAttendance,
    kidsAttendance: summary.kidsAttendance,
    exams: exams.length,
    nationalCourses: nationalCourseEvents.length,
    internationalCourses: internationalCourseEvents.length,
    taikaiCourses: taikaiCourseEvents.length,
    newMembers,
  });
  return {
    ...summary,
    activeMembers: members.length,
    activeAdults: members.filter((m) => m.class === "adults").length,
    activeKids: members.filter((m) => m.class === "kids").length,
    activeAdultGrades: activeGradeSummary(
      members.filter((m) => m.class === "adults"),
    ),
    activeKidsGrades: activeGradeSummary(
      members.filter((m) => m.class === "kids"),
    ),
    registeredClasses: classes.length,
    closedClasses: classes.filter((c) => c.closed).length,
    newMembers,
    passedExams: exams.length,
    examsByGrade: topCounts(
      exams.map((r) => r.grade),
      8,
    ),
    nationalCourses: nationalCourseEvents.length,
    internationalCourses: internationalCourseEvents.length,
    taikaiCourses: taikaiCourseEvents.length,
    nationalCourseParticipants: nationalCourseRows.length,
    internationalCourseParticipants: internationalCourseRows.length,
    taikaiCourseParticipants: taikaiCourseRows.length,
    topCourses: [
      ...nationalCourseEvents,
      ...internationalCourseEvents,
      ...taikaiCourseEvents,
    ]
      .sort(
        (a, b) =>
          b.participants - a.participants || a.date.localeCompare(b.date),
      )
      .slice(0, 6),
    yearGrowth,
    examOutlooks: await loadNextTelegramExamOutlooks(),
  };
}

export async function sendTelegramMessage(text: string) {
  const token = cleanEnv(process.env.TELEGRAM_BOT_TOKEN);
  const chatId = cleanEnv(process.env.TELEGRAM_CHAT_ID);
  if (!token || !chatId) {
    throw new Error("Faltan TELEGRAM_BOT_TOKEN y/o TELEGRAM_CHAT_ID.");
  }

  for (const chunk of splitTelegramMessage(text)) {
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: chunk,
        parse_mode: "HTML",
        disable_web_page_preview: true
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Telegram ${response.status}: ${detail.slice(0, 300)}`);
    }
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
  const attendance180 = countByMember(attendance.filter((row) => row.attended_on >= date180));
  const clubTrainingDates = uniqueSorted(attendance.map((row) => row.attended_on));
  const currentClassDate = clubTrainingDates.at(-1) ?? null;
  const technical90 = countByMember(technical);
  const nationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "national" && row.member_id).map((row) => ({ member_id: row.member_id as string, points: 1 })));
  const internationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "international" && row.member_id).map((row) => ({ member_id: row.member_id as string, points: 3 })));
  const taikaiCoursePoints = sumByMember(courses.filter((row) => row.kind === "taikai" && row.member_id).map((row) => ({ member_id: row.member_id as string, points: 2 })));
  const fixedBonus = sumByMember(
    bonuses
      .filter((row) => row.active && row.permanent)
      .map((row) => ({ member_id: row.member_id, points: row.points }))
  );
  const oneTimeBonus = sumByMember(
    bonuses
      .filter((row) => row.active && !row.permanent && row.bonus_date === currentClassDate)
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
      const a180 = attendance180.get(member.id) ?? 0;
      const t90 = technical90.get(member.id) ?? 0;
      const last = lastAttendance.get(member.id);
      const daysWithoutAttendance = last ? trainingDaysBetween(last, todayIso(), closures) : 999;
      const c30 = attendanceRate(a30, possibleClubDays(clubTrainingDates, date30, member.joined_on));
      const c90 = attendanceRate(a90, possibleClubDays(clubTrainingDates, date90, member.joined_on));
      const c180 = attendanceRate(a180, possibleClubDays(clubTrainingDates, date180, member.joined_on));
      const constancyScore = Math.round(c30 * 45 + c90 * 35 + c180 * 25);
      const attendanceVolume = Math.min(a90, 12);
      const bonusScore = ((fixedBonus.get(member.id) ?? 0) * 8) + ((oneTimeBonus.get(member.id) ?? 0) * 4);
      const score = Math.max(
        0,
        constancyScore +
          attendanceVolume +
          (nationalCoursePoints.get(member.id) ?? 0) +
          (internationalCoursePoints.get(member.id) ?? 0) +
          (taikaiCoursePoints.get(member.id) ?? 0) +
          bonusScore +
          (blackBeltPoints.get(member.id) ?? 0) +
          (shakujoPoints.get(member.id) ?? 0) -
          adultInactivityPenalty(daysWithoutAttendance)
      );
      return {
        name: member.display_name,
        grade: member.grade ?? "-",
        score,
        detail: `asist. 30/90/180: ${a30}/${a90}/${a180} - constancia ${Math.round(c90 * 100)}% - tecnicas ${t90}`,
        position: 0
      };
    })
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .map((row, index) => ({ ...row, position: index + 1 }));
}

async function freeTrialAlerts() {
  const limit = todayIso();
  return (await getPendingFamilyBillingContexts())
    .filter((context) => Boolean(context.billing.newestMember?.trialEndsOn) && context.billing.newestMember!.trialEndsOn! <= limit)
    .sort((a, b) => (a.billing.newestMember?.trialEndsOn ?? "9999-12-31").localeCompare(b.billing.newestMember?.trialEndsOn ?? "9999-12-31"))
    .map((context) => ({
      name: context.unitName || context.billing.members.map((member) => member.display_name).join(", "),
      grade: `${context.billing.members.length} personas`,
      className: "unidad familiar",
      taskStatus: context.taskStatus,
      joinedOn: context.billing.newestMember?.trialStartedOn ?? null,
      noticeOn: context.billing.newestMember?.trialEndsOn ?? null,
      billingOn: context.billing.billingOn,
      endsOn: context.billing.newestMember?.trialEndsOn ?? null
    }));
}

function birthdayAlerts(members: Member[]) {
  const today = todayIso();
  const todayMonthDay = monthDay(today);
  return members
    .filter((member) =>
      member.status === "active" &&
      Boolean(member.birth_date) &&
      monthDay(member.birth_date!) === todayMonthDay
    )
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "es"))
    .map((member) => ({
      name: member.display_name,
      grade: member.grade ?? "-",
      className: member.class === "kids" ? "ninos" : "adultos",
      age: ageOnDate(member.birth_date!, today)
    }));
}

function formatBirthdayAlerts(rows: ReturnType<typeof birthdayAlerts>) {
  if (!rows.length) return "";
  return [
    "<b>Cumpleanos del club</b>",
    ...rows.map((row) => `- <b>${html(row.name)}</b> (${row.className}, ${html(row.grade)}) cumple ${row.age} anos hoy.`)
  ].join("\n");
}

function formatFreeTrialAlerts(rows: Awaited<ReturnType<typeof freeTrialAlerts>>) {
  if (!rows.length) return "<b>Seguimiento de hojas de cobro</b>\nSin acciones pendientes.";
  const today = todayIso();
  const toDeliver = rows.filter((row) => row.taskStatus !== "delivered");
  const awaitingReturn = rows.filter((row) => row.taskStatus === "delivered");
  const formatDeliveryRow = (row: (typeof rows)[number]) => {
    const state = row.noticeOn && row.noticeOn < today ? "mes gratis finalizado" : row.noticeOn === today ? "mes gratis finaliza hoy" : "mes gratis finaliza";
    const action = row.taskStatus === "generated" ? "entregar hoja preparada" : "preparar y entregar hoja";
    return `- <b>${html(row.name)}</b> (${row.className}, ${html(row.grade)}) - ${action} - ${state}${row.noticeOn ? ` ${formatHumanDate(row.noticeOn)}` : ""}${row.billingOn ? ` - primer cobro ${formatHumanDate(row.billingOn)}` : ""}${row.joinedOn ? ` - ingreso ${formatHumanDate(row.joinedOn)}` : ""}`;
  };
  const formatReturnRow = (row: (typeof rows)[number]) =>
    `- <b>${html(row.name)}</b> (${row.className}, ${html(row.grade)}) - hoja entregada; pendiente de recibir los datos bancarios${row.billingOn ? ` - primer cobro ${formatHumanDate(row.billingOn)}` : ""}`;

  const sections = [
    toDeliver.length
      ? [
        "<b>Hojas que debes entregar</b>",
        ...toDeliver.slice(0, 12).map(formatDeliveryRow),
        toDeliver.length > 12 ? `Y ${toDeliver.length - 12} mas por entregar.` : ""
      ].filter(Boolean).join("\n")
      : "",
    awaitingReturn.length
      ? [
        "<b>Hojas entregadas pendientes de devolución</b>",
        ...awaitingReturn.slice(0, 12).map(formatReturnRow),
        awaitingReturn.length > 12 ? `Y ${awaitingReturn.length - 12} mas pendientes de devolución.` : ""
      ].filter(Boolean).join("\n")
      : ""
  ].filter(Boolean);
  return sections.join("\n\n");
}

function uniqueCourseEvents(rows: Course[]) {
  const map = new Map<string, {
    kind: Course["kind"];
    date: string;
    title: string;
    location: string;
    sensei: string;
    participants: number;
  }>();

  for (const row of rows) {
    const key = [
      row.kind,
      row.course_date,
      normalizeKey(row.title || "Curso"),
      normalizeKey(row.location || ""),
      normalizeKey(row.sensei || "")
    ].join("|");
    const current = map.get(key);
    if (current) {
      current.participants += 1;
    } else {
      map.set(key, {
        kind: row.kind,
        date: row.course_date,
        title: row.title?.trim() || "Curso",
        location: row.location?.trim() || "",
        sensei: row.sensei?.trim() || "",
        participants: 1
      });
    }
  }

  return Array.from(map.values());
}

function topCounts(values: Array<string | null | undefined>, limit: number) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const label = String(value ?? "").trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function activeGradeSummary(members: Member[]) {
  const counts = new Map<string, number>();
  for (const member of members) {
    const grade = normalizeGradeLabel(member.grade);
    counts.set(grade, (counts.get(grade) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([grade, count]) => ({ grade, count, order: gradeOrder(grade) }))
    .sort((a, b) => a.order - b.order || a.grade.localeCompare(b.grade));
}

async function buildYearGrowthStats(
  period: { start: string; end: string },
  current: {
    classes: number;
    attendance: number;
    adultAttendance: number;
    kidsAttendance: number;
    exams: number;
    nationalCourses: number;
    internationalCourses: number;
    taikaiCourses: number;
    newMembers: number;
  },
) {
  const startYear = Number(period.start.slice(0, 4));
  const isFullYear =
    period.start === `${startYear}-01-01` &&
    period.end === `${startYear}-12-31`;
  if (!isFullYear || !Number.isFinite(startYear)) return null;

  const previous = {
    start: `${startYear - 1}-01-01`,
    end: `${startYear - 1}-12-31`,
  };
  const rows = await loadPeriodRows(previous);
  const previousSummary = summarizePeriod(
    rows.classes,
    rows.attendance,
    rows.techniques,
    [],
  );
  const previousAttendance = previousSummary.attendance;
  const previousCourses = rows.courses;
  const previousClubClassDays = previousSummary.classes;
  const previousNationalCourses = uniqueCourseEvents(
    previousCourses.filter((r) => r.kind === "national"),
  ).length;
  const previousInternationalCourses = uniqueCourseEvents(
    previousCourses.filter((r) => r.kind === "international"),
  ).length;
  const previousTaikaiCourses = uniqueCourseEvents(
    previousCourses.filter((r) => r.kind === "taikai"),
  ).length;

  return {
    year: startYear,
    previousYear: startYear - 1,
    hasAttendanceBaseline: previousSummary.totalAttendance > 0 || previousSummary.classes > 0,
    classes: compareNumber(current.classes, previousClubClassDays),
    attendance: compareNumber(current.attendance, previousAttendance.length),
    adultAttendance: compareNumber(
      current.adultAttendance,
      previousSummary.adultAttendance,
    ),
    kidsAttendance: compareNumber(
      current.kidsAttendance,
      previousSummary.kidsAttendance,
    ),
    exams: compareNumber(current.exams, rows.exams.length),
    nationalCourses: compareNumber(
      current.nationalCourses,
      previousNationalCourses,
    ),
    internationalCourses: compareNumber(
      current.internationalCourses,
      previousInternationalCourses,
    ),
    taikaiCourses: compareNumber(current.taikaiCourses, previousTaikaiCourses),
    newMembers: compareNumber(
      current.newMembers,
      rows.allMembers.filter(
        (m) =>
          m.joined_on &&
          m.joined_on >= previous.start &&
          m.joined_on <= previous.end,
      ).length,
    ),
  };
}

function splitTelegramMessage(text: string) {
  const limit = 3900;
  const lines = text.split("\n");
  const chunks: string[] = [];
  let current = "";

  for (const line of lines) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > limit && current) {
      chunks.push(current);
      current = line;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks.length ? chunks : [text.slice(0, limit)];
}

function html(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatTodayClasses(classes: Array<{ name: string; class_group: "kids" | "adults"; closed: boolean; plan_generated: boolean }>) {
  if (!classes.length) return "📅 <b>Clase de hoy</b>\nNo hay clase creada.";
  return [
    "📅 <b>Clase de hoy</b>",
    ...classes.map((item) => {
      const group = item.class_group === "kids" ? "niños" : "adultos";
      const status = item.closed ? "cerrada" : "abierta";
      const plan = item.class_group === "adults" ? (item.plan_generated ? "plan OK" : "plan pendiente") : "solo asistencia";
      return `• <b>${html(item.name)}</b> (${group}): ${status}, ${plan}`;
    })
  ].join("\n");
}

function formatRanking(title: string, rows: Array<{ name: string; grade: string; score: number; detail: string; position: number }>) {
  if (!rows.length) return `<b>${html(title)}</b>\nSin datos.`;
  return [
    `<b>${html(title)}</b>`,
    ...rows.slice(0, 10).map((row) => `${row.position}. <b>${html(row.name)}</b> · ${row.score} pts\n   ${html(row.grade)} · ${html(row.detail)}`)
  ].join("\n");
}

function formatPeriodAttendance(
  title: string,
  groups: Array<{ count: number; names: string[] }>,
) {
  return [
    "<b>" + html(title) + "</b>",
    "<i>Personas con mayor asistencia; incluye todos los empates en el corte de 10 personas. Sin sensei.</i>",
    ...groups.flatMap((g) => [
      "Con " + g.count + " asistencias:",
      ...g.names.map((name) => "• " + html(name)),
    ]),
    groups.length ? "" : "Sin datos.",
  ]
    .filter(Boolean)
    .join("\n");
}
function formatClubNumbers(
  stats: Awaited<ReturnType<typeof buildPeriodStats>>,
) {
  return [
    "📌 <b>Club en numeros</b>",
    "• Plantilla activa actual: <b>" +
      stats.activeMembers +
      "</b> (" +
      stats.activeAdults +
      " adultos · " +
      stats.activeKids +
      " niños)",
    "<i>La plantilla es la de hoy; la asistencia corresponde al periodo.</i>",
    "• Fechas distintas con clase del club: <b>" + stats.classes + "</b>",
    "• Sesiones adultos: <b>" +
      stats.adultClasses +
      "</b> · sesiones niños: <b>" +
      stats.kidsClasses +
      "</b>",
    "• Sesiones inferidas por asistencia sin clase registrada: <b>" +
      stats.inferredClasses +
      "</b>",
    "• Clases registradas cerradas: <b>" +
      stats.closedClasses +
      "/" +
      stats.registeredClasses +
      "</b>",
    "• Personas asistentes únicas: <b>" +
      stats.uniqueAttendees +
      "</b> (" +
      stats.uniqueAdultAttendees +
      " adultos · " +
      stats.uniqueKidsAttendees +
      " niños)",
    ...(stats.overlappingGroupAttendees ? [
      "• Personas registradas en ambos grupos: <b>" + stats.overlappingGroupAttendees + "</b>",
      "<i>Los subtotales por grupo no se suman: una misma persona puede asistir a adultos y niños en el periodo.</i>"
    ] : []),
    "• Asistentes históricos fuera de la plantilla activa actual: <b>" +
      stats.historicalNonCurrentAttendees +
      "</b>",
    "• Altas con fecha de ingreso registrada en el periodo: <b>" +
      stats.newMembers +
      "</b>",
  ].join("\n");
}

function formatYearGrowth(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  if (!stats.yearGrowth) return "";
  const growth = stats.yearGrowth;
  const attendanceDelta = (delta: number) => growth.hasAttendanceBaseline ? formatDeltaWords(delta) : "sin registros del año anterior; no comparable";
  return [
    `📈 <b>Balance anual ${growth.year}</b>`,
    `<i>Comparado con ${growth.previousYear}; el paréntesis indica diferencia respecto al año anterior.</i>`,
    `• Nuevos kenshis: <b>${growth.newMembers.current}</b> (${formatDeltaWords(growth.newMembers.delta)})`,
    `• Asistencias totales: <b>${growth.attendance.current}</b> (${attendanceDelta(growth.attendance.delta)})`,
    `• Adultos: <b>${growth.adultAttendance.current}</b> (${attendanceDelta(growth.adultAttendance.delta)}) · niños: <b>${growth.kidsAttendance.current}</b> (${attendanceDelta(growth.kidsAttendance.delta)})`,
    `• Dias de clase del club: <b>${growth.classes.current}</b> (${attendanceDelta(growth.classes.delta)})`,
    `• Examenes: <b>${growth.exams.current}</b> (${formatDeltaWords(growth.exams.delta)})`,
    `• Cursos: nacionales <b>${growth.nationalCourses.current}</b> (${formatDeltaWords(growth.nationalCourses.delta)}) · internacionales <b>${growth.internationalCourses.current}</b> (${formatDeltaWords(growth.internationalCourses.delta)}) · taikai <b>${growth.taikaiCourses.current}</b> (${formatDeltaWords(growth.taikaiCourses.delta)})`
  ].join("\n");
}

function formatActiveGrades(
  stats: Awaited<ReturnType<typeof buildPeriodStats>>,
) {
  return [
    "🎖️ <b>Grados de la plantilla activa actual</b>",
    "Adultos:",
    ...stats.activeAdultGrades.map(
      (g) => "• " + html(g.grade) + ": <b>" + g.count + "</b>",
    ),
    "Niños:",
    ...stats.activeKidsGrades.map(
      (g) => "• " + html(g.grade) + ": <b>" + g.count + "</b>",
    ),
  ].join("\n");
}
function formatAttendanceStats(
  stats: Awaited<ReturnType<typeof buildPeriodStats>>,
) {
  const peak = stats.busiestSession;
  return [
    "👥 <b>Asistencia</b>",
    "• Participaciones acumuladas: <b>" +
      stats.totalAttendance +
      "</b> (una persona en varias clases suma varias asistencias; incluye instructor si está registrado)",
    "• Adultos: <b>" +
      stats.adultAttendance +
      "</b> · media <b>" +
      stats.averageAdultAttendancePerClass +
      "</b> por sesión adulta (" +
      stats.adultClasses +
      " sesiones)",
    "• Niños: <b>" +
      stats.kidsAttendance +
      "</b> · media <b>" +
      stats.averageKidsAttendancePerClass +
      "</b> por sesión infantil (" +
      stats.kidsClasses +
      " sesiones)",
    "• Sin grupo identificable: <b>" + stats.unclassifiedAttendance + "</b>",
    "• Media del club: <b>" +
      stats.averageAttendancePerClass +
      "</b> participaciones por fecha (" +
      stats.classes +
      " fechas)",
    "• Asistencia completa a todas las sesiones del grupo (sin sensei): <b>" +
      stats.fullAttendanceAdults +
      "</b> adultos · <b>" +
      stats.fullAttendanceKids +
      "</b> niños",
    peak
      ? "• Sesión con mayor asistencia: " +
        html(peak.session?.name || "Clase sin identificar") +
        (peak.session ? " · " + formatHumanDate(peak.session.class_date) : "") +
        " · <b>" +
        peak.count +
        "</b> participaciones"
      : "",
    stats.busiestDate
      ? "• Fecha con mayor asistencia: " +
        formatHumanDate(stats.busiestDate.date) +
        " · <b>" +
        stats.busiestDate.count +
        "</b> participaciones"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
function formatTechnicalStats(
  stats: Awaited<ReturnType<typeof buildPeriodStats>>,
) {
  return [
    "🥋 <b>Trabajo tecnico adulto</b>",
    "• Técnicas impartidas sumadas por clase: <b>" +
      stats.techniques +
      "</b> (una técnica en una clase cuenta una vez, aunque la practiquen varios alumnos)",
    "• Tecnicas diferentes trabajadas: <b>" + stats.uniqueTechniques + "</b>",
    stats.topTechniques.length
      ? "• Técnicas con más sesiones:\n" +
        stats.topTechniques
          .map((t) => "  • " + html(t.label) + " · " + t.count + " sesiones")
          .join("\n")
      : "• Sin datos técnicos adultos.",
    stats.topTechnicalMembers.length
      ? "• Participación técnica registrada por alumno (clases distintas, sin sensei):\n" +
        stats.topTechnicalMembers
          .map((t) => "  • " + html(t.label) + " · " + t.count + " clases")
          .join("\n")
      : "",
    stats.technicalLegacyRows
      ? "<i>Registros históricos sin clase enlazada: agrupados por fecha adulta.</i>"
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatCourseStats(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  return [
    "🌍 <b>Cursos</b>",
    `• Cursos nacionales celebrados: <b>${stats.nationalCourses}</b> (${stats.nationalCourseParticipants} participaciones)`,
    `• Cursos internacionales celebrados: <b>${stats.internationalCourses}</b> (${stats.internationalCourseParticipants} participaciones)`,
    `• Taikai celebrados: <b>${stats.taikaiCourses}</b> (${stats.taikaiCourseParticipants} participaciones)`,
    stats.topCourses.length ? "• Cursos con mas asistencia:\n" + stats.topCourses.map((course, index) => {
      const kind = course.kind === "international" ? "INT" : course.kind === "taikai" ? "TAIKAI" : "NAC";
      return `  ${index + 1}. [${kind}] ${html(course.title)} · ${formatHumanDate(course.date)} · ${course.participants}`;
    }).join("\n") : "• Sin cursos en el periodo."
  ].join("\n");
}

function formatExamStats(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  return [
    "🎓 <b>Examenes</b>",
    `• Examenes registrados/aprobados: <b>${stats.passedExams}</b>`,
    stats.examsByGrade.length ? "• Por grado:\n" + stats.examsByGrade.map((item) => `  ${html(item.label)} · ${item.count}`).join("\n") : "• Por grado: sin datos"
  ].join("\n");
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

function uniqueSorted(values: string[]) {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function possibleClubDays(clubDates: string[], since: string, _joinedOn: string | null | undefined) {
  return clubDates.filter((date) => date >= since).length;
}

function attendanceRate(attendanceCount: number, possibleDays: number) {
  if (possibleDays <= 0) return 0;
  return Math.min(1, attendanceCount / possibleDays);
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

function normalizeKey(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

function normalizeGradeLabel(value: string | null | undefined) {
  return normalizeKey(value || "SIN GRADO");
}

function gradeOrder(grade: string) {
  const normalized = normalizeGradeLabel(grade).replace(/\s*-\s*/g, "-");
  const order: Record<string, number> = {
    "MINARAI": 10,
    "BLANCO-AMARILLO": 15,
    "5 KYU": 20,
    "AMARILLO-NARANJA": 25,
    "4 KYU": 30,
    "NARANJA-VERDE": 35,
    "3 KYU": 40,
    "VERDE-AZUL": 45,
    "2 KYU": 50,
    "AZUL-MARRON": 55,
    "1 KYU": 60,
    "1 DAN": 70,
    "2 DAN": 80,
    "3 DAN": 90,
    "4 DAN": 100,
    "5 DAN": 110,
    "6 DAN": 120,
    "7 DAN": 130,
    "8 DAN": 140,
    "9 DAN": 150
  };
  return order[normalized] ?? 999;
}

function distinctDates(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => String(value ?? "").slice(0, 10)).filter(Boolean)));
}

function isSenseiLegacy(legacyId: string | null | undefined) {
  return String(legacyId ?? "").trim() === "13";
}

function compareNumber(current: number, previous: number) {
  return {
    current,
    previous,
    delta: current - previous
  };
}

function formatDelta(delta: number) {
  if (delta > 0) return `+${delta}`;
  return String(delta);
}

function formatDeltaWords(delta: number) {
  if (delta > 0) return `${delta} mas que el año anterior`;
  if (delta < 0) return `${Math.abs(delta)} menos que el año anterior`;
  return "igual que el año anterior";
}

function daysAgo(days: number) {
  const date = new Date(today);
  date.setDate(date.getDate() - days);
  return isoDate(date);
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
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

function monthDay(value: string) {
  return value.slice(5, 10);
}

function ageOnDate(birthDate: string, date: string) {
  const [birthYear, birthMonth, birthDay] = birthDate.slice(0, 10).split("-").map(Number);
  const [year, month, day] = date.slice(0, 10).split("-").map(Number);
  let age = year - birthYear;
  if (month < birthMonth || (month === birthMonth && day < birthDay)) age -= 1;
  return age;
}

function cleanEnv(value: string | undefined) {
  return value?.replace(/^\uFEFF/, "").trim();
}

async function getNotificationSetting(notificationType: NotificationType) {
  const { data, error } = await createAdminClient()
    .from("telegram_notification_settings")
    .select("notification_type,enabled,paused_reason,pause_starts_on,pause_ends_on")
    .eq("notification_type", notificationType)
    .maybeSingle<NotificationSetting>();

  if (error) {
    console.error("Telegram notification settings not available", error);
    return null;
  }

  return data;
}

function notificationPauseReason(setting: NotificationSetting, currentDate: string) {
  if (!setting.enabled) {
    return `Notificacion pausada manualmente${setting.paused_reason ? `: ${setting.paused_reason}` : "."}`;
  }
  const starts = setting.pause_starts_on;
  const ends = setting.pause_ends_on;
  if (starts && ends && starts <= currentDate && currentDate <= ends) {
    return `Notificacion pausada por calendario (${formatHumanDate(starts)} - ${formatHumanDate(ends)})${setting.paused_reason ? `: ${setting.paused_reason}` : "."}`;
  }
  return null;
}

function normalizeDateOrNull(value: string | null | undefined) {
  const clean = String(value ?? "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(clean) ? clean : null;
}

async function formatDojoMilestones({ start, end }: { start: string; end: string }) {
  const db = createAdminClient();
  const cutoff = end < todayIso() ? end : todayIso();
  const [openings, closures] = await Promise.all([
    db.from("dojo_events").select("event_on,summary").neq("kind", "registration").gte("event_on", start).lte("event_on", cutoff).order("event_on"),
    db.from("dojo_closure_history").select("dojo_name,location,closed_on,reason,members")
      .gte("closed_on", start).lte("closed_on", cutoff).order("closed_on")
  ]);
  if (openings.error || closures.error) throw openings.error ?? closures.error;
  const events = [
    ...clubMilestones.filter(event => event.date >= start && event.date <= cutoff),
    ...openings.data.map(row => ({ date: row.event_on, line: html(row.summary) })),
    ...closures.data.map(row => ({
      date: row.closed_on,
      line: `Cierre de ${html(row.dojo_name)}${row.location ? " en " + html(row.location) : ""} · ${row.members} kenshis · ${html(row.reason)}`
    }))
  ];
  if (!events.length) return "";
  return ["<b>Hitos de SKBC Gipuzkoa</b>", ...events.sort((a,b) => a.date.localeCompare(b.date))
    .map(event => `• ${formatHumanDate(event.date)} · ${event.line}`)].join("\n");
}

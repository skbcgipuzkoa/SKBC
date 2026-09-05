import { createAdminClient } from "@/lib/supabase/admin";

type NotificationType = "daily_ranking" | "monthly_stats" | "semester_stats" | "yearly_stats" | "test";

type Member = {
  id: string;
  legacy_id: string | null;
  display_name: string;
  class: "kids" | "adults";
  grade: string | null;
  status: "active" | "inactive";
  joined_on?: string | null;
  semaphore: string | null;
  next_exam_on: string | null;
  attendance_count: number | null;
  minimum_attendance: number | null;
  missing_attendance: number | null;
  exam_notice: string | null;
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
  member_id: string;
  attended_on: string;
  members: {
    display_name: string;
    legacy_id?: string | null;
    class: "kids" | "adults";
  } | null;
};

type PeriodTechnique = {
  member_id: string;
  class_date: string;
  technique_name: string;
  technique_grade: string | null;
  category: string | null;
  members: {
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
      formatRanking("🏆 Top adultos", digest.adults),
      "",
      formatRanking("🌱 Top niños", digest.kids),
      "",
      formatExamReady(digest.readyForExam),
      "",
      formatExamUpcoming(digest.upcomingForExam)
    ].join("\n").trim();
  }

  const stats = await buildPeriodStats(period);
  const title = notificationType === "monthly_stats"
    ? "Resumen mensual"
    : notificationType === "semester_stats"
      ? "Resumen semestral"
      : "Resumen anual";

  return [
    `🥋 <b>SKBC GIPUZKOA · ${html(title.toUpperCase())}</b>`,
    `<i>${formatHumanDate(period.start)} - ${formatHumanDate(period.end)}</i>`,
    "",
    formatClubNumbers(stats),
    "",
    formatYearGrowth(stats),
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
    formatRanking("🏆 Top asistencia adultos", stats.topAdultAttendance),
    "",
    formatRanking("🌱 Top asistencia niños", stats.topKidsAttendance),
    "",
    formatExamReady(stats.readyForExam)
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
      .select("id,legacy_id,display_name,class,grade,status,joined_on,semaphore,next_exam_on,attendance_count,minimum_attendance,missing_attendance,exam_notice")
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
    readyForExam: readyForExam(members),
    upcomingForExam: upcomingForExam(members)
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
    supabase
      .from("classes")
      .select("id,name,class_date,class_group,closed")
      .gte("class_date", period.start)
      .lte("class_date", period.end)
      .returns<PeriodClass[]>(),
    supabase
      .from("attendance_logs")
      .select("member_id,attended_on,members(display_name,legacy_id,class)")
      .gte("attended_on", period.start)
      .lte("attended_on", period.end)
      .returns<PeriodAttendance[]>(),
    supabase
      .from("member_technical_history")
      .select("member_id,class_date,technique_name,technique_grade,category,members(display_name,legacy_id)")
      .gte("class_date", period.start)
      .lte("class_date", period.end)
      .eq("completed", true)
      .returns<PeriodTechnique[]>(),
    supabase
      .from("exams")
      .select("exam_date,grade,members(display_name,class)")
      .gte("exam_date", period.start)
      .lte("exam_date", period.end)
      .returns<PeriodExam[]>(),
    supabase
      .from("courses")
      .select("member_id,kind,course_date,title,location,sensei")
      .gte("course_date", period.start)
      .lte("course_date", period.end)
      .returns<Course[]>(),
    supabase
      .from("members")
      .select("id,legacy_id,display_name,class,grade,status,joined_on,semaphore,next_exam_on,attendance_count,minimum_attendance,missing_attendance,exam_notice")
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
  const classes = classesResult.data ?? [];
  const techniques = techniquesResult.data ?? [];
  const exams = examsResult.data ?? [];
  const courses = coursesResult.data ?? [];
  const members = membersResult.data ?? [];
  const adultAttendance = attendance.filter((row) => row.members?.class === "adults");
  const kidsAttendance = attendance.filter((row) => row.members?.class === "kids");
  const nationalCourseRows = courses.filter((row) => row.kind === "national");
  const internationalCourseRows = courses.filter((row) => row.kind === "international");
  const taikaiCourseRows = courses.filter((row) => row.kind === "taikai");
  const nationalCourseEvents = uniqueCourseEvents(nationalCourseRows);
  const internationalCourseEvents = uniqueCourseEvents(internationalCourseRows);
  const taikaiCourseEvents = uniqueCourseEvents(taikaiCourseRows);
  const activeAdults = members.filter((member) => member.class === "adults").length;
  const activeKids = members.filter((member) => member.class === "kids").length;
  const registeredAdultClasses = classes.filter((row) => row.class_group === "adults").length;
  const registeredKidsClasses = classes.filter((row) => row.class_group === "kids").length;
  const inferredKidsClasses = distinctDates(kidsAttendance.map((row) => row.attended_on)).length;
  const kidsClasses = Math.max(registeredKidsClasses, inferredKidsClasses);
  const clubClassDays = distinctDates([
    ...classes.map((row) => row.class_date),
    ...kidsAttendance.map((row) => row.attended_on)
  ]).length;
  const yearGrowth = await buildYearGrowthStats(period, {
    classes: clubClassDays,
    attendance: attendance.length,
    adultAttendance: adultAttendance.length,
    kidsAttendance: kidsAttendance.length,
    exams: exams.length,
    nationalCourses: nationalCourseEvents.length,
    internationalCourses: internationalCourseEvents.length,
    taikaiCourses: taikaiCourseEvents.length,
    newMembers: members.filter((member) => member.joined_on && member.joined_on >= period.start && member.joined_on <= period.end).length
  });

  return {
    activeMembers: members.length,
    activeAdults,
    activeKids,
    activeGrades: activeGradeSummary(members),
    classes: clubClassDays,
    registeredClasses: classes.length,
    adultClasses: registeredAdultClasses,
    kidsClasses,
    inferredKidsClasses,
    closedClasses: classes.filter((row) => row.closed).length,
    adultAttendance: adultAttendance.length,
    kidsAttendance: kidsAttendance.length,
    totalAttendance: attendance.length,
    uniqueAttendees: new Set(attendance.map((row) => row.member_id)).size,
    uniqueAdultAttendees: new Set(adultAttendance.map((row) => row.member_id)).size,
    uniqueKidsAttendees: new Set(kidsAttendance.map((row) => row.member_id)).size,
    averageAttendancePerClass: clubClassDays ? Math.round((attendance.length / clubClassDays) * 10) / 10 : 0,
    averageAdultAttendancePerClass: registeredAdultClasses ? Math.round((adultAttendance.length / registeredAdultClasses) * 10) / 10 : 0,
    averageKidsAttendancePerClass: kidsClasses ? Math.round((kidsAttendance.length / kidsClasses) * 10) / 10 : 0,
    techniques: techniques.length,
    uniqueTechniques: new Set(techniques.map((row) => normalizeKey(row.technique_name))).size,
    topTechniques: topCounts(techniques.map((row) => row.technique_name), 5),
    topTechnicalMembers: topCounts(techniques.filter((row) => !isSenseiLegacy(row.members?.legacy_id)).map((row) => row.members?.display_name ?? "Kenshi"), 5),
    passedExams: exams.length,
    examsByGrade: topCounts(exams.map((row) => row.grade), 8),
    nationalCourses: nationalCourseEvents.length,
    internationalCourses: internationalCourseEvents.length,
    taikaiCourses: taikaiCourseEvents.length,
    nationalCourseParticipants: nationalCourseRows.length,
    internationalCourseParticipants: internationalCourseRows.length,
    taikaiCourseParticipants: taikaiCourseRows.length,
    topCourses: [...nationalCourseEvents, ...internationalCourseEvents, ...taikaiCourseEvents]
      .sort((a, b) => b.participants - a.participants || a.date.localeCompare(b.date))
      .slice(0, 6),
    topAdultAttendance: topAttendanceRows(adultAttendance, 10),
    topKidsAttendance: topAttendanceRows(kidsAttendance, 10),
    yearGrowth,
    readyForExam: readyForExam(members)
  };
}

async function sendTelegramMessage(text: string) {
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
  const technical90 = countByMember(technical);
  const nationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "national" && row.member_id).map((row) => ({ member_id: row.member_id as string, points: 1 })));
  const internationalCoursePoints = sumByMember(courses.filter((row) => row.kind === "international" && row.member_id).map((row) => ({ member_id: row.member_id as string, points: 3 })));
  const taikaiCoursePoints = sumByMember(courses.filter((row) => row.kind === "taikai" && row.member_id).map((row) => ({ member_id: row.member_id as string, points: 2 })));
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
      const a180 = attendance180.get(member.id) ?? 0;
      const t90 = technical90.get(member.id) ?? 0;
      const last = lastAttendance.get(member.id);
      const daysWithoutAttendance = last ? trainingDaysBetween(last, todayIso(), closures) : 999;
      const c30 = attendanceRate(a30, possibleClubDays(clubTrainingDates, date30, member.joined_on));
      const c90 = attendanceRate(a90, possibleClubDays(clubTrainingDates, date90, member.joined_on));
      const c180 = attendanceRate(a180, possibleClubDays(clubTrainingDates, date180, member.joined_on));
      const constancyScore = Math.round(c30 * 45 + c90 * 35 + c180 * 25);
      const attendanceVolume = Math.min(a90, 12);
      const score = Math.max(
        0,
        constancyScore +
          attendanceVolume +
          (nationalCoursePoints.get(member.id) ?? 0) +
          (internationalCoursePoints.get(member.id) ?? 0) +
          (taikaiCoursePoints.get(member.id) ?? 0) +
          (manualBonus.get(member.id) ?? 0) +
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

function upcomingForExam(members: Member[]) {
  const today = todayIso();
  const followUpLimit = isoDate(addDays(new Date(), 180));
  return members
    .filter((member) =>
      member.semaphore !== "VERDE" &&
      Boolean(member.next_exam_on) &&
      member.next_exam_on! >= today &&
      member.next_exam_on! <= followUpLimit
    )
    .sort((a, b) => (a.next_exam_on ?? "9999-12-31").localeCompare(b.next_exam_on ?? "9999-12-31") || a.display_name.localeCompare(b.display_name))
    .slice(0, 12)
    .map((member) => ({
      name: member.display_name,
      grade: member.grade ?? "-",
      className: member.class === "kids" ? "ninos" : "adultos",
      nextExamOn: member.next_exam_on,
      semaphore: member.semaphore ?? "-",
      reason: studentFriendlyExamReason(member),
      attendance: member.attendance_count,
      minimum: member.minimum_attendance,
      missingAttendance: member.missing_attendance
    }));
}

function studentFriendlyExamReason(member: Member) {
  const missingAttendance = member.missing_attendance ?? 0;
  const notice = normalizeKey(member.exam_notice);

  if (member.semaphore === "GRIS") {
    return "Necesita recuperar regularidad de entrenamiento antes de valorar convocatoria.";
  }
  if (member.semaphore === "AZUL" || notice.includes("TIEMPO")) {
    return "Todavia falta tiempo minimo de practica para esta convocatoria.";
  }
  if (missingAttendance > 0 || notice.includes("ASISTENCIA")) {
    return `Necesita sumar ${missingAttendance > 0 ? missingAttendance : "mas"} asistencia${missingAttendance === 1 ? "" : "s"} para llegar al minimo.`;
  }
  if (notice.includes("TECNIC")) {
    return "Necesita completar mas trabajo tecnico de su grado.";
  }
  if (notice.includes("IMPLICACION")) {
    return "La implicacion y cursos registrados aun no compensan los requisitos pendientes.";
  }
  return "En seguimiento para proxima convocatoria; revisar asistencia, tiempo minimo y progreso tecnico.";
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

function topAttendanceRows(rows: PeriodAttendance[], limit: number) {
  const byMember = new Map<string, { name: string; count: number }>();
  for (const row of rows) {
    if (isSenseiLegacy(row.members?.legacy_id)) continue;
    const current = byMember.get(row.member_id) ?? { name: row.members?.display_name ?? "Kenshi", count: 0 };
    current.count += 1;
    byMember.set(row.member_id, current);
  }
  return Array.from(byMember.values())
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit)
    .map((row, index) => ({
      name: row.name,
      grade: "Asistencia",
      score: row.count,
      detail: "clases en el periodo",
      position: index + 1
    }));
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

async function buildYearGrowthStats(period: { start: string; end: string }, current: {
  classes: number;
  attendance: number;
  adultAttendance: number;
  kidsAttendance: number;
  exams: number;
  nationalCourses: number;
  internationalCourses: number;
  taikaiCourses: number;
  newMembers: number;
}) {
  const startYear = Number(period.start.slice(0, 4));
  const isFullYear = period.start === `${startYear}-01-01` && period.end === `${startYear}-12-31`;
  if (!isFullYear || !Number.isFinite(startYear)) return null;

  const previous = {
    start: `${startYear - 1}-01-01`,
    end: `${startYear - 1}-12-31`
  };
  const supabase = createAdminClient();
  const [classesResult, attendanceResult, examsResult, coursesResult, membersResult] = await Promise.all([
    supabase.from("classes").select("id", { count: "exact", head: true }).gte("class_date", previous.start).lte("class_date", previous.end),
    supabase.from("attendance_logs").select("member_id,attended_on,members(class)", { count: "exact" }).gte("attended_on", previous.start).lte("attended_on", previous.end).returns<PeriodAttendance[]>(),
    supabase.from("exams").select("exam_date", { count: "exact", head: true }).gte("exam_date", previous.start).lte("exam_date", previous.end),
    supabase.from("courses").select("kind,course_date,title,location,sensei").gte("course_date", previous.start).lte("course_date", previous.end).returns<Course[]>(),
    supabase.from("members").select("id", { count: "exact", head: true }).gte("joined_on", previous.start).lte("joined_on", previous.end)
  ]);

  const previousAttendance = attendanceResult.error ? [] : attendanceResult.data ?? [];
  const previousCourses = coursesResult.error ? [] : coursesResult.data ?? [];
  const previousClassRows = classesResult.count ?? 0;
  const previousKidsClassDates = distinctDates(previousAttendance.filter((row) => row.members?.class === "kids").map((row) => row.attended_on));
  const previousClubClassDays = Math.max(previousClassRows, previousKidsClassDates.length);
  const previousNationalCourses = uniqueCourseEvents(previousCourses.filter((row) => row.kind === "national")).length;
  const previousInternationalCourses = uniqueCourseEvents(previousCourses.filter((row) => row.kind === "international")).length;
  const previousTaikaiCourses = uniqueCourseEvents(previousCourses.filter((row) => row.kind === "taikai")).length;

  return {
    year: startYear,
    previousYear: startYear - 1,
    classes: compareNumber(current.classes, previousClubClassDays),
    attendance: compareNumber(current.attendance, previousAttendance.length),
    adultAttendance: compareNumber(current.adultAttendance, previousAttendance.filter((row) => row.members?.class === "adults").length),
    kidsAttendance: compareNumber(current.kidsAttendance, previousAttendance.filter((row) => row.members?.class === "kids").length),
    exams: compareNumber(current.exams, examsResult.count ?? 0),
    nationalCourses: compareNumber(current.nationalCourses, previousNationalCourses),
    internationalCourses: compareNumber(current.internationalCourses, previousInternationalCourses),
    taikaiCourses: compareNumber(current.taikaiCourses, previousTaikaiCourses),
    newMembers: compareNumber(current.newMembers, membersResult.count ?? 0)
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

function formatExamReady(rows: ReturnType<typeof readyForExam>) {
  if (!rows.length) {
    return "🟢 <b>Kenshis listos para examen</b>\nNinguno ahora mismo.";
  }
  return [
    "🟢 <b>Kenshis listos para examen</b>",
    ...rows.slice(0, 12).map((row) => {
      const attendance = row.attendance !== null && row.minimum !== null ? ` - asist. ${row.attendance}/${row.minimum}` : "";
      return `• <b>${html(row.name)}</b> (${row.className}, ${html(row.grade)})${row.nextExamOn ? ` · ${formatHumanDate(row.nextExamOn)}` : ""}${attendance}`;
    }),
    rows.length > 12 ? `Y ${rows.length - 12} mas.` : ""
  ].filter(Boolean).join("\n");
}

function formatExamUpcoming(rows: ReturnType<typeof upcomingForExam>) {
  if (!rows.length) {
    return "🟡 <b>Proximos a examen</b>\nSin kenshis en ventana de seguimiento.";
  }
  return [
    "🟡 <b>Proximos a examen</b>",
    ...rows.map((row) => {
      const attendance = row.attendance !== null && row.minimum !== null
        ? ` - asist. ${row.attendance}/${row.minimum}${row.missingAttendance ? ` (faltan ${row.missingAttendance})` : ""}`
        : "";
      return `• <b>${html(row.name)}</b> (${row.className}, ${html(row.grade)}) - ${html(row.semaphore)}${row.nextExamOn ? ` - ${formatHumanDate(row.nextExamOn)}` : ""}${attendance}\n   ${html(row.reason)}`;
    })
  ].join("\n");
}

function formatClubNumbers(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  return [
    "📌 <b>Club en numeros</b>",
    `• Kenshis activos: <b>${stats.activeMembers}</b> (${stats.activeAdults} adultos · ${stats.activeKids} niños)`,
    `• Dias de clase del club: <b>${stats.classes}</b>`,
    `• Adultos registrados: <b>${stats.adultClasses}</b> · niños por asistencia: <b>${stats.kidsClasses}</b>`,
    `• Clases cerradas: <b>${stats.closedClasses}/${stats.registeredClasses}</b>`,
    `• Asistentes únicos: <b>${stats.uniqueAttendees}</b> (${stats.uniqueAdultAttendees} adultos · ${stats.uniqueKidsAttendees} niños)`
  ].join("\n");
}

function formatYearGrowth(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  if (!stats.yearGrowth) return "";
  const growth = stats.yearGrowth;
  return [
    `📈 <b>Balance anual ${growth.year}</b>`,
    `<i>Comparado con ${growth.previousYear}; el paréntesis indica diferencia respecto al año anterior.</i>`,
    `• Nuevos kenshis: <b>${growth.newMembers.current}</b> (${formatDeltaWords(growth.newMembers.delta)})`,
    `• Asistencias totales: <b>${growth.attendance.current}</b> (${formatDeltaWords(growth.attendance.delta)})`,
    `• Adultos: <b>${growth.adultAttendance.current}</b> (${formatDeltaWords(growth.adultAttendance.delta)}) · niños: <b>${growth.kidsAttendance.current}</b> (${formatDeltaWords(growth.kidsAttendance.delta)})`,
    `• Dias de clase del club: <b>${growth.classes.current}</b> (${formatDeltaWords(growth.classes.delta)})`,
    `• Examenes: <b>${growth.exams.current}</b> (${formatDeltaWords(growth.exams.delta)})`,
    `• Cursos: nacionales <b>${growth.nationalCourses.current}</b> (${formatDeltaWords(growth.nationalCourses.delta)}) · internacionales <b>${growth.internationalCourses.current}</b> (${formatDeltaWords(growth.internationalCourses.delta)}) · taikai <b>${growth.taikaiCourses.current}</b> (${formatDeltaWords(growth.taikaiCourses.delta)})`
  ].join("\n");
}

function formatActiveGrades(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  if (!stats.activeGrades.length) return "";
  return [
    "🎖️ <b>Grados activos del club</b>",
    ...stats.activeGrades.map((item) => `• ${html(item.grade)}: <b>${item.count}</b> kenshi${item.count === 1 ? "" : "s"}`)
  ].join("\n");
}

function formatAttendanceStats(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  return [
    "👥 <b>Asistencia</b>",
    `• Total asistencias: <b>${stats.totalAttendance}</b>`,
    `• Adultos: <b>${stats.adultAttendance}</b> · media <b>${stats.averageAdultAttendancePerClass}</b>`,
    `• Niños: <b>${stats.kidsAttendance}</b> · media <b>${stats.averageKidsAttendancePerClass}</b>`,
    `• Media global por dia de clase: <b>${stats.averageAttendancePerClass}</b>`
  ].join("\n");
}

function formatTechnicalStats(stats: Awaited<ReturnType<typeof buildPeriodStats>>) {
  return [
    "🥋 <b>Trabajo tecnico adulto</b>",
    `• Registros tecnicos: <b>${stats.techniques}</b>`,
    `• Tecnicas diferentes trabajadas: <b>${stats.uniqueTechniques}</b>`,
    stats.topTechniques.length ? "• Mas trabajadas:\n" + stats.topTechniques.map((item, index) => `  ${index + 1}. ${html(item.label)} · ${item.count}`).join("\n") : "• Mas trabajadas: sin datos",
    stats.topTechnicalMembers.length ? "• Kenshis con mas registros:\n" + stats.topTechnicalMembers.map((item, index) => `  ${index + 1}. ${html(item.label)} · ${item.count}`).join("\n") : ""
  ].filter(Boolean).join("\n");
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

function possibleClubDays(clubDates: string[], since: string, joinedOn: string | null | undefined) {
  const start = joinedOn && joinedOn > since ? joinedOn : since;
  return clubDates.filter((date) => date >= start).length;
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

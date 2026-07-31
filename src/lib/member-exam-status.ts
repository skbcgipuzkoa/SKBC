import { createAdminClient } from "@/lib/supabase/admin";

type MemberRow = {
  id: string;
  class: "kids" | "adults";
  status: "active" | "inactive";
  grade: string | null;
  joined_on: string | null;
  last_exam_on: string | null;
};

type AttendanceRow = {
  attended_on: string;
};

type CourseRow = {
  kind: "national" | "international";
  course_date: string;
};

type TechniqueProgressRow = {
  technique_id: string | null;
  technique_name: string;
};

type TechniqueRow = {
  id: string;
  name: string;
};

type CalendarClosure = {
  starts_on: string;
  ends_on: string;
  title: string;
  applies_to: "all" | "kids" | "adults";
};

type ExamCall = {
  call_date: string;
  title: string;
};

type ExamRequirement = {
  grade_pattern: string;
  min_months: number;
  attendance_ratio: number;
  adult_required_repetitions: number;
  technical_blocks_exam: boolean;
};

type TechnicalStatus = {
  ok: boolean;
  notice: string;
  missingFirst: number;
  missingRequired: number;
  requiredRepetitions: number;
};

type EngagementStatus = {
  points180: number;
  attendanceCredit: number;
  internationalKyuAdvanceMonths: number;
  notice: string;
};

export async function recalculateMemberExamStatus(memberId: string) {
  const supabase = createAdminClient();
  const { data: member, error } = await supabase
    .from("members")
    .select("id,class,status,grade,joined_on,last_exam_on")
    .eq("id", memberId)
    .single<MemberRow>();

  if (error || !member) throw new Error("Kenshi no encontrado para recalcular examen.");

  const status = await calculateExamStatus(member);
  const { error: updateError } = await supabase
    .from("members")
    .update({
      next_exam_on: status.nextExamOn,
      exam_notice: status.notice,
      semaphore: status.semaphore,
      attendance_count: status.cycleAttendance,
      attendance_percentage: status.attendancePercentage,
      minimum_attendance: status.minimumAttendance,
      total_cycle_sessions: status.totalCycleSessions,
      missing_attendance: status.missingAttendance,
      updated_at: new Date().toISOString()
    })
    .eq("id", member.id);

  if (updateError) throw updateError;
}

export async function recalculateClassExamStatus(classId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("member_id")
    .eq("class_id", classId)
    .returns<{ member_id: string }[]>();

  if (error) throw error;

  const memberIds = Array.from(new Set((data ?? []).map((row) => row.member_id).filter(Boolean)));
  for (const memberId of memberIds) {
    await recalculateMemberExamStatus(memberId);
  }
}

async function calculateExamStatus(member: MemberRow) {
  if (member.status !== "active") {
    return emptyStatus("INACTIVO", "Kenshi inactivo.");
  }

  const cycleStart = member.last_exam_on ?? member.joined_on;
  if (!cycleStart) {
    return emptyStatus("", "Falta Fecha Ingreso y/o Fecha Ultimo examen.");
  }

  const today = startOfDay(new Date());
  const cycleStartDate = parseDate(cycleStart);
  if (!cycleStartDate) {
    return emptyStatus("", "Fecha de ciclo no valida.");
  }

  const requirement = await getExamRequirement(member);
  const engagement = await calculateEngagementStatus(member, cycleStart);
  const eligibilityDate = addEligibilityTime(cycleStartDate, member.grade, Math.max(0, requirement.min_months - engagement.internationalKyuAdvanceMonths));
  const [cycleAttendance, totalCycleSessions, recent, examCalls] = await Promise.all([
    countAttendance(member.id, cycleStart, formatDate(today)),
    countExpectedTrainingSessions(cycleStart, formatDate(eligibilityDate), member.class),
    getRecentAttendance(member.id),
    getExamCalls(cycleStartDate.getFullYear(), today.getFullYear() + 3)
  ]);

  if (recent.total180 === 0) {
    return {
      nextExamOn: null,
      semaphore: "INACTIVO",
      notice: recent.lastAttendance
        ? `INACTIVO: sin asistencias desde hace ${daysBetween(parseDate(recent.lastAttendance) ?? today, today)} dias. Reactivacion: minimo 6 asistencias en 60 dias y 1 en 21 dias.`
        : "INACTIVO: sin registros recientes de asistencia. Reactivacion: minimo 6 asistencias en 60 dias y 1 en 21 dias.",
      cycleAttendance,
      totalCycleSessions,
      minimumAttendance: null,
      missingAttendance: null,
      attendancePercentage: null
    };
  }

  const nextExam = nextExamCall(eligibilityDate, examCalls);
  const warningDate = addMonths(nextExam, -2);
  const minimumAttendance = Math.ceil(totalCycleSessions * requirement.attendance_ratio);
  const effectiveCycleAttendance = cycleAttendance + engagement.attendanceCredit;
  const missingAttendance = Math.max(0, minimumAttendance - effectiveCycleAttendance);
  const attendancePercentage = totalCycleSessions > 0 ? Math.min(100, Math.round((cycleAttendance / totalCycleSessions) * 1000) / 10) : 0;
  const effectiveAttendancePercentage = totalCycleSessions > 0 ? Math.min(100, Math.round((effectiveCycleAttendance / totalCycleSessions) * 1000) / 10) : 0;
  const eligibleByTime = today.getTime() >= eligibilityDate.getTime();
  const inWarningWindow = today.getTime() >= warningDate.getTime();
  const examCallExpired = today.getTime() > nextExam.getTime();
  const hasMinimumAttendance = cycleAttendance >= minimumAttendance;
  const linkedOut = recent.total90 === 0;
  const reactivated = recent.total60 >= 6 && recent.total21 >= 1;
  const technicalStatus = member.class === "adults"
    ? await calculateTechnicalStatus(member, requirement.adult_required_repetitions)
    : { ok: true, notice: "", missingFirst: 0, missingRequired: 0, requiredRepetitions: 0 };

  let semaphore = "AMARILLO";
  if (!eligibleByTime) semaphore = "AZUL";
  else if (!inWarningWindow) semaphore = "AMARILLO";
  else if (!hasMinimumAttendance) semaphore = "ROJO";
  else if (requirement.technical_blocks_exam && !technicalStatus.ok) semaphore = "ROJO";
  else if ((linkedOut && (examCallExpired || hasMinimumAttendance)) || (examCallExpired && !reactivated)) semaphore = "GRIS";
  else semaphore = "VERDE";

  const notice = buildNotice({
    semaphore,
    nextExam,
    eligibilityDate,
    warningDate,
    totalCycleSessions,
    minimumAttendance,
    cycleAttendance,
    effectiveCycleAttendance,
    missingAttendance,
    attendancePercentage,
    effectiveAttendancePercentage,
    attendanceRatio: requirement.attendance_ratio,
    recent,
    technicalStatus,
    technicalBlocksExam: requirement.technical_blocks_exam,
    engagement
  });

  return {
    nextExamOn: formatDate(nextExam),
    semaphore,
    notice,
    cycleAttendance,
    totalCycleSessions,
    minimumAttendance,
    missingAttendance,
    attendancePercentage
  };
}

function emptyStatus(semaphore: string, notice: string) {
  return {
    nextExamOn: null,
    semaphore,
    notice,
    cycleAttendance: null,
    totalCycleSessions: null,
    minimumAttendance: null,
    missingAttendance: null,
    attendancePercentage: null
  };
}

async function countAttendance(memberId: string, start: string, end: string) {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("attendance_logs")
    .select("id", { count: "exact", head: true })
    .eq("member_id", memberId)
    .gt("attended_on", start)
    .lte("attended_on", end);

  if (error) throw error;
  return count ?? 0;
}

async function countExpectedTrainingSessions(start: string, end: string, memberClass: "kids" | "adults") {
  const startDate = parseDate(start);
  const endDate = parseDate(end);
  if (!startDate || !endDate || endDate.getTime() <= startDate.getTime()) return 0;

  const closures = await getCalendarClosures(start, end, memberClass);
  let count = 0;
  const cursor = addDays(startDate, 1);
  while (cursor.getTime() <= endDate.getTime()) {
    if (isTrainingWeekday(cursor) && !isDefaultClosed(cursor) && !isExplicitlyClosed(cursor, closures)) {
      count += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

async function getCalendarClosures(start: string, end: string, memberClass: "kids" | "adults") {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("skbc_calendar_closures")
    .select("starts_on,ends_on,title,applies_to")
    .eq("active", true)
    .lte("starts_on", end)
    .gte("ends_on", start)
    .in("applies_to", ["all", memberClass])
    .returns<CalendarClosure[]>();

  if (error) throw error;
  return data ?? [];
}

async function getRecentAttendance(memberId: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("attendance_logs")
    .select("attended_on")
    .eq("member_id", memberId)
    .order("attended_on", { ascending: false })
    .returns<AttendanceRow[]>();

  if (error) throw error;

  const today = startOfDay(new Date());
  const dates = (data ?? []).map((row) => parseDate(row.attended_on)).filter((date): date is Date => Boolean(date));
  return {
    total21: dates.filter((date) => daysBetween(date, today) <= 21).length,
    total60: dates.filter((date) => daysBetween(date, today) <= 60).length,
    total90: dates.filter((date) => daysBetween(date, today) <= 90).length,
    total180: dates.filter((date) => daysBetween(date, today) <= 180).length,
    lastAttendance: data?.[0]?.attended_on ?? null
  };
}

async function calculateEngagementStatus(member: MemberRow, cycleStart: string): Promise<EngagementStatus> {
  if (member.class !== "adults") {
    return { points180: 0, attendanceCredit: 0, internationalKyuAdvanceMonths: 0, notice: "" };
  }

  const supabase = createAdminClient();
  const date180 = formatDate(addDays(startOfDay(new Date()), -180));
  const [{ data: courses }, bonusResult, blackBeltResult, shakujoResult] = await Promise.all([
    supabase
      .from("courses")
      .select("kind,course_date")
      .eq("member_id", member.id)
      .returns<CourseRow[]>(),
    supabase
      .from("adult_ranking_bonuses")
      .select("points,bonus_date,active,permanent")
      .eq("member_id", member.id)
      .returns<Array<{ points: number; bonus_date: string; active: boolean; permanent: boolean }>>(),
    supabase
      .from("black_belt_special_attendance")
      .select("status,black_belt_special_classes(class_date)")
      .eq("member_id", member.id)
      .returns<Array<{ status: "present" | "justified" | "absent"; black_belt_special_classes: { class_date: string } | null }>>(),
    supabase
      .from("shakujo_attendance")
      .select("shakujo_classes(class_date)")
      .eq("member_id", member.id)
      .returns<Array<{ shakujo_classes: { class_date: string } | null }>>()
  ]);

  const recentCourses = (courses ?? []).filter((row) => row.course_date >= date180);
  const coursePoints = recentCourses.reduce((sum, row) => sum + (row.kind === "international" ? 3 : 1), 0);
  const bonusPoints = bonusResult.error ? 0 : (bonusResult.data ?? [])
    .filter((row) => (row.permanent && row.active) || row.bonus_date >= date180)
    .reduce((sum, row) => sum + row.points, 0);
  const busenPoints = blackBeltResult.error ? 0 : (blackBeltResult.data ?? [])
    .filter((row) => row.black_belt_special_classes?.class_date && row.black_belt_special_classes.class_date >= date180)
    .reduce((sum, row) => sum + (row.status === "present" ? 2 : row.status === "absent" ? -4 : 0), 0);
  const shakujoPoints = shakujoResult.error ? 0 : (shakujoResult.data ?? [])
    .filter((row) => row.shakujo_classes?.class_date && row.shakujo_classes.class_date >= date180)
    .length * 2;
  const points180 = Math.max(0, coursePoints + bonusPoints + busenPoints + shakujoPoints);
  const attendanceCredit = Math.min(2, Math.floor(points180 / 6));
  const internationalSinceCycle = (courses ?? []).filter((row) => row.kind === "international" && row.course_date > cycleStart).length;
  const internationalKyuAdvanceMonths = normalizeGrade(member.grade).endsWith(" KYU") ? Math.min(3, internationalSinceCycle * 2) : 0;

  const parts = [];
  if (attendanceCredit > 0) parts.push(`implicacion +${attendanceCredit} asistencia virtual para minimo`);
  if (internationalKyuAdvanceMonths > 0) parts.push(`curso internacional KYU adelanta ${internationalKyuAdvanceMonths} meses`);
  return {
    points180,
    attendanceCredit,
    internationalKyuAdvanceMonths,
    notice: parts.join("; ")
  };
}

async function calculateTechnicalStatus(member: MemberRow, requiredRepetitions: number): Promise<TechnicalStatus> {
  if (!member.grade || requiredRepetitions <= 0) {
    return { ok: true, notice: "", missingFirst: 0, missingRequired: 0, requiredRepetitions };
  }

  const supabase = createAdminClient();
  const [{ data: techniques, error: techniquesError }, { data: progress, error: progressError }] = await Promise.all([
    supabase
      .from("techniques")
      .select("id,name")
      .eq("grade", member.grade)
      .returns<TechniqueRow[]>(),
    supabase
      .from("member_technical_history")
      .select("technique_id,technique_name")
      .eq("member_id", member.id)
      .eq("completed", true)
      .returns<TechniqueProgressRow[]>()
  ]);

  if (techniquesError) throw techniquesError;
  if (progressError) throw progressError;
  if (!techniques?.length) {
    return { ok: true, notice: "Tecnico: sin programa tecnico activo para este grado.", missingFirst: 0, missingRequired: 0, requiredRepetitions };
  }

  const repetitions = new Map<string, number>();
  for (const row of progress ?? []) {
    const key = row.technique_id ?? row.technique_name.trim().toUpperCase();
    repetitions.set(key, (repetitions.get(key) ?? 0) + 1);
  }

  const counts = techniques.map((technique) => repetitions.get(technique.id) ?? repetitions.get(technique.name.trim().toUpperCase()) ?? 0);
  const missingRequired = counts.filter((count) => count < requiredRepetitions).length;
  const missingFirst = counts.filter((count) => count === 0).length;
  const allOnce = counts.every((count) => count >= 1);

  if (missingRequired === 0) {
    return { ok: true, notice: `Tecnico: todas las tecnicas del grado con ${requiredRepetitions}+ reps.`, missingFirst, missingRequired, requiredRepetitions };
  }
  if (allOnce) {
    return { ok: false, notice: `Tecnico: no convocar todavia, ${missingRequired} tecnicas pendientes de ${requiredRepetitions} repeticiones.`, missingFirst, missingRequired, requiredRepetitions };
  }
  return {
    ok: false,
    notice: `Tecnico: no convocar todavia, ${missingFirst} tecnicas aun sin registrar y ${missingRequired} por debajo de ${requiredRepetitions} reps.`,
    missingFirst,
    missingRequired,
    requiredRepetitions
  };
}

function buildNotice({
  semaphore,
  nextExam,
  eligibilityDate,
  warningDate,
  totalCycleSessions,
  minimumAttendance,
  cycleAttendance,
  effectiveCycleAttendance,
  missingAttendance,
  attendancePercentage,
  effectiveAttendancePercentage,
  attendanceRatio,
  recent,
  technicalStatus,
  technicalBlocksExam,
  engagement
}: {
  semaphore: string;
  nextExam: Date;
  eligibilityDate: Date;
  warningDate: Date;
  totalCycleSessions: number;
  minimumAttendance: number;
  cycleAttendance: number;
  effectiveCycleAttendance: number;
  missingAttendance: number;
  attendancePercentage: number;
  effectiveAttendancePercentage: number;
  attendanceRatio: number;
  recent: Awaited<ReturnType<typeof getRecentAttendance>>;
  technicalStatus: TechnicalStatus;
  technicalBlocksExam: boolean;
  engagement: EngagementStatus;
}) {
  const ratioLabel = `${Math.round(attendanceRatio * 100)}%`;
  let notice = "";
  if (semaphore === "AZUL") {
    notice = `AZUL: por tiempo no puede hasta ${formatDate(eligibilityDate)}. Convocatoria objetivo ${formatDate(nextExam)}.`;
  } else if (semaphore === "AMARILLO") {
    notice = `AMARILLO: proxima convocatoria ${formatDate(nextExam)}. Aviso desde ${formatDate(warningDate)}. (${effectiveAttendancePercentage}% - min ${ratioLabel}: ${minimumAttendance}/${totalCycleSessions}, lleva ${cycleAttendance}${engagement.attendanceCredit ? ` + ${engagement.attendanceCredit} implicacion` : ""}).`;
  } else if (semaphore === "ROJO") {
    notice = missingAttendance > 0
      ? `ROJO: no convocar por asistencia. Convocatoria ${formatDate(nextExam)}. Faltan ${missingAttendance} para el minimo ${minimumAttendance}/${totalCycleSessions}.`
      : `ROJO: no convocar por progreso tecnico. Convocatoria ${formatDate(nextExam)}.`;
  } else if (semaphore === "GRIS") {
    notice = `GRIS: revisar reactivacion reciente (${recent.total60}/6 en 60 dias y ${recent.total21}/1 en 21 dias).`;
  } else {
    notice = `VERDE: apto para valoracion. Convocatoria ${formatDate(nextExam)} (${effectiveAttendancePercentage}% - min ${ratioLabel}: ${minimumAttendance}/${totalCycleSessions}, lleva ${cycleAttendance}${engagement.attendanceCredit ? ` + ${engagement.attendanceCredit} implicacion` : ""}).`;
  }

  const technicalNotice = technicalStatus.notice
    ? `${technicalBlocksExam && !technicalStatus.ok ? "BLOQUEO " : ""}${technicalStatus.notice}`
    : "";
  const engagementNotice = engagement.notice ? `Implicacion: ${engagement.notice} (${engagement.points180} pts/180d).` : "";
  return [notice, technicalNotice, engagementNotice].filter(Boolean).join(" | ");
}

async function getExamRequirement(member: MemberRow): Promise<ExamRequirement> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("skbc_exam_requirements")
    .select("grade_pattern,min_months,attendance_ratio,adult_required_repetitions,technical_blocks_exam")
    .eq("member_class", member.class)
    .eq("active", true)
    .returns<ExamRequirement[]>();

  if (error) throw error;
  const rows = data ?? [];
  return (
    rows.find((row) => gradeMatches(member.grade, row.grade_pattern)) ??
    defaultRequirement(member)
  );
}

function defaultRequirement(member: MemberRow): ExamRequirement {
  const danMonths = danYearsExact(member.grade) ? danYearsExact(member.grade)! * 12 : 12;
  return {
    grade_pattern: "*",
    min_months: member.class === "adults" ? danMonths : 12,
    attendance_ratio: 0.4,
    adult_required_repetitions: member.class === "adults" ? 2 : 0,
    technical_blocks_exam: member.class === "adults"
  };
}

function gradeMatches(grade: string | null, pattern: string) {
  const value = normalizeGrade(grade);
  const normalizedPattern = normalizeGrade(pattern);
  if (normalizedPattern === "*" || normalizedPattern === value) return true;
  if (normalizedPattern === "* KYU") return value.endsWith(" KYU");
  if (normalizedPattern === "* DAN") return value.endsWith(" DAN");
  return false;
}

function addEligibilityTime(date: Date, grade: string | null, minMonths?: number) {
  const next = new Date(date);
  const months = minMonths ?? (danYearsExact(grade) ? danYearsExact(grade)! * 12 : 12);
  next.setMonth(next.getMonth() + months);
  return startOfDay(next);
}

function danYearsExact(grade: string | null) {
  const match = String(grade ?? "").trim().toUpperCase().match(/^(\d{1,2})\s*DAN$/);
  return match ? Number(match[1]) : null;
}

async function getExamCalls(fromYear: number, toYear: number) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("skbc_exam_calls")
    .select("call_date,title")
    .eq("active", true)
    .gte("call_date", `${fromYear}-01-01`)
    .lte("call_date", `${toYear}-12-31`)
    .order("call_date")
    .returns<ExamCall[]>();

  if (error) throw error;
  return data ?? [];
}

function nextExamCall(date: Date, calls: ExamCall[]) {
  const nextConfigured = calls
    .map((call) => parseDate(call.call_date))
    .filter((callDate): callDate is Date => Boolean(callDate))
    .find((callDate) => callDate.getTime() >= date.getTime());

  if (nextConfigured) return nextConfigured;

  const year = date.getFullYear();
  const summer = new Date(year, 5, 27);
  const winter = new Date(year, 11, 7);
  if (date.getTime() <= summer.getTime()) return startOfDay(summer);
  if (date.getTime() <= winter.getTime()) return startOfDay(winter);
  return startOfDay(new Date(year + 1, 5, 27));
}

function addMonths(date: Date, months: number) {
  const next = new Date(date);
  const day = next.getDate();
  next.setMonth(next.getMonth() + months);
  if (next.getDate() !== day) next.setDate(0);
  return startOfDay(next);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : startOfDay(date);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return startOfDay(next);
}

function isTrainingWeekday(date: Date) {
  const day = date.getDay();
  return day === 2 || day === 4;
}

function isDefaultClosed(date: Date) {
  const month = date.getMonth();
  const day = date.getDate();
  if (month === 6 || month === 7) return true;
  if (month === 11 && day >= 24) return true;
  if (month === 0 && day <= 6) return true;
  return false;
}

function isExplicitlyClosed(date: Date, closures: CalendarClosure[]) {
  return closures.some((closure) => {
    const starts = parseDate(closure.starts_on);
    const ends = parseDate(closure.ends_on);
    return Boolean(starts && ends && date.getTime() >= starts.getTime() && date.getTime() <= ends.getTime());
  });
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

function normalizeGrade(value: string | null | undefined) {
  return String(value ?? "").trim().toUpperCase().replace(/\s+/g, " ");
}

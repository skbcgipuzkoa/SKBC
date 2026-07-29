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

type TechniqueProgressRow = {
  technique_id: string | null;
  technique_name: string;
};

type TechniqueRow = {
  id: string;
  name: string;
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

  const [cycleAttendance, totalCycleSessions, recent] = await Promise.all([
    countAttendance(member.id, cycleStart, formatDate(today)),
    countSessions(cycleStart, formatDate(addEligibilityTime(cycleStartDate, member.grade))),
    getRecentAttendance(member.id)
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

  const eligibilityDate = addEligibilityTime(cycleStartDate, member.grade);
  const nextExam = nextExamCall(eligibilityDate);
  const warningDate = addMonths(nextExam, -2);
  const minimumAttendance = Math.ceil(totalCycleSessions * 0.4);
  const missingAttendance = Math.max(0, minimumAttendance - cycleAttendance);
  const attendancePercentage = totalCycleSessions > 0 ? Math.min(100, Math.round((cycleAttendance / totalCycleSessions) * 1000) / 10) : 0;
  const eligibleByTime = today.getTime() >= eligibilityDate.getTime();
  const inWarningWindow = today.getTime() >= warningDate.getTime();
  const examCallExpired = today.getTime() > nextExam.getTime();
  const hasMinimumAttendance = cycleAttendance >= minimumAttendance;
  const linkedOut = recent.total90 === 0;
  const reactivated = recent.total60 >= 6 && recent.total21 >= 1;

  let semaphore = "AMARILLO";
  if (!eligibleByTime) semaphore = "AZUL";
  else if (!inWarningWindow) semaphore = "AMARILLO";
  else if (!hasMinimumAttendance) semaphore = "ROJO";
  else if ((linkedOut && (examCallExpired || hasMinimumAttendance)) || (examCallExpired && !reactivated)) semaphore = "GRIS";
  else semaphore = "VERDE";

  const technicalNotice = member.class === "adults" ? await calculateTechnicalNotice(member) : "";
  const notice = buildNotice({
    semaphore,
    nextExam,
    eligibilityDate,
    warningDate,
    totalCycleSessions,
    minimumAttendance,
    cycleAttendance,
    missingAttendance,
    attendancePercentage,
    recent,
    technicalNotice
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

async function countSessions(start: string, end: string) {
  const supabase = createAdminClient();
  const { count, error } = await supabase
    .from("classes")
    .select("id", { count: "exact", head: true })
    .gte("class_date", start)
    .lte("class_date", end)
    .neq("status", "cancelled");

  if (error) throw error;
  return count ?? 0;
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

async function calculateTechnicalNotice(member: MemberRow) {
  if (!member.grade) return "";

  const supabase = createAdminClient();
  const [{ data: techniques, error: techniquesError }, { data: progress, error: progressError }] = await Promise.all([
    supabase
      .from("techniques")
      .select("id,name")
      .eq("grade", member.grade)
      .eq("active", true)
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
  if (!techniques?.length) return "";

  const repetitions = new Map<string, number>();
  for (const row of progress ?? []) {
    const key = row.technique_id ?? row.technique_name.trim().toUpperCase();
    repetitions.set(key, (repetitions.get(key) ?? 0) + 1);
  }

  const counts = techniques.map((technique) => repetitions.get(technique.id) ?? repetitions.get(technique.name.trim().toUpperCase()) ?? 0);
  const pendingSecondRep = counts.filter((count) => count < 2).length;
  const allOnce = counts.every((count) => count >= 1);

  if (pendingSecondRep === 0) return "Tecnico: todas las tecnicas del grado con 2+ reps.";
  if (allOnce) return `Tecnico: ${pendingSecondRep} tecnicas pendientes de segunda repeticion.`;
  return `Tecnico: ${counts.filter((count) => count === 0).length} tecnicas aun sin registrar en este grado.`;
}

function buildNotice({
  semaphore,
  nextExam,
  eligibilityDate,
  warningDate,
  totalCycleSessions,
  minimumAttendance,
  cycleAttendance,
  missingAttendance,
  attendancePercentage,
  recent,
  technicalNotice
}: {
  semaphore: string;
  nextExam: Date;
  eligibilityDate: Date;
  warningDate: Date;
  totalCycleSessions: number;
  minimumAttendance: number;
  cycleAttendance: number;
  missingAttendance: number;
  attendancePercentage: number;
  recent: Awaited<ReturnType<typeof getRecentAttendance>>;
  technicalNotice: string;
}) {
  let notice = "";
  if (semaphore === "AZUL") {
    notice = `AZUL: por tiempo no puede hasta ${formatDate(eligibilityDate)}. Convocatoria objetivo ${formatDate(nextExam)}.`;
  } else if (semaphore === "AMARILLO") {
    notice = `AMARILLO: proxima convocatoria ${formatDate(nextExam)}. Aviso desde ${formatDate(warningDate)}. (${attendancePercentage}% - min ${minimumAttendance}/${totalCycleSessions}, lleva ${cycleAttendance}).`;
  } else if (semaphore === "ROJO") {
    notice = `ROJO: no apto por asistencia. Convocatoria ${formatDate(nextExam)}. Faltan ${missingAttendance} para el minimo ${minimumAttendance}/${totalCycleSessions}.`;
  } else if (semaphore === "GRIS") {
    notice = `GRIS: revisar reactivacion reciente (${recent.total60}/6 en 60 dias y ${recent.total21}/1 en 21 dias).`;
  } else {
    notice = `VERDE: apto para valoracion. Convocatoria ${formatDate(nextExam)} (${attendancePercentage}% - min ${minimumAttendance}/${totalCycleSessions}, lleva ${cycleAttendance}).`;
  }

  return technicalNotice ? `${notice} | ${technicalNotice}` : notice;
}

function addEligibilityTime(date: Date, grade: string | null) {
  const next = new Date(date);
  const danYears = danYearsExact(grade);
  if (danYears) next.setFullYear(next.getFullYear() + danYears);
  else next.setMonth(next.getMonth() + 12);
  return startOfDay(next);
}

function danYearsExact(grade: string | null) {
  const match = String(grade ?? "").trim().toUpperCase().match(/^(\d{1,2})\s*DAN$/);
  return match ? Number(match[1]) : null;
}

function nextExamCall(date: Date) {
  const year = date.getFullYear();
  const summer = new Date(year, 5, 30);
  const winter = new Date(year, 11, 31);
  if (date.getTime() <= summer.getTime()) return startOfDay(summer);
  if (date.getTime() <= winter.getTime()) return startOfDay(winter);
  return startOfDay(new Date(year + 1, 5, 30));
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

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86400000);
}

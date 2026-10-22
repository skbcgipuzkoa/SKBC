export type ExamCandidateInput = {
  status: "active" | "inactive";
  semaphore: string | null;
  memberClass: "kids" | "adults";
  nextExamOn: string | null;
  today: string;
  attendanceCount: number | null;
  minimumAttendance: number | null;
  recentAttendance60: number;
  recentAttendance21: number;
  technicalWorked: number | null;
  technicalTotal: number | null;
  repetitionCount: number | null;
  repetitionGoal: number | null;
};

export type ExamCandidateEvaluation = {
  isCandidate: boolean;
  reasons: string[];
  details: string[];
  daysUntilExam: number | null;
  attendanceProgress: number | null;
  technicalProgress: number | null;
};

const MAX_DAYS_TO_EXAM = 60;
const MINIMUM_PROGRESS_PERCENT = 75;

export function evaluateExamCandidate(input: ExamCandidateInput): ExamCandidateEvaluation {
  const semaphore = normalize(input.semaphore);
  const daysUntilExam = dateDifference(input.today, input.nextExamOn);
  const attendanceProgress = percentage(input.attendanceCount, input.minimumAttendance);
  const technicalProgress = percentage(input.technicalWorked, input.technicalTotal);
  const details = buildDetails(input, attendanceProgress, technicalProgress);

  if (input.status !== "active" || semaphore === "INACTIVO") {
    return result(false, [], details, daysUntilExam, attendanceProgress, technicalProgress);
  }

  if (semaphore === "VERDE" || semaphore === "AMARILLO") {
    return result(
      true,
      [semaphore === "VERDE" ? "Apto para valoracion del profesor" : "Pendiente de valoracion del profesor"],
      details,
      daysUntilExam,
      attendanceProgress,
      technicalProgress
    );
  }

  const timeReady = daysUntilExam !== null && daysUntilExam <= MAX_DAYS_TO_EXAM;
  const attendanceReady = attendanceProgress !== null && attendanceProgress >= MINIMUM_PROGRESS_PERCENT;
  const activityReady = input.recentAttendance60 >= 6 && input.recentAttendance21 >= 1;
  const technicalReady = input.memberClass === "kids"
    || (technicalProgress !== null && technicalProgress >= MINIMUM_PROGRESS_PERCENT);

  const isCandidate = timeReady && attendanceReady && activityReady && technicalReady;
  const reasons = isCandidate
    ? [
        daysUntilExam! <= 0
          ? "Convocatoria prevista alcanzada"
          : `Proxima convocatoria dentro de ${daysUntilExam} dias`,
        `Asistencia al ${attendanceProgress}%`,
        ...(input.memberClass === "adults" ? [`Temario Goho/Juho al ${technicalProgress}%`] : [])
      ]
    : [];

  return result(isCandidate, reasons, details, daysUntilExam, attendanceProgress, technicalProgress);
}

function buildDetails(
  input: ExamCandidateInput,
  attendanceProgress: number | null,
  technicalProgress: number | null
) {
  const details = [
    attendanceProgress === null
      ? "Asistencia sin minimo calculado"
      : `Asistencia: ${input.attendanceCount ?? 0} de ${input.minimumAttendance ?? 0} (${attendanceProgress}%)`,
    `Actividad reciente: ${input.recentAttendance60} de 6 en 60 dias y ${input.recentAttendance21} de 1 en 21 dias`
  ];

  if (input.memberClass === "adults") {
    details.push(
      technicalProgress === null
        ? "Temario Goho/Juho sin datos"
        : `Temario Goho/Juho: ${input.technicalWorked ?? 0} de ${input.technicalTotal ?? 0} (${technicalProgress}%)`
    );
    if (input.repetitionCount !== null && input.repetitionGoal !== null) {
      details.push(`Repeticiones: ${input.repetitionCount} de ${input.repetitionGoal}`);
    }
  }

  return details;
}

function result(
  isCandidate: boolean,
  reasons: string[],
  details: string[],
  daysUntilExam: number | null,
  attendanceProgress: number | null,
  technicalProgress: number | null
): ExamCandidateEvaluation {
  return { isCandidate, reasons, details, daysUntilExam, attendanceProgress, technicalProgress };
}

function percentage(current: number | null, target: number | null) {
  if (current === null || target === null || target <= 0) return null;
  return Math.round((Math.max(0, current) / target) * 100);
}

function dateDifference(from: string, to: string | null) {
  const fromDate = parseDate(from);
  const toDate = parseDate(to);
  if (!fromDate || !toDate) return null;
  return Math.ceil((toDate.getTime() - fromDate.getTime()) / 86400000);
}

function parseDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalize(value: string | null) {
  return String(value ?? "").trim().toUpperCase();
}

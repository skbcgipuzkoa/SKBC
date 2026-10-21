import { parseExamNotice } from "./exam-notice.ts";

export type AdultExamCriterion = {
  id: "time" | "attendance" | "fundamentals" | "activity";
  label: string;
  value: string;
  detail: string;
  progress: number | null;
  secondaryProgress?: {
    label: string;
    value: string;
    progress: number | null;
  };
  tone: "complete" | "tracking" | "blocked" | "waiting" | "neutral";
};

export type AdultExamStatusPanel = {
  semaphore: string;
  title: string;
  nextExamLabel: string;
  summary: string;
  reactivationNotice: {
    title: string;
    detail: string;
  } | null;
  criteria: AdultExamCriterion[];
};

export type AdultExamStatusPanelInput = {
  semaphore: string | null | undefined;
  nextExamOn: string | null | undefined;
  cycleStartOn?: string | null | undefined;
  currentOn?: string | null | undefined;
  examNotice: string | null | undefined;
  attendanceCount: number | null | undefined;
  minimumAttendance: number | null | undefined;
  totalCycleSessions: number | null | undefined;
  fundamentalRepetitions: number[];
  progressRepetitionGoal?: number;
  recentAttendance60: number;
  recentAttendance21: number;
};

const STATUS_COPY: Record<string, Pick<AdultExamStatusPanel, "title" | "summary">> = {
  AZUL: {
    title: "Todavia no corresponde",
    summary: "Sigue entrenando con regularidad mientras completas el tiempo necesario."
  },
  ROJO: {
    title: "Necesita avanzar",
    summary: "Hay requisitos basicos que todavia no estan completos."
  },
  AMARILLO: {
    title: "Casi preparado",
    summary: "Los requisitos principales avanzan bien; queda completar la valoracion."
  },
  VERDE: {
    title: "Preparado para valorar",
    summary: "Los requisitos actuales estan completos para la siguiente valoracion."
  },
  GRIS: {
    title: "Pendiente de recuperar continuidad",
    summary: "La actividad reciente necesita estabilizarse antes de continuar."
  },
  INACTIVO: {
    title: "Necesita retomar la actividad",
    summary: "Vuelve a entrenar con regularidad para recuperar la continuidad antes de valorar un examen."
  }
};

export function buildAdultExamStatusPanel(input: AdultExamStatusPanelInput): AdultExamStatusPanel {
  const semaphore = normalizeSemaphore(input.semaphore);
  const hasExamStatus = Object.hasOwn(STATUS_COPY, semaphore);
  const copy = STATUS_COPY[semaphore] ?? {
    title: "Estado pendiente",
    summary: "Aun no hay informacion suficiente para valorar el siguiente examen."
  };
  const parsedNotice = parseExamNotice(input.examNotice);
  const requiredRepetitions = examRepetitionMinimum(input.examNotice);
  const progressRepetitionGoal = Math.max(1, nonNegative(input.progressRepetitionGoal) || requiredRepetitions);
  const repetitions = input.fundamentalRepetitions.map(nonNegative);
  const workedFundamentals = repetitions.filter((count) => count > 0).length;
  const preparedFundamentals = repetitions.filter((count) => count >= requiredRepetitions).length;
  const programPreparedFundamentals = repetitions.filter((count) => count >= progressRepetitionGoal).length;
  const fundamentalTotal = repetitions.length;
  const repetitionTarget = fundamentalTotal * progressRepetitionGoal;
  const completedRepetitions = repetitions.reduce(
    (total, count) => total + Math.min(count, progressRepetitionGoal),
    0
  );
  const attendanceCount = nonNegative(input.attendanceCount);
  const minimumAttendance = nonNegative(input.minimumAttendance);
  const attendanceReady = minimumAttendance > 0 && attendanceCount >= minimumAttendance;
  const missingAttendance = Math.max(0, minimumAttendance - attendanceCount);
  const fundamentalsReady = fundamentalTotal > 0
    ? preparedFundamentals === fundamentalTotal
    : parsedNotice.fundamentalComplete;
  const programRepetitionsReady = fundamentalTotal > 0
    && programPreparedFundamentals === fundamentalTotal;
  const activityReady = input.recentAttendance60 >= 6 && input.recentAttendance21 >= 1;
  const inactive = semaphore === "INACTIVO";
  const needsReactivation = inactive || semaphore === "GRIS" || input.recentAttendance60 === 0;
  const timePending = semaphore === "AZUL";
  const timeKnown = hasExamStatus && !inactive;
  const timeProgress = buildTimeProgress({
    cycleStartOn: input.cycleStartOn,
    eligibilityOn: eligibilityDateFromNotice(input.examNotice),
    currentOn: input.currentOn,
    timeKnown,
    timePending
  });
  const activityProgress = Math.min(
    percentage(input.recentAttendance60, 6),
    percentage(input.recentAttendance21, 1)
  );

  return {
    semaphore,
    title: copy.title,
    nextExamLabel: input.nextExamOn
      ? `Proxima convocatoria prevista: ${formatDate(input.nextExamOn)}`
      : "Convocatoria pendiente de definir",
    summary: copy.summary,
    reactivationNotice: needsReactivation
      ? buildReactivationNotice(input.recentAttendance60, input.recentAttendance21)
      : null,
    criteria: [
      {
        id: "time",
        label: "Tiempo",
        value: timeProgress.value,
        detail: timeProgress.detail,
        progress: timeProgress.progress,
        tone: !timeKnown ? "neutral" : timePending ? "waiting" : "complete"
      },
      {
        id: "attendance",
        label: "Asistencia",
        value: minimumAttendance > 0
          ? `${attendanceCount} de ${minimumAttendance} asistencias`
          : `${attendanceCount} registradas`,
        detail: attendanceDetail({
          attendanceCount,
          minimumAttendance,
          missingAttendance,
          totalCycleSessions: nonNegative(input.totalCycleSessions)
        }),
        progress: minimumAttendance > 0 ? percentage(attendanceCount, minimumAttendance) : null,
        tone: minimumAttendance === 0 ? "neutral" : attendanceReady ? "complete" : "blocked"
      },
      {
        id: "fundamentals",
        label: "Goho y Juho",
        value: `${workedFundamentals} de ${fundamentalTotal} trabajadas`,
        detail: fundamentalDetail(parsedNotice, fundamentalTotal, requiredRepetitions, fundamentalsReady),
        progress: fundamentalTotal > 0 ? percentage(workedFundamentals, fundamentalTotal) : null,
        secondaryProgress: {
          label: "Progreso de repeticiones",
          value: repetitionTarget > 0
            ? `${completedRepetitions} de ${repetitionTarget}`
            : "Sin datos",
          progress: repetitionTarget > 0 ? percentage(completedRepetitions, repetitionTarget) : null
        },
        tone: fundamentalTotal === 0
          ? "neutral"
          : programRepetitionsReady
            ? "complete"
            : workedFundamentals === fundamentalTotal
              ? "waiting"
              : "blocked"
      },
      {
        id: "activity",
        label: "Actividad reciente",
        value: `${nonNegative(input.recentAttendance60)} de 6 en 60 dias`,
        detail: `${nonNegative(input.recentAttendance21)} de 1 en los ultimos 21 dias.`,
        progress: activityProgress,
        tone: activityReady ? "complete" : "blocked"
      }
    ]
  };
}

function buildReactivationNotice(recentAttendance60: number, recentAttendance21: number) {
  const total60 = nonNegative(recentAttendance60);
  const total21 = nonNegative(recentAttendance21);
  const missing60 = Math.max(0, 6 - total60);
  const missing21 = Math.max(0, 1 - total21);
  const pending = [
    missing60 > 0 ? `${missing60} ${missing60 === 1 ? "asistencia" : "asistencias"} dentro de 60 dias` : "",
    missing21 > 0 ? "1 asistencia dentro de los ultimos 21 dias" : ""
  ].filter(Boolean).join(" y ");

  return {
    title: "Reactivacion necesaria",
    detail: pending
      ? `Para reactivar necesita ${pending}. Ahora lleva ${total60} de 6 en 60 dias y ${total21} de 1 en 21 dias.`
      : "Ya cumple la actividad reciente necesaria para reactivar el seguimiento."
  };
}

function attendanceDetail({
  attendanceCount,
  minimumAttendance,
  missingAttendance,
  totalCycleSessions
}: {
  attendanceCount: number;
  minimumAttendance: number;
  missingAttendance: number;
  totalCycleSessions: number;
}) {
  const cycleText = totalCycleSessions > 0
    ? `Ha asistido a ${attendanceCount} de las ${totalCycleSessions} sesiones previstas en el ciclo.`
    : `Ha asistido a ${attendanceCount} sesiones en el ciclo actual.`;
  if (minimumAttendance <= 0) return cycleText;
  return missingAttendance > 0
    ? `${cycleText} Le faltan ${missingAttendance} asistencias para alcanzar el minimo.`
    : `${cycleText} Ya ha alcanzado el minimo de asistencia.`;
}

function buildTimeProgress({
  cycleStartOn,
  eligibilityOn,
  currentOn,
  timeKnown,
  timePending
}: {
  cycleStartOn: string | null | undefined;
  eligibilityOn: string | null;
  currentOn: string | null | undefined;
  timeKnown: boolean;
  timePending: boolean;
}) {
  if (!timeKnown) {
    return { value: "Sin datos", detail: "Estado temporal pendiente de calcular.", progress: null };
  }

  const cycleStart = parseIsoDate(cycleStartOn);
  const eligibility = parseIsoDate(eligibilityOn);
  const current = parseIsoDate(currentOn) ?? startOfToday();

  if (timePending && cycleStart && eligibility) {
    const totalDays = Math.max(1, daysBetween(cycleStart, eligibility));
    const elapsedDays = Math.min(totalDays, Math.max(0, daysBetween(cycleStart, current)));
    const remainingDays = Math.max(0, daysBetween(current, eligibility));
    return {
      value: `${elapsedDays} de ${totalDays} dias`,
      detail: `Desde ${formatDate(cycleStartOn!)}. Cumple el ${formatDate(eligibilityOn!)}; faltan ${remainingDays} dias.`,
      progress: percentage(elapsedDays, totalDays)
    };
  }

  return {
    value: timePending ? "En curso" : "Cumplido",
    detail: timePending
      ? "Aun se esta completando el tiempo minimo."
      : cycleStartOn
        ? `Ciclo iniciado el ${formatDate(cycleStartOn)}. Tiempo minimo alcanzado.`
        : "Tiempo minimo alcanzado.",
    progress: timePending ? null : 100
  };
}

function eligibilityDateFromNotice(notice: string | null | undefined) {
  const value = String(notice ?? "");
  const iso = value.match(/no puede hasta\s+(\d{4}-\d{2}-\d{2})/i)?.[1];
  if (iso) return iso;
  const local = value.match(/no puede hasta\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
  return local
    ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
    : null;
}

function parseIsoDate(value: string | null | undefined) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfToday() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function daysBetween(start: Date, end: Date) {
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000);
}

function examRepetitionMinimum(notice: string | null | undefined) {
  const match = String(notice ?? "").match(/(\d+)\s*\+?\s*(?:reps?|repeticiones)\b/i);
  return match ? Math.max(1, Number(match[1])) : 2;
}

function fundamentalDetail(
  notice: ReturnType<typeof parseExamNotice>,
  total: number,
  required: number,
  ready: boolean
) {
  if (total === 0) return "Sin tecnicas fundamentales para mostrar.";
  if (ready) return `Minimo de examen: ${required} repeticiones por tecnica.`;
  const pending = notice.fundamentalMissingRequired || notice.fundamentalMissingFirst;
  return pending > 0
    ? `${pending} pendientes segun el progreso del examen; minimo ${required} repeticiones.`
    : `Minimo de examen: ${required} repeticiones por tecnica.`;
}

function normalizeSemaphore(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toUpperCase();
  return STATUS_COPY[normalized] ? normalized : "SIN_DATO";
}

function nonNegative(value: number | null | undefined) {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
}

function percentage(value: number, target: number) {
  if (target <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((nonNegative(value) / target) * 100)));
}

function formatDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

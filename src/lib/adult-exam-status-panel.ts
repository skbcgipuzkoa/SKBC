import { parseExamNotice } from "./exam-notice.ts";

export type AdultExamCriterion = {
  id: "time" | "attendance" | "fundamentals" | "activity";
  label: string;
  value: string;
  detail: string;
  progress: number | null;
  tone: "complete" | "tracking" | "blocked" | "waiting" | "neutral";
};

export type AdultExamStatusPanel = {
  semaphore: string;
  title: string;
  nextExamLabel: string;
  summary: string;
  criteria: AdultExamCriterion[];
};

export type AdultExamStatusPanelInput = {
  semaphore: string | null | undefined;
  nextExamOn: string | null | undefined;
  examNotice: string | null | undefined;
  attendanceCount: number | null | undefined;
  minimumAttendance: number | null | undefined;
  totalCycleSessions: number | null | undefined;
  fundamentalRepetitions: number[];
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
  const repetitions = input.fundamentalRepetitions.map(nonNegative);
  const preparedFundamentals = repetitions.filter((count) => count >= requiredRepetitions).length;
  const fundamentalTotal = repetitions.length;
  const attendanceCount = nonNegative(input.attendanceCount);
  const minimumAttendance = nonNegative(input.minimumAttendance);
  const attendanceReady = minimumAttendance > 0 && attendanceCount >= minimumAttendance;
  const fundamentalsReady = fundamentalTotal > 0
    ? preparedFundamentals === fundamentalTotal
    : parsedNotice.fundamentalComplete;
  const activityReady = input.recentAttendance60 >= 6 && input.recentAttendance21 >= 1;
  const inactive = semaphore === "INACTIVO";
  const timePending = semaphore === "AZUL";
  const timeKnown = hasExamStatus && !inactive;
  const activityProgress = Math.min(
    percentage(input.recentAttendance60, 6),
    percentage(input.recentAttendance21, 1)
  );

  return {
    semaphore,
    title: copy.title,
    nextExamLabel: input.nextExamOn
      ? `Proxima referencia: ${formatDate(input.nextExamOn)}`
      : "Proxima referencia pendiente",
    summary: copy.summary,
    criteria: [
      {
        id: "time",
        label: "Tiempo",
        value: !timeKnown ? "Sin datos" : timePending ? "En curso" : "Cumplido",
        detail: !timeKnown
          ? "Estado temporal pendiente de calcular."
          : timePending
            ? "Aun se esta completando el tiempo minimo."
            : "Tiempo minimo alcanzado.",
        progress: !timeKnown || timePending ? null : 100,
        tone: !timeKnown ? "neutral" : timePending ? "waiting" : "complete"
      },
      {
        id: "attendance",
        label: "Asistencia",
        value: minimumAttendance > 0
          ? `${attendanceCount} de ${minimumAttendance} necesarias`
          : `${attendanceCount} registradas`,
        detail: input.totalCycleSessions
          ? `${nonNegative(input.totalCycleSessions)} sesiones en el ciclo actual.`
          : "Seguimiento del ciclo actual.",
        progress: minimumAttendance > 0 ? percentage(attendanceCount, minimumAttendance) : null,
        tone: minimumAttendance === 0 ? "neutral" : attendanceReady ? "complete" : "blocked"
      },
      {
        id: "fundamentals",
        label: "Goho y Juho",
        value: `${preparedFundamentals} de ${fundamentalTotal} preparadas`,
        detail: fundamentalDetail(parsedNotice, fundamentalTotal, requiredRepetitions, fundamentalsReady),
        progress: fundamentalTotal > 0 ? percentage(preparedFundamentals, fundamentalTotal) : null,
        tone: fundamentalTotal === 0 ? "neutral" : fundamentalsReady ? "complete" : "blocked"
      },
      {
        id: "activity",
        label: "Actividad reciente",
        value: `${nonNegative(input.recentAttendance60)} de 6 en 60 dias`,
        detail: `${nonNegative(input.recentAttendance21)} de 1 en los ultimos 21 dias.`,
        progress: activityProgress,
        tone: activityReady ? "complete" : inactive || semaphore === "GRIS" ? "blocked" : "tracking"
      }
    ]
  };
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

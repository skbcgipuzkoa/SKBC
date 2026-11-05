import { formatExamCallMonth, isIsoDate, madridCallToday } from "./exam-call.ts";

/** Presentation dates only: this never changes eligibility or academic criteria. */
export function resolveStudentExamCall(input: { storedNextExamOn?: string | null; configuredDates?: string[]; approvedExamOn?: string | null; today?: string; now?: Date }) {
  const today = input.today ?? madridCallToday(input.now);
  const future = (date: string | null | undefined): date is string => isIsoDate(date) && date >= today;
  const upcomingMonth = (date: string | null | undefined): date is string => isIsoDate(date) && date.slice(0, 7) >= today.slice(0, 7);
  if (future(input.approvedExamOn)) return { date: input.approvedExamOn, approved: true };
  if (upcomingMonth(input.storedNextExamOn)) return { date: input.storedNextExamOn, approved: false };
  return { date: (input.configuredDates ?? []).filter(upcomingMonth).sort()[0] ?? null, approved: false };
}

export function studentExamCallLabel(date: string | null, approved = false, options: { dateConfirmed?: boolean; callMonth?: string | null } = {}) {
  if (!date) return "Convocatoria pendiente de definir";
  const month = formatExamCallMonth(options.callMonth ?? date);
  if (approved && options.dateConfirmed === false) return `Convocado para ${month} · día pendiente de confirmar`;
  if (!approved) return `Próxima convocatoria prevista si se cumplen todos los requisitos: ${month}`;
  const formatted = `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return `Convocatoria autorizada por el profesor: ${formatted}`;
}

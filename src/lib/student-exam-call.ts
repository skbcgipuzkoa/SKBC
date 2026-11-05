import { isIsoDate, madridCallToday } from "./exam-call.ts";

/** Presentation dates only: this never changes eligibility or academic criteria. */
export function resolveStudentExamCall(input: { storedNextExamOn?: string | null; configuredDates?: string[]; approvedExamOn?: string | null; today?: string; now?: Date }) {
  const today = input.today ?? madridCallToday(input.now);
  const future = (date: string | null | undefined): date is string => isIsoDate(date) && date >= today;
  if (future(input.approvedExamOn)) return { date: input.approvedExamOn, approved: true };
  if (future(input.storedNextExamOn)) return { date: input.storedNextExamOn, approved: false };
  return { date: (input.configuredDates ?? []).filter(future).sort()[0] ?? null, approved: false };
}

export function studentExamCallLabel(date: string | null, approved = false) {
  if (!date) return "Convocatoria pendiente de definir";
  const formatted = `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
  return approved ? `Convocatoria autorizada por el profesor: ${formatted}` : `Próxima convocatoria prevista si se cumplen todos los requisitos: ${formatted}`;
}

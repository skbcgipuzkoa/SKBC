export type ContinuityClosure = { starts_on: string; ends_on: string; applies_to?: string };
export type ExamContinuity = {
  count60: number; count21: number; missing60: number; missing21: number;
  from60: string; from21: string; today: string; lastAttendance: string | null;
  complies: boolean; exceptionAuthorized: boolean; allowed: boolean;
};
export type ExamContinuityException = {
  callMonth: string; currentGrade: string | null; approvalAt: string; authorizedAt: string; authorizedBy: string; reason: string;
};
function date(value: string) { return new Date(value + "T12:00:00Z"); }
function iso(value: Date) { return value.toISOString().slice(0, 10); }
function closed(day: string, closures: ContinuityClosure[], memberClass: string) {
  const month = Number(day.slice(5, 7)), number = Number(day.slice(8, 10));
  if (month === 7 || month === 8 || (month === 12 && number >= 24) || (month === 1 && number <= 6)) return true;
  return closures.some(row => (!row.applies_to || row.applies_to === "all" || row.applies_to === memberClass) && row.starts_on <= day && day <= row.ends_on);
}
export function examContinuityWindows(today: string, closures: ContinuityClosure[], memberClass: string) {
  const cursor = date(today);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today) || !Number.isFinite(cursor.getTime())) throw new Error("Fecha de continuidad inválida.");
  let activeDays = 0, elapsed = 0, from21 = "";
  while (activeDays < 60 && elapsed++ < 3660) {
    cursor.setUTCDate(cursor.getUTCDate() - 1);
    if (!closed(iso(cursor), closures, memberClass)) activeDays++;
    if (activeDays === 21 && !from21) from21 = iso(cursor);
  }
  if (activeDays < 60) throw new Error("No hay calendario abierto suficiente para valorar la continuidad.");
  return { from60: iso(cursor), from21 };
}
export function evaluateExamContinuity(input: {
  today: string; memberClass: string; closures: ContinuityClosure[];
  attendance: Array<{ id?: string; class_id?: string | null; attended_on: string }>;
  exceptionAuthorized?: boolean;
}): ExamContinuity {
  const windows = examContinuityWindows(input.today, input.closures, input.memberClass);
  const seen = new Set<string>();
  const dates: string[] = [];
  for (const [index, row] of input.attendance.entries()) {
    const key = row.class_id || row.id || String(index);
    if (seen.has(key) || row.attended_on > input.today || row.attended_on < windows.from60) continue;
    seen.add(key); dates.push(row.attended_on);
  }
  const count60 = dates.length, count21 = dates.filter(day => day >= windows.from21).length;
  const complies = count60 >= 6 && count21 >= 1;
  return { ...windows, today: input.today, count60, count21, missing60: Math.max(0, 6 - count60), missing21: Math.max(0, 1 - count21),
    lastAttendance: dates.sort().at(-1) ?? null, complies, exceptionAuthorized: Boolean(input.exceptionAuthorized), allowed: complies || Boolean(input.exceptionAuthorized) };
}
export function validContinuityException(value: ExamContinuityException | undefined, callMonth: string, currentGrade: string | null, approvalAt: string | null) {
  return Boolean(value && approvalAt && value.approvalAt === approvalAt && value.callMonth === callMonth && value.currentGrade === currentGrade && value.authorizedBy?.trim() && value.reason?.trim() && Number.isFinite(Date.parse(value.authorizedAt)));
}

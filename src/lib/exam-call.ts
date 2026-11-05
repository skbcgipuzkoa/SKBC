/** Strict calendar date validation, without JavaScript's rollover of invalid dates. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

export function madridCallToday(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)!.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function validCallMonth(value: string | null | undefined): string | null {
  if (!value) return null;
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(value) && Number(value.slice(0, 4)) > 0) return value;
  return isIsoDate(value) ? value.slice(0, 7) : null;
}

export function formatExamCallMonth(value: string | null | undefined): string {
  const month = validCallMonth(value);
  if (!month) return "Sin mes definido";
  const names = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  return `${names[Number(month.slice(5, 7)) - 1]} de ${month.slice(0, 4)}`;
}

/** Planning boundary only. This is never a confirmed exam day. */
export function examCallMonthEnd(value: string | null | undefined): string | null {
  const month = validCallMonth(value);
  if (!month) return null;
  const year = Number(month.slice(0, 4)), number = Number(month.slice(5, 7));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][number - 1];
  return `${month}-${days}`;
}

/** Club rule: January/February belong to the previous December unless marked as a retake. */
export function attributeExamCall(actualDate: string, options: { isRetake?: boolean } = {}) {
  if (!isIsoDate(actualDate)) return null;
  const year = Number(actualDate.slice(0, 4));
  const month = Number(actualDate.slice(5, 7));
  if (options.isRetake !== true && month <= 2 && year === 1) return null;
  const callMonth = options.isRetake !== true && month <= 2
    ? `${String(year - 1).padStart(4, "0")}-12`
    : actualDate.slice(0, 7);
  return { actualDate, callMonth, isRetake: options.isRetake };
}

export function resolveCallFilter(requested: string | undefined, configuredDates: string[]) {
  const dates = [...new Set(configuredDates.filter(isIsoDate))].sort();
  if (requested === "all") return { value: "all", callDate: null, all: true };
  if (requested && dates.includes(requested)) return { value: requested, callDate: requested, all: false };
  return { value: "next", callDate: dates[0] ?? null, all: false };
}

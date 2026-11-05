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

/** Unknown historical provenance is preserved; only an explicit normal exam is reattributed. */
export function attributeExamCall(actualDate: string, options: { isRetake?: boolean } = {}) {
  if (!isIsoDate(actualDate)) return null;
  const year = Number(actualDate.slice(0, 4));
  const month = Number(actualDate.slice(5, 7));
  if (options.isRetake === false && month <= 2 && year === 1) return null;
  const callMonth = options.isRetake === false && month <= 2
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

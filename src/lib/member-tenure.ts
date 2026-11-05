function calendarDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1) return null;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/** Completed calendar months, clamping anniversaries to the last day of shorter months. */
export function memberTenure(joinedOn: string | null, now = new Date()): string {
  const joined = calendarDate(joinedOn);
  if (!joined || !Number.isFinite(now.getTime())) return "-";
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(now);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? "";
  const today = calendarDate(`${get("year")}-${get("month")}-${get("day")}`);
  if (!today || joined > today) return "-";

  let months = (today.getUTCFullYear() - joined.getUTCFullYear()) * 12 + today.getUTCMonth() - joined.getUTCMonth();
  const anniversary = new Date(today);
  anniversary.setUTCDate(1);
  anniversary.setUTCMonth(anniversary.getUTCMonth() + 1);
  anniversary.setUTCDate(0);
  const anniversaryDay = Math.min(joined.getUTCDate(), anniversary.getUTCDate());
  if (today.getUTCDate() < anniversaryDay) months--;

  if (months === 0) {
    const days = Math.round((today.getTime() - joined.getTime()) / 86_400_000);
    return `${days} ${days === 1 ? "día" : "días"}`;
  }
  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;
  const monthText = `${remainingMonths} ${remainingMonths === 1 ? "mes" : "meses"}`;
  if (!years) return monthText;
  const yearText = `${years} ${years === 1 ? "año" : "años"}`;
  return remainingMonths ? `${yearText} y ${monthText}` : yearText;
}

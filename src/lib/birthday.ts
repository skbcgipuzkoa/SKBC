/** Compare strict calendar dates with the club's local day, never the host timezone. */
export function isBirthdayToday(birthDate: string | null | undefined, now = new Date()): boolean {
  if (!birthDate || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate) || !Number.isFinite(now.getTime())) return false;
  const [year, month, day] = birthDate.split("-").map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > days[month - 1]) return false;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const today = `${part("year").padStart(4, "0")}-${part("month")}-${part("day")}`;
  return birthDate <= today && birthDate.slice(5) === today.slice(5);
}

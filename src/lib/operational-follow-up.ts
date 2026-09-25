export type MemberGroup = "kids" | "adults";

export function absenceThresholdDays(group: MemberGroup) {
  return group === "kids" ? 21 : 30;
}

export function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function isRelevantAbsence(input: { group: MemberGroup; joinedOn?: string | null; lastAttendanceOn?: string | null; today: string }) {
  const threshold = absenceThresholdDays(input.group);
  if (input.joinedOn && daysBetween(input.joinedOn, input.today) < threshold) return false;
  const reference = input.lastAttendanceOn ?? input.joinedOn;
  return Boolean(reference) && daysBetween(reference!, input.today) >= threshold;
}

export function previousWeekPeriod(now = new Date()) {
  const local = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Madrid" }));
  const weekday = local.getDay() || 7;
  const thisMonday = new Date(local.getFullYear(), local.getMonth(), local.getDate() - weekday + 1);
  const start = new Date(thisMonday);
  start.setDate(start.getDate() - 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: isoDate(start), end: isoDate(end) };
}

export function operationalAlertKey(type: string, id: string, occurrence?: string | null) {
  return [type, id, occurrence].filter(Boolean).join(":");
}

function isoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

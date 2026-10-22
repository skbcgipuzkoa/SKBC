export type ActivityClosure = {
  starts_on: string;
  ends_on: string;
};

export function activeCalendarDaysBetween(from: string, to: string, closures: ActivityClosure[]) {
  const start = parseIsoDate(from);
  const end = parseIsoDate(to);
  if (!start || !end || start >= end) return 0;

  let count = 0;
  const cursor = new Date(start);
  cursor.setDate(cursor.getDate() + 1);
  while (cursor <= end) {
    if (!isSummerBreak(cursor) && !isExplicitlyClosed(cursor, closures)) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

function parseIsoDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function isSummerBreak(date: Date) {
  const month = date.getMonth() + 1;
  return month === 7 || month === 8;
}

function isExplicitlyClosed(date: Date, closures: ActivityClosure[]) {
  return closures.some((closure) => {
    const starts = parseIsoDate(closure.starts_on);
    const ends = parseIsoDate(closure.ends_on);
    return Boolean(starts && ends && starts <= date && date <= ends);
  });
}

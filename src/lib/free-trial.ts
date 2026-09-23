function parseIsoDate(value: string | null | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function lastDayOfMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addCalendarMonths(value: string, months: number) {
  const start = parseIsoDate(value);
  if (!start) return null;
  const targetMonthIndex = start.getUTCMonth() + months;
  const targetYear = start.getUTCFullYear() + Math.floor(targetMonthIndex / 12);
  const normalizedMonth = ((targetMonthIndex % 12) + 12) % 12;
  const day = Math.min(start.getUTCDate(), lastDayOfMonth(targetYear, normalizedMonth));
  return new Date(Date.UTC(targetYear, normalizedMonth, day));
}

export function firstBillingDateAfterFreeMonth(startedOn: string | null | undefined) {
  if (!startedOn) return null;
  const minimumFreeEnd = addCalendarMonths(startedOn, 1);
  if (!minimumFreeEnd) return null;

  const billingThisMonth = new Date(Date.UTC(minimumFreeEnd.getUTCFullYear(), minimumFreeEnd.getUTCMonth(), 15));
  if (billingThisMonth >= minimumFreeEnd) return isoDate(billingThisMonth);

  return isoDate(new Date(Date.UTC(minimumFreeEnd.getUTCFullYear(), minimumFreeEnd.getUTCMonth() + 1, 15)));
}

export function resolveFreeTrialBillingDate(startedOn: string | null | undefined, storedBillingOn?: string | null) {
  const calculated = firstBillingDateAfterFreeMonth(startedOn);
  if (!calculated) return storedBillingOn ?? null;
  if (!storedBillingOn) return calculated;
  return storedBillingOn > calculated ? storedBillingOn : calculated;
}

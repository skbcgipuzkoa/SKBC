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

function firstFifteenthAfterStart(start: Date) {
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 15));
}

function fifteenthOnOrAfter(date: Date) {
  const thisMonth = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 15));
  if (thisMonth >= date) return thisMonth;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 15));
}

function countTrainingDays(start: Date, endExclusive: Date) {
  let total = 0;
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (cursor < endExclusive) {
    const day = cursor.getUTCDay();
    if (day === 2 || day === 4) total += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return total;
}

export function firstBillingDateAfterFreeMonth(startedOn: string | null | undefined) {
  if (!startedOn) return null;
  const start = parseIsoDate(startedOn);
  if (!start) return null;
  const minimumFreeEnd = addCalendarMonths(startedOn, 1);
  if (!minimumFreeEnd) return null;

  const candidateBilling = firstFifteenthAfterStart(start);
  const strictBilling = fifteenthOnOrAfter(minimumFreeEnd);
  if (candidateBilling >= minimumFreeEnd) return isoDate(candidateBilling);

  const fullFreeMonthTrainingDays = countTrainingDays(start, minimumFreeEnd);
  const candidateTrainingDays = countTrainingDays(start, candidateBilling);
  const minimumFairTrainingDays = Math.max(fullFreeMonthTrainingDays - 1, 0);

  if (candidateTrainingDays >= minimumFairTrainingDays) return isoDate(candidateBilling);

  return isoDate(strictBilling);
}

export function resolveFreeTrialBillingDate(startedOn: string | null | undefined, storedBillingOn?: string | null) {
  const calculated = firstBillingDateAfterFreeMonth(startedOn);
  if (!calculated) return storedBillingOn ?? null;
  if (!storedBillingOn) return calculated;
  return storedBillingOn > calculated ? storedBillingOn : calculated;
}

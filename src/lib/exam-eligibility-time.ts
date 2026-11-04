type ExamCycleDates = { joined_on: string | null; last_exam_on: string | null };

/** A recorded last exam takes precedence, including imported exam dates. */
export function resolveExamEligibilityTime(member: ExamCycleDates, configuredMonths: number, advanceMonths = 0) {
  const isFirstExam = !member.last_exam_on;
  const cycleStart = isFirstExam ? member.joined_on : member.last_exam_on;
  if (!cycleStart || !/^\d{4}-\d{2}-\d{2}$/.test(cycleStart)) return null;
  const cycleStartDate = new Date(`${cycleStart}T00:00:00`);
  if (!Number.isFinite(cycleStartDate.getTime()) || cycleStartDate.getFullYear() !== Number(cycleStart.slice(0,4)) || cycleStartDate.getMonth() + 1 !== Number(cycleStart.slice(5,7)) || cycleStartDate.getDate() !== Number(cycleStart.slice(8,10))) return null;
  const minimumMonths = isFirstExam ? 6 : Math.max(0, configuredMonths - advanceMonths);
  const eligibilityDate = new Date(cycleStartDate);
  const day = eligibilityDate.getDate();
  eligibilityDate.setDate(1);
  eligibilityDate.setMonth(eligibilityDate.getMonth() + minimumMonths);
  const lastDay = new Date(eligibilityDate.getFullYear(), eligibilityDate.getMonth() + 1, 0).getDate();
  eligibilityDate.setDate(Math.min(day, lastDay));
  return { isFirstExam, cycleStart, cycleStartDate, minimumMonths, eligibilityDate };
}

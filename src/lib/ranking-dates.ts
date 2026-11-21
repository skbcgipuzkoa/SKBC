import { madridCallToday } from "./exam-call.ts";

/** Capture once per calculation, using the club's calendar day rather than server uptime or timezone. */
export function rankingDates(now = new Date()) {
  const today = madridCallToday(now);
  const ago = (days: number) => {
    const date = new Date(today + "T12:00:00Z");
    date.setUTCDate(date.getUTCDate() - days);
    return date.toISOString().slice(0, 10);
  };
  return { today, date30: ago(30), date60: ago(60), date90: ago(90), date180: ago(180) };
}
export type RankingDates = ReturnType<typeof rankingDates>;

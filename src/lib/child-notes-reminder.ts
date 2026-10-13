import { createAdminClient } from "@/lib/supabase/admin";

export const CHILD_NOTES_REMINDER_KEY = "child-notes-review";
const REMINDER_START = "2026-10-01";
const REMINDER_INTERVAL_MONTHS = 2;

type ReminderDismissal = {
  dismissed_at: string;
};

export type ChildNotesReminder = {
  alertKey: string;
  dueOn: string;
  periodsPending: number;
};

export async function getChildNotesReminder(today = new Date()): Promise<ChildNotesReminder | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_alert_dismissals")
    .select("dismissed_at")
    .eq("alert_key", CHILD_NOTES_REMINDER_KEY)
    .maybeSingle<ReminderDismissal>();

  if (error) throw error;

  const dueOn = data?.dismissed_at
    ? addMonths(toDateOnly(data.dismissed_at), REMINDER_INTERVAL_MONTHS)
    : REMINDER_START;
  const todayValue = formatDateOnly(today);
  if (todayValue < dueOn) return null;

  return {
    alertKey: CHILD_NOTES_REMINDER_KEY,
    dueOn,
    periodsPending: Math.floor(monthDifference(dueOn, todayValue) / REMINDER_INTERVAL_MONTHS) + 1
  };
}

function addMonths(value: string, months: number) {
  const [year, month, day] = value.split("-").map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return formatDateOnly(target);
}

function monthDifference(from: string, to: string) {
  const [fromYear, fromMonth] = from.split("-").map(Number);
  const [toYear, toMonth] = to.split("-").map(Number);
  return Math.max(0, (toYear - fromYear) * 12 + toMonth - fromMonth);
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

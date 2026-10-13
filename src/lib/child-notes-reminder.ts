import { createAdminClient } from "@/lib/supabase/admin";

export const CHILD_NOTES_REMINDER_KEY = "child-notes-review";
const REMINDER_START_YEAR = 2026;

type ReminderDismissal = {
  dismissed_at: string;
};

export type ChildNotesReminder = {
  alertKey: string;
  dueOn: string;
  periodsPending: number;
  season: "christmas" | "summer";
  seasonLabel: string;
};

export async function getChildNotesReminder(today = new Date()): Promise<ChildNotesReminder | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("admin_alert_dismissals")
    .select("dismissed_at")
    .eq("alert_key", CHILD_NOTES_REMINDER_KEY)
    .maybeSingle<ReminderDismissal>();

  if (error) throw error;

  const todayValue = formatDateOnly(today);
  const dismissedOn = data?.dismissed_at ? toDateOnly(data.dismissed_at) : null;
  const pendingCampaigns = scheduledCampaignsUntil(today.getUTCFullYear())
    .filter((campaign) => campaign.dueOn <= todayValue && (!dismissedOn || campaign.dueOn > dismissedOn));
  const current = pendingCampaigns.at(-1);
  if (!current) return null;

  return {
    alertKey: CHILD_NOTES_REMINDER_KEY,
    dueOn: current.dueOn,
    periodsPending: pendingCampaigns.length,
    season: current.season,
    seasonLabel: current.season === "christmas" ? "Notas de Navidad" : "Notas de final de curso"
  };
}

function scheduledCampaignsUntil(lastYear: number) {
  const campaigns: Array<{ dueOn: string; season: "christmas" | "summer" }> = [];
  for (let year = REMINDER_START_YEAR; year <= lastYear; year += 1) {
    if (year > REMINDER_START_YEAR) campaigns.push({ dueOn: `${year}-06-01`, season: "summer" });
    campaigns.push({ dueOn: `${year}-12-01`, season: "christmas" });
  }
  return campaigns;
}

function toDateOnly(value: string) {
  return value.slice(0, 10);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

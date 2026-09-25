import { createAdminClient } from "@/lib/supabase/admin";

const EMAIL_RETENTION_DAYS = 90;
const TELEGRAM_RETENTION_DAYS = 30;

export async function pruneNotificationHistory() {
  const supabase = createAdminClient();
  const emailCutoff = daysAgoIso(EMAIL_RETENTION_DAYS);
  const telegramCutoff = daysAgoIso(TELEGRAM_RETENTION_DAYS);

  const [emailResult, telegramResult, deliveryResult] = await Promise.all([
    supabase.from("email_notification_logs").delete({ count: "exact" }).lt("created_at", emailCutoff).in("status", ["sent"]),
    supabase.from("telegram_notification_logs").delete({ count: "exact" }).lt("created_at", telegramCutoff).in("status", ["sent", "skipped"]),
    supabase.from("notification_deliveries").delete({ count: "exact" }).lt("created_at", telegramCutoff).eq("status", "sent")
  ]);
  const error = emailResult.error ?? telegramResult.error ?? deliveryResult.error;
  if (error) throw error;
  return {
    emailDeleted: emailResult.count ?? 0,
    telegramDeleted: telegramResult.count ?? 0,
    deliveryDeleted: deliveryResult.count ?? 0
  };
}

function daysAgoIso(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString();
}

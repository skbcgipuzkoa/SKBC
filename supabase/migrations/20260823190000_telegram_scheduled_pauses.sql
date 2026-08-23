alter table public.telegram_notification_settings
  add column if not exists pause_starts_on date,
  add column if not exists pause_ends_on date;


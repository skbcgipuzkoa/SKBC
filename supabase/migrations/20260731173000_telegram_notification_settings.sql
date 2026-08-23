create table if not exists public.telegram_notification_settings (
  notification_type text primary key,
  enabled boolean not null default true,
  paused_reason text,
  updated_at timestamptz not null default now()
);

insert into public.telegram_notification_settings (notification_type, enabled)
values
  ('daily_ranking', true),
  ('monthly_stats', true),
  ('semester_stats', true),
  ('yearly_stats', true)
on conflict (notification_type) do nothing;

alter table public.telegram_notification_settings enable row level security;

create table if not exists public.telegram_notification_logs (
  id uuid primary key default gen_random_uuid(),
  notification_type text not null,
  period_start date,
  period_end date,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  telegram_chat_id text,
  message text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists telegram_notification_logs_period_unique
  on public.telegram_notification_logs(notification_type, period_start, period_end);

create index if not exists telegram_notification_logs_created_at_idx
  on public.telegram_notification_logs(created_at desc);

alter table public.telegram_notification_logs enable row level security;

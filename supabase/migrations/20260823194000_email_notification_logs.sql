create table if not exists public.email_notification_logs (
  id uuid primary key default gen_random_uuid(),
  audience text not null,
  subject text not null,
  body text not null,
  recipients jsonb not null default '[]'::jsonb,
  failures jsonb not null default '[]'::jsonb,
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  status text not null default 'pending',
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_notification_logs_created_at_idx
  on public.email_notification_logs(created_at desc);

alter table public.email_notification_logs enable row level security;

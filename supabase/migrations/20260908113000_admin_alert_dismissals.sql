create table if not exists public.admin_alert_dismissals (
  id uuid primary key default gen_random_uuid(),
  alert_key text not null unique,
  dismissed_by text,
  dismissed_at timestamptz not null default now()
);

create index if not exists admin_alert_dismissals_dismissed_at_idx
  on public.admin_alert_dismissals (dismissed_at desc);

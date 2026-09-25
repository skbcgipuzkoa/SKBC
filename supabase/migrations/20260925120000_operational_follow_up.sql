create table if not exists public.provisional_members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) >= 2),
  class text not null check (class in ('kids', 'adults')),
  status text not null default 'pending' check (status in ('pending', 'converted')),
  converted_member_id uuid references public.members(id) on delete set null,
  converted_at timestamptz,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.provisional_attendance (
  id uuid primary key default gen_random_uuid(),
  provisional_member_id uuid not null references public.provisional_members(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  attended_on date not null,
  created_at timestamptz not null default now(),
  unique (provisional_member_id, class_id)
);

create table if not exists public.member_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  note text not null check (length(trim(note)) >= 2),
  important boolean not null default false,
  resolved_at timestamptz,
  resolved_by text,
  created_by text not null default 'Alvaro',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_summaries (
  id uuid primary key default gen_random_uuid(),
  period_start date not null,
  period_end date not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (period_start, period_end)
);

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  delivery_key text not null,
  channel text not null check (channel in ('panel', 'telegram')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (delivery_key, channel)
);

create index if not exists provisional_members_pending_idx on public.provisional_members (created_at desc) where status = 'pending';
create index if not exists provisional_attendance_date_idx on public.provisional_attendance (attended_on desc);
create index if not exists member_notes_open_important_idx on public.member_notes (created_at desc) where important and resolved_at is null;
create index if not exists weekly_summaries_period_idx on public.weekly_summaries (period_start desc);
create index if not exists notification_deliveries_failed_idx on public.notification_deliveries (updated_at desc) where status = 'failed';

alter table public.provisional_members enable row level security;
alter table public.provisional_attendance enable row level security;
alter table public.member_notes enable row level security;
alter table public.weekly_summaries enable row level security;
alter table public.notification_deliveries enable row level security;

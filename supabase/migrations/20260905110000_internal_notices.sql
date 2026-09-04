create table if not exists public.internal_notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  area text not null default 'general',
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  status text not null default 'open' check (status in ('open', 'in_progress', 'done', 'archived')),
  due_on date,
  pinned boolean not null default false,
  created_by text,
  resolved_on date,
  resolved_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists internal_notices_status_idx
  on public.internal_notices(status, pinned desc, due_on, created_at desc);

alter table public.internal_notices enable row level security;

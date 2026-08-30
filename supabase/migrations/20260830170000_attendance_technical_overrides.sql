create table if not exists public.attendance_technical_overrides (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  attendance_id uuid not null references public.attendance_logs(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  plan_id uuid not null references public.technical_plans(id) on delete cascade,
  include_in_history boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attendance_id, plan_id)
);

create index if not exists attendance_technical_overrides_class_idx
  on public.attendance_technical_overrides (class_id);

create index if not exists attendance_technical_overrides_attendance_idx
  on public.attendance_technical_overrides (attendance_id);

alter table public.attendance_technical_overrides enable row level security;

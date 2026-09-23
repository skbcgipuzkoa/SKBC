create table if not exists public.child_attendance_work_overrides (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  attendance_id uuid not null references public.attendance_logs(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  work_mode text not null default 'common' check (work_mode in ('common', 'own', 'other_grade', 'observer')),
  trained_grade text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(attendance_id)
);

create index if not exists child_attendance_work_overrides_class_idx
  on public.child_attendance_work_overrides(class_id);

create index if not exists child_attendance_work_overrides_member_idx
  on public.child_attendance_work_overrides(member_id);

alter table public.child_attendance_work_overrides enable row level security;

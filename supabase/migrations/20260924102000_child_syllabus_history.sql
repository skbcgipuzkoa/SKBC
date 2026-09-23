create table if not exists public.child_syllabus_history (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  class_id uuid not null references public.classes(id) on delete cascade,
  attendance_id uuid not null references public.attendance_logs(id) on delete cascade,
  syllabus_item_id uuid not null references public.child_syllabus_items(id) on delete cascade,
  practiced_on date not null,
  source text not null default 'class_plan',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id, class_id, syllabus_item_id)
);

create index if not exists child_syllabus_history_member_date_idx
  on public.child_syllabus_history (member_id, practiced_on desc);

create index if not exists child_syllabus_history_class_idx
  on public.child_syllabus_history (class_id);

create index if not exists child_syllabus_history_item_idx
  on public.child_syllabus_history (syllabus_item_id);

alter table public.child_syllabus_history enable row level security;

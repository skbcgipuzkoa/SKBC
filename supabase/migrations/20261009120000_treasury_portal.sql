alter table public.members
  add column if not exists billing_enabled boolean not null default true,
  add column if not exists billing_note text;

alter table public.family_billing_sheet_tasks
  drop constraint if exists family_billing_sheet_tasks_status_check;

alter table public.family_billing_sheet_tasks
  add constraint family_billing_sheet_tasks_status_check
  check (status in ('pending', 'generated', 'delivered', 'received', 'active')),
  add column if not exists received_at timestamptz,
  add column if not exists activated_at timestamptz,
  add column if not exists last_actor text check (last_actor in ('alvaro', 'tesorero')),
  add column if not exists note text;

create table if not exists public.family_billing_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references public.family_billing_sheet_tasks(id) on delete cascade,
  family_unit_id uuid references public.family_units(id) on delete cascade,
  subject_member_id uuid not null references public.members(id) on delete cascade,
  action text not null,
  previous_status text,
  new_status text,
  actor text not null check (actor in ('alvaro', 'tesorero')),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists family_billing_events_task_idx
  on public.family_billing_events(task_id, created_at desc);
create index if not exists family_billing_events_subject_idx
  on public.family_billing_events(subject_member_id, created_at desc);

alter table public.family_billing_events enable row level security;

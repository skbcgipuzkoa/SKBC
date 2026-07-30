create table if not exists public.child_adult_transitions (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  legacy_id text,
  transitioned_on date not null default current_date,
  child_grade text,
  adult_grade text,
  child_joined_on date,
  child_summary jsonb not null default '{}'::jsonb,
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists child_adult_transitions_member_idx on public.child_adult_transitions (member_id, transitioned_on desc);
create index if not exists child_adult_transitions_legacy_idx on public.child_adult_transitions (legacy_id);

alter table public.child_adult_transitions enable row level security;

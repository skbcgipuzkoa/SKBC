create table public.dojo_technical_history (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  class_id uuid references public.classes(id) on delete set null,
  class_date date not null,
  technical_group_id uuid references public.class_technical_groups(id) on delete set null,
  group_grade text,
  target_grade text,
  technique_id uuid references public.techniques(id) on delete set null,
  technique_grade text,
  technique_base text,
  technique_name text not null,
  category public.technique_category,
  content_type text,
  proposal_type text,
  focus text,
  completed boolean not null default false,
  counts_repetition boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

create table public.member_technical_history (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  class_id uuid references public.classes(id) on delete set null,
  class_date date not null,
  assignment_id uuid references public.member_technique_assignments(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  member_grade_at_time text,
  technical_group_id uuid references public.class_technical_groups(id) on delete set null,
  group_grade text,
  target_grade text,
  technique_id uuid references public.techniques(id) on delete set null,
  technique_name text not null,
  technique_grade text,
  category public.technique_category,
  content_type text,
  proposal_type text,
  completed boolean not null default false,
  counts_as_progression boolean not null default false,
  counts_as_review boolean not null default false,
  counts_for_stats boolean not null default true,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

create index dojo_technical_history_class_idx on public.dojo_technical_history (class_id, class_date);
create index dojo_technical_history_technique_idx on public.dojo_technical_history (technique_id);
create index member_technical_history_member_idx on public.member_technical_history (member_id, class_date desc);
create index member_technical_history_technique_idx on public.member_technical_history (technique_id);

alter table public.dojo_technical_history enable row level security;
alter table public.member_technical_history enable row level security;

create table if not exists public.child_class_plans (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade unique,
  objective text,
  activities text[] not null default '{}'::text[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.child_class_group_work (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  group_label text not null,
  content text not null,
  member_ids uuid[] not null default '{}'::uuid[],
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists child_class_group_work_class_id_idx
  on public.child_class_group_work(class_id);

alter table public.child_class_plans enable row level security;
alter table public.child_class_group_work enable row level security;

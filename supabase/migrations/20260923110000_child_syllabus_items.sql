create table if not exists public.child_syllabus_items (
  id uuid primary key default gen_random_uuid(),
  grade text not null,
  title text not null,
  category text not null default 'otro',
  description text,
  exam_relevant boolean not null default true,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists child_syllabus_items_grade_active_idx
  on public.child_syllabus_items (grade, active, sort_order);

create index if not exists child_syllabus_items_category_idx
  on public.child_syllabus_items (category);

alter table public.child_syllabus_items enable row level security;

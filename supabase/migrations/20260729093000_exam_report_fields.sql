alter table public.exams
  add column if not exists report_url text,
  add column if not exists report_created_at timestamptz,
  add column if not exists report_created_by text,
  add column if not exists report_type text,
  add column if not exists report_file_name text,
  add column if not exists program text,
  add column if not exists source_evaluation_id text;

create table if not exists public.belt_order_lines (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete set null,
  exam_title text,
  program text,
  grade text,
  member_id uuid references public.members(id) on delete set null,
  student_name text,
  item text not null default 'Cinturon',
  color text,
  size text,
  quantity integer not null default 1,
  notes text,
  created_by text,
  created_at timestamptz not null default now()
);

alter table public.belt_order_lines enable row level security;

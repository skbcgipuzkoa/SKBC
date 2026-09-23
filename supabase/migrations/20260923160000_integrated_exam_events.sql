create table if not exists public.exam_events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  exam_date date not null,
  program_type text not null check (program_type in ('adults', 'kids_progressive', 'kids', 'dan_tribunal')),
  target_grade text,
  pass_percentage numeric not null default 70,
  status text not null default 'draft' check (status in ('draft', 'active', 'review', 'completed', 'archived')),
  notes text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exam_event_students (
  id uuid primary key default gen_random_uuid(),
  exam_event_id uuid not null references public.exam_events(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  display_order integer not null default 0,
  current_grade text,
  target_grade text,
  final_percentage numeric,
  final_passed boolean,
  final_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_event_id, member_id)
);

create table if not exists public.exam_event_items (
  id uuid primary key default gen_random_uuid(),
  exam_event_id uuid not null references public.exam_events(id) on delete cascade,
  source text not null default 'manual' check (source in ('technique', 'child_syllabus', 'manual', 'cut')),
  technique_id uuid references public.techniques(id) on delete set null,
  child_syllabus_item_id uuid references public.child_syllabus_items(id) on delete set null,
  section text,
  name text not null,
  summary text,
  grade text,
  category text,
  weight numeric not null default 1,
  order_index integer not null default 0,
  cut_grade text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_event_examiners (
  id uuid primary key default gen_random_uuid(),
  exam_event_id uuid not null references public.exam_events(id) on delete cascade,
  name text not null,
  email text,
  access_token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  submitted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.exam_event_scores (
  id uuid primary key default gen_random_uuid(),
  exam_event_id uuid not null references public.exam_events(id) on delete cascade,
  event_student_id uuid not null references public.exam_event_students(id) on delete cascade,
  event_item_id uuid not null references public.exam_event_items(id) on delete cascade,
  examiner_id uuid not null references public.exam_event_examiners(id) on delete cascade,
  score numeric,
  skipped boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_student_id, event_item_id, examiner_id)
);

create table if not exists public.exam_event_reviews (
  id uuid primary key default gen_random_uuid(),
  exam_event_id uuid not null references public.exam_events(id) on delete cascade,
  event_student_id uuid not null references public.exam_event_students(id) on delete cascade,
  base_percentage numeric,
  adjustment_points numeric not null default 0,
  final_percentage numeric,
  final_passed boolean,
  review_notes text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_event_id, event_student_id)
);

create index if not exists exam_events_exam_date_idx on public.exam_events(exam_date desc);
create index if not exists exam_events_status_idx on public.exam_events(status);
create index if not exists exam_event_students_event_idx on public.exam_event_students(exam_event_id, display_order);
create index if not exists exam_event_items_event_idx on public.exam_event_items(exam_event_id, order_index);
create index if not exists exam_event_examiners_token_idx on public.exam_event_examiners(access_token);
create index if not exists exam_event_scores_event_idx on public.exam_event_scores(exam_event_id);
create index if not exists exam_event_scores_student_idx on public.exam_event_scores(event_student_id);
create index if not exists exam_event_reviews_event_idx on public.exam_event_reviews(exam_event_id);

alter table public.exam_events enable row level security;
alter table public.exam_event_students enable row level security;
alter table public.exam_event_items enable row level security;
alter table public.exam_event_examiners enable row level security;
alter table public.exam_event_scores enable row level security;
alter table public.exam_event_reviews enable row level security;

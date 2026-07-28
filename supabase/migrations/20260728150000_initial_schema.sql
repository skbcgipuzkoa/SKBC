create extension if not exists pgcrypto;

create type public.member_status as enum ('active', 'inactive');
create type public.member_class as enum ('kids', 'adults');
create type public.class_status as enum ('pending', 'completed', 'cancelled');
create type public.technical_role as enum ('student', 'teaching', 'support', 'reviewing', 'observing');
create type public.technique_category as enum ('goho', 'juho', 'seiho', 'ukemi', 'randori', 'embu', 'hokei', 'kihon');

create table public.members (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  first_name text not null,
  last_name text,
  display_name text generated always as (trim(coalesce(first_name, '') || ' ' || coalesce(last_name, ''))) stored,
  guardian_name text,
  guardian_phone text,
  student_phone text,
  family_email text,
  address text,
  joined_on date,
  class member_class not null,
  status member_status not null default 'active',
  grade text,
  photo_url text,
  legacy_photo_ref text,
  ficha_token text unique,
  legacy_ficha_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.techniques (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  grade text not null,
  base_name text,
  name text not null,
  category technique_category not null,
  content_type text,
  program_order integer,
  curriculum_order integer,
  active boolean not null default true,
  active_in_planning boolean not null default true,
  force_next boolean not null default false,
  score numeric not null default 0,
  repetitions integer not null default 0,
  last_trained_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  class_date date not null,
  name text not null,
  class_group member_class not null default 'adults',
  class_type text,
  responsible text,
  notes text,
  plan_generated boolean not null default false,
  closed boolean not null default false,
  status class_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_technical_groups (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes(id) on delete cascade,
  legacy_id text,
  grade text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.technical_plans (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  class_id uuid not null references public.classes(id) on delete cascade,
  technical_group_id uuid references public.class_technical_groups(id) on delete set null,
  class_date date not null,
  session_type text,
  grade text,
  group_grade text,
  target_grade text,
  technique_id uuid references public.techniques(id) on delete restrict,
  technique_grade text,
  technique_base text,
  technique_name text not null,
  category technique_category,
  content_type text,
  proposal_type text,
  focus text,
  suggested_order integer,
  score_at_that_moment numeric,
  completed boolean not null default false,
  notes text,
  used_for_history boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.attendance_logs (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  class_id uuid references public.classes(id) on delete set null,
  member_id uuid not null references public.members(id) on delete cascade,
  attended_on date not null,
  official_grade text,
  trained_grade text,
  technical_role technical_role not null default 'student',
  technical_note text,
  use_for_history boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.member_technique_assignments (
  id uuid primary key default gen_random_uuid(),
  legacy_id text unique,
  class_id uuid not null references public.classes(id) on delete cascade,
  plan_id uuid references public.technical_plans(id) on delete cascade,
  technique_id uuid references public.techniques(id) on delete restrict,
  member_id uuid not null references public.members(id) on delete cascade,
  assigned_on date not null,
  group_grade text,
  active boolean not null default true,
  completed boolean not null default false,
  counts_as_progression boolean not null default false,
  counts_as_review boolean not null default false,
  counts_for_stats boolean not null default true,
  notes text,
  created_by text not null default 'system',
  created_at timestamptz not null default now()
);

create table public.exams (
  id uuid primary key default gen_random_uuid(),
  legacy_row integer,
  exam_date date not null,
  member_id uuid not null references public.members(id) on delete cascade,
  grade text not null,
  cycle_attendance integer,
  examiner text,
  registered_by text,
  diploma_url text,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('national', 'international')),
  course_date date not null,
  member_id uuid not null references public.members(id) on delete cascade,
  location text,
  title text,
  sensei text,
  notes text,
  legacy_id text,
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null default 'info',
  process text not null,
  entity_type text,
  entity_id uuid,
  message text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.members enable row level security;
alter table public.techniques enable row level security;
alter table public.classes enable row level security;
alter table public.class_technical_groups enable row level security;
alter table public.technical_plans enable row level security;
alter table public.attendance_logs enable row level security;
alter table public.member_technique_assignments enable row level security;
alter table public.exams enable row level security;
alter table public.courses enable row level security;
alter table public.audit_logs enable row level security;

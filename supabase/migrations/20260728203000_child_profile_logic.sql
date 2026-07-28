create table public.child_rankings (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  legacy_id text unique,
  attendance_30d integer not null default 0,
  attendance_90d integer not null default 0,
  last_attendance_on date,
  days_without_attendance integer,
  score integer not null default 0,
  position integer,
  level text,
  constancy_status text,
  motivational_message text,
  calculated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.child_notes (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  legacy_id text unique,
  note_date date,
  note_type text,
  note text,
  visible_family boolean not null default false,
  author text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.child_notices (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  legacy_id text unique,
  notice_date date,
  title text not null,
  body text,
  color text,
  active boolean not null default true,
  source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.child_behavior_reports (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  legacy_id text unique,
  report_date date,
  attitude text,
  attention text,
  respect text,
  effort text,
  companionship text,
  observation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.child_profile_cache (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  legacy_id text unique,
  token text,
  profile_json jsonb not null default '{}'::jsonb,
  status text not null default 'OK',
  error text,
  refreshed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index child_rankings_member_idx on public.child_rankings (member_id);
create index child_notes_member_idx on public.child_notes (member_id, note_date desc);
create index child_notices_member_idx on public.child_notices (member_id, active, notice_date desc);
create index child_behavior_reports_member_idx on public.child_behavior_reports (member_id, report_date desc);
create index child_profile_cache_member_idx on public.child_profile_cache (member_id);

alter table public.child_rankings enable row level security;
alter table public.child_notes enable row level security;
alter table public.child_notices enable row level security;
alter table public.child_behavior_reports enable row level security;
alter table public.child_profile_cache enable row level security;

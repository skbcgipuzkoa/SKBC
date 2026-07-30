create table if not exists public.black_belt_class_eligibility (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  eligible_from date not null default current_date,
  eligible_until date,
  active boolean not null default true,
  reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_id)
);

create table if not exists public.black_belt_special_classes (
  id uuid primary key default gen_random_uuid(),
  class_date date not null unique,
  title text not null default 'Clase Busen',
  instructor text,
  notes text,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.black_belt_special_attendance (
  id uuid primary key default gen_random_uuid(),
  special_class_id uuid not null references public.black_belt_special_classes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  status text not null default 'present' check (status in ('present', 'justified', 'absent')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (special_class_id, member_id)
);

create index if not exists black_belt_eligibility_active_idx
  on public.black_belt_class_eligibility (active, member_id);

create index if not exists black_belt_special_attendance_member_idx
  on public.black_belt_special_attendance (member_id, created_at desc);

alter table public.black_belt_class_eligibility enable row level security;
alter table public.black_belt_special_classes enable row level security;
alter table public.black_belt_special_attendance enable row level security;

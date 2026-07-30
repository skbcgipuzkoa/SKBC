create table if not exists public.shakujo_classes (
  id uuid primary key default gen_random_uuid(),
  class_date date not null unique,
  title text not null default 'Clase Shakujo',
  instructor text,
  notes text,
  closed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shakujo_attendance (
  id uuid primary key default gen_random_uuid(),
  shakujo_class_id uuid not null references public.shakujo_classes(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shakujo_class_id, member_id)
);

create index if not exists shakujo_attendance_member_idx
  on public.shakujo_attendance (member_id, created_at desc);

create index if not exists shakujo_attendance_class_idx
  on public.shakujo_attendance (shakujo_class_id);

alter table public.shakujo_classes enable row level security;
alter table public.shakujo_attendance enable row level security;

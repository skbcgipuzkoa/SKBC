create table if not exists public.skbc_calendar_closures (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  title text not null,
  applies_to text not null default 'all' check (applies_to in ('all', 'kids', 'adults')),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on)
);

create table if not exists public.skbc_exam_calls (
  id uuid primary key default gen_random_uuid(),
  call_date date not null unique,
  title text not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.skbc_exam_requirements (
  id uuid primary key default gen_random_uuid(),
  member_class public.member_class not null,
  grade_pattern text not null,
  min_months integer not null default 12,
  attendance_ratio numeric not null default 0.4,
  adult_required_repetitions integer not null default 2,
  technical_blocks_exam boolean not null default true,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (member_class, grade_pattern)
);

create index if not exists skbc_calendar_closures_range_idx
  on public.skbc_calendar_closures (starts_on, ends_on, applies_to)
  where active;

create index if not exists skbc_exam_calls_date_idx
  on public.skbc_exam_calls (call_date)
  where active;

alter table public.skbc_calendar_closures enable row level security;
alter table public.skbc_exam_calls enable row level security;
alter table public.skbc_exam_requirements enable row level security;

insert into public.skbc_exam_requirements (member_class, grade_pattern, min_months, attendance_ratio, adult_required_repetitions, technical_blocks_exam, notes)
values
  ('kids', '*', 12, 0.4, 0, false, 'Regla infantil general inicial. Ajustable.'),
  ('adults', '* KYU', 12, 0.4, 2, true, 'Kyu adultos: 12 meses, 40% asistencia y 2 repeticiones tecnicas.'),
  ('adults', 'MINARAI', 12, 0.4, 2, true, 'Minarai adulto hacia 5 kyu.'),
  ('adults', '1 DAN', 12, 0.4, 2, true, 'Dan: tiempo minimo equivalente al numero de dan.'),
  ('adults', '2 DAN', 24, 0.4, 2, true, 'Dan: tiempo minimo equivalente al numero de dan.'),
  ('adults', '3 DAN', 36, 0.4, 2, true, 'Dan: tiempo minimo equivalente al numero de dan.'),
  ('adults', '4 DAN', 48, 0.4, 2, true, 'Dan: tiempo minimo equivalente al numero de dan.'),
  ('adults', '5 DAN', 60, 0.4, 2, true, 'Dan: tiempo minimo equivalente al numero de dan.')
on conflict (member_class, grade_pattern) do nothing;

insert into public.skbc_exam_calls (call_date, title, notes)
values
  ('2026-06-27', 'Convocatoria junio 2026', 'Fecha inicial aproximada configurable.'),
  ('2026-12-05', 'Convocatoria diciembre 2026', 'Fecha inicial aproximada configurable.'),
  ('2027-06-26', 'Convocatoria junio 2027', 'Fecha inicial aproximada configurable.'),
  ('2027-12-04', 'Convocatoria diciembre 2027', 'Fecha inicial aproximada configurable.')
on conflict (call_date) do nothing;

insert into public.skbc_calendar_closures (starts_on, ends_on, title, applies_to, notes)
values
  ('2026-03-30', '2026-04-12', 'Semana Santa 2026', 'all', 'Bloque inicial de dos semanas. Ajustable.'),
  ('2026-07-01', '2026-08-31', 'Verano 2026', 'all', 'Sin entrenamientos de club.'),
  ('2026-12-24', '2027-01-06', 'Navidad 2026', 'all', 'Hasta despues de Reyes.'),
  ('2027-07-01', '2027-08-31', 'Verano 2027', 'all', 'Sin entrenamientos de club.'),
  ('2027-12-24', '2028-01-06', 'Navidad 2027', 'all', 'Hasta despues de Reyes.')
on conflict do nothing;

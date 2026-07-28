alter table public.members
  add column if not exists ika_id text unique;

create table public.legacy_spreadsheets (
  id uuid primary key default gen_random_uuid(),
  google_spreadsheet_id text not null unique,
  title text not null,
  locale text,
  time_zone text,
  source_url text,
  discovered_at timestamptz not null default now(),
  notes text
);

create table public.legacy_sheets (
  id uuid primary key default gen_random_uuid(),
  legacy_spreadsheet_id uuid not null references public.legacy_spreadsheets(id) on delete cascade,
  google_sheet_id bigint not null,
  title text not null,
  sheet_index integer not null,
  row_count integer,
  column_count integer,
  hidden boolean not null default false,
  header_row integer not null default 1,
  headers text[] not null default '{}',
  imported_at timestamptz,
  unique (legacy_spreadsheet_id, google_sheet_id),
  unique (legacy_spreadsheet_id, title)
);

create table public.legacy_rows (
  id uuid primary key default gen_random_uuid(),
  legacy_sheet_id uuid not null references public.legacy_sheets(id) on delete cascade,
  row_number integer not null,
  row_data jsonb not null,
  row_values text[] not null default '{}',
  imported_at timestamptz not null default now(),
  unique (legacy_sheet_id, row_number)
);

create index legacy_rows_sheet_row_idx on public.legacy_rows (legacy_sheet_id, row_number);
create index legacy_rows_data_gin_idx on public.legacy_rows using gin (row_data);

create table public.import_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  legacy_spreadsheet_id uuid references public.legacy_spreadsheets(id) on delete set null,
  status text not null default 'pending',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  error text
);

alter table public.legacy_spreadsheets enable row level security;
alter table public.legacy_sheets enable row level security;
alter table public.legacy_rows enable row level security;
alter table public.import_runs enable row level security;

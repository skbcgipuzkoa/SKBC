create table if not exists public.legacy_sheet_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  target_sheet text not null,
  target_spreadsheet_id text not null,
  source_table text,
  source_id text,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed')),
  attempts integer not null default 0,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists legacy_sheet_sync_jobs_status_idx on public.legacy_sheet_sync_jobs(status, created_at);
create index if not exists legacy_sheet_sync_jobs_source_idx on public.legacy_sheet_sync_jobs(source_table, source_id);

alter table public.legacy_sheet_sync_jobs enable row level security;

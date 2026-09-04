create table if not exists public.backup_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  trigger_source text not null default 'manual' check (trigger_source in ('manual', 'cron')),
  storage_bucket text not null default 'skbc-backups',
  storage_path text,
  table_counts jsonb not null default '{}'::jsonb,
  table_errors jsonb not null default '{}'::jsonb,
  file_size_bytes bigint,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_by text
);

create index if not exists backup_runs_started_at_idx
  on public.backup_runs(started_at desc);

create index if not exists backup_runs_status_idx
  on public.backup_runs(status, started_at desc);

alter table public.backup_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'backup_runs'
      and policyname = 'backup_runs_admin_all'
  ) then
    create policy "backup_runs_admin_all"
      on public.backup_runs
      for all
      using (true)
      with check (true);
  end if;
end $$;

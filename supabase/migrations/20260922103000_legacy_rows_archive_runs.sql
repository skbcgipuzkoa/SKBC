create table if not exists public.legacy_rows_archive_runs (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  row_count integer not null default 0,
  file_size_bytes bigint,
  drive_file_id text,
  drive_url text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  created_by text
);

create index if not exists legacy_rows_archive_runs_started_idx
  on public.legacy_rows_archive_runs (started_at desc);

alter table public.legacy_rows_archive_runs enable row level security;

drop policy if exists "legacy_rows_archive_runs_all" on public.legacy_rows_archive_runs;
create policy "legacy_rows_archive_runs_all"
  on public.legacy_rows_archive_runs
  for all
  using (true)
  with check (true);

create or replace function public.clear_legacy_rows_after_archive()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  removed integer;
begin
  select count(*) into removed from public.legacy_rows;
  truncate table public.legacy_rows;
  return removed;
end;
$$;

revoke all on function public.clear_legacy_rows_after_archive() from public, anon, authenticated;
grant execute on function public.clear_legacy_rows_after_archive() to service_role;

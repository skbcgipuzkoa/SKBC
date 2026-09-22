alter table public.backup_runs
  add column if not exists storage_provider text not null default 'supabase' check (storage_provider in ('supabase', 'google_drive')),
  add column if not exists drive_file_id text,
  add column if not exists drive_url text;

create index if not exists backup_runs_storage_provider_idx
  on public.backup_runs(storage_provider, started_at desc);

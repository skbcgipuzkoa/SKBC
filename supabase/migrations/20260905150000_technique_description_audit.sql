alter table public.techniques
  add column if not exists summary_updated_at timestamptz,
  add column if not exists summary_updated_by text;

update public.techniques
set
  summary_updated_at = coalesce(summary_updated_at, updated_at),
  summary_updated_by = coalesce(summary_updated_by, 'Migracion SKBC')
where summary_es is not null
  and trim(summary_es) <> ''
  and summary_updated_at is null;

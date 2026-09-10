create table if not exists public.trash_items (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_label text not null,
  source_table text not null,
  source_id text,
  snapshot jsonb not null default '{}'::jsonb,
  related_snapshots jsonb not null default '{}'::jsonb,
  affected_member_ids uuid[] not null default '{}'::uuid[],
  restore_status text not null default 'restorable' check (restore_status in ('restorable', 'restored', 'locked')),
  deleted_by text,
  notes text,
  deleted_at timestamptz not null default now(),
  restored_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists trash_items_deleted_at_idx
  on public.trash_items(deleted_at desc);

create index if not exists trash_items_restore_status_idx
  on public.trash_items(restore_status, deleted_at desc);

alter table public.trash_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'trash_items'
      and policyname = 'trash_items_admin_all'
  ) then
    create policy "trash_items_admin_all"
      on public.trash_items
      for all
      using (true)
      with check (true);
  end if;
end $$;

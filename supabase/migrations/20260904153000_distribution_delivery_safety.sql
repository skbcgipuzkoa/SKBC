create table if not exists public.distribution_delivery_checks_archive (
  id uuid primary key default gen_random_uuid(),
  original_id uuid,
  campaign_id uuid,
  item_id uuid,
  member_id uuid,
  checked boolean,
  checked_at timestamptz,
  notes text,
  deleted_at timestamptz not null default now(),
  original_created_at timestamptz,
  original_updated_at timestamptz
);

alter table public.distribution_delivery_checks_archive enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'distribution_delivery_checks_archive'
      and policyname = 'distribution_delivery_checks_archive_admin_all'
  ) then
    create policy "distribution_delivery_checks_archive_admin_all"
      on public.distribution_delivery_checks_archive
      for all
      using (true)
      with check (true);
  end if;
end $$;

create or replace function public.archive_distribution_delivery_check()
returns trigger
language plpgsql
as $$
begin
  insert into public.distribution_delivery_checks_archive (
    original_id,
    campaign_id,
    item_id,
    member_id,
    checked,
    checked_at,
    notes,
    original_created_at,
    original_updated_at
  )
  values (
    old.id,
    old.campaign_id,
    old.item_id,
    old.member_id,
    old.checked,
    old.checked_at,
    old.notes,
    old.created_at,
    old.updated_at
  );
  return old;
end;
$$;

drop trigger if exists archive_distribution_delivery_check_before_delete on public.distribution_delivery_checks;

create trigger archive_distribution_delivery_check_before_delete
before delete on public.distribution_delivery_checks
for each row
execute function public.archive_distribution_delivery_check();

insert into public.distribution_delivery_checks (campaign_id, item_id, member_id, checked, checked_at, notes)
select
  delivery.campaign_id,
  item.id,
  delivery.member_id,
  true,
  delivery.delivered_at,
  delivery.notes
from public.distribution_deliveries delivery
join public.distribution_campaign_items item
  on item.campaign_id = delivery.campaign_id
 and item.active = true
 and lower(item.label) = 'entregado'
where delivery.delivered = true
  and not exists (
    select 1
    from public.distribution_delivery_checks check_row
    where check_row.item_id = item.id
      and check_row.member_id = delivery.member_id
  );

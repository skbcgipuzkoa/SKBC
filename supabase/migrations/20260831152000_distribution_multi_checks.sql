create table if not exists public.distribution_campaign_items (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.distribution_campaigns(id) on delete cascade,
  label text not null,
  position integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, label)
);

create table if not exists public.distribution_delivery_checks (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.distribution_campaigns(id) on delete cascade,
  item_id uuid not null references public.distribution_campaign_items(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  checked boolean not null default true,
  checked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (item_id, member_id)
);

insert into public.distribution_campaign_items (campaign_id, label, position, active)
select campaign.id, 'Entregado', 1, true
from public.distribution_campaigns campaign
where not exists (
  select 1
  from public.distribution_campaign_items item
  where item.campaign_id = campaign.id
);

insert into public.distribution_delivery_checks (campaign_id, item_id, member_id, checked, checked_at, notes)
select delivery.campaign_id, item.id, delivery.member_id, true, delivery.delivered_at, delivery.notes
from public.distribution_deliveries delivery
join public.distribution_campaign_items item on item.campaign_id = delivery.campaign_id and item.position = 1
where not exists (
  select 1
  from public.distribution_delivery_checks check_row
  where check_row.item_id = item.id
    and check_row.member_id = delivery.member_id
);

alter table public.distribution_campaign_items enable row level security;
alter table public.distribution_delivery_checks enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'distribution_campaign_items'
      and policyname = 'distribution_campaign_items_admin_all'
  ) then
    create policy "distribution_campaign_items_admin_all"
      on public.distribution_campaign_items
      for all
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'distribution_delivery_checks'
      and policyname = 'distribution_delivery_checks_admin_all'
  ) then
    create policy "distribution_delivery_checks_admin_all"
      on public.distribution_delivery_checks
      for all
      using (true)
      with check (true);
  end if;
end $$;

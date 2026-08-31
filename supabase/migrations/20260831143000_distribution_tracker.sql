create table if not exists public.distribution_campaigns (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  audience text not null default 'all' check (audience in ('all', 'kids', 'adults')),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.distribution_deliveries (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.distribution_campaigns(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  delivered boolean not null default true,
  delivered_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (campaign_id, member_id)
);

alter table public.distribution_campaigns enable row level security;
alter table public.distribution_deliveries enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'distribution_campaigns'
      and policyname = 'distribution_campaigns_admin_all'
  ) then
    create policy "distribution_campaigns_admin_all"
      on public.distribution_campaigns
      for all
      using (true)
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'distribution_deliveries'
      and policyname = 'distribution_deliveries_admin_all'
  ) then
    create policy "distribution_deliveries_admin_all"
      on public.distribution_deliveries
      for all
      using (true)
      with check (true);
  end if;
end $$;

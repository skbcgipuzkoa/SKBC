alter table public.dojos
  add column operational_status text not null default 'active'
  check (operational_status in ('active', 'inactive', 'paused', 'under_construction'));

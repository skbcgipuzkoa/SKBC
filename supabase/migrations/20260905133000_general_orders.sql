create table if not exists public.order_catalog_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'general',
  default_color text,
  default_size text,
  unit_price_cents integer not null default 0,
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.belt_order_lines
  add column if not exists catalog_item_id uuid references public.order_catalog_items(id) on delete set null,
  add column if not exists requested_on date not null default current_date,
  add column if not exists unit_price_cents integer not null default 0,
  add column if not exists total_price_cents integer not null default 0,
  add column if not exists paid_amount_cents integer not null default 0,
  add column if not exists payment_status text not null default 'unpaid',
  add column if not exists paid_on date;

update public.belt_order_lines
set requested_on = coalesce(requested_on, created_at::date)
where requested_on is null;

update public.belt_order_lines
set total_price_cents = greatest(0, unit_price_cents) * greatest(1, quantity)
where total_price_cents = 0 and unit_price_cents > 0;

create index if not exists order_catalog_items_active_idx on public.order_catalog_items (active, category, name);
create index if not exists belt_order_lines_payment_status_idx on public.belt_order_lines (payment_status, created_at desc);
create index if not exists belt_order_lines_requested_on_idx on public.belt_order_lines (requested_on desc);

alter table public.order_catalog_items enable row level security;

do $$
begin
  create policy "order_catalog_items_admin_all" on public.order_catalog_items
    for all
    using (true)
    with check (true);
exception
  when duplicate_object then null;
end $$;

insert into public.order_catalog_items (name, category, unit_price_cents, active)
select item, 'cinturones', 0, true
from (
  select distinct nullif(trim(item), '') as item
  from public.belt_order_lines
) existing
where item is not null
  and not exists (
    select 1 from public.order_catalog_items catalog
    where lower(trim(catalog.name)) = lower(trim(existing.item))
  );

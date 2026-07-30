alter table public.belt_order_lines
  add column if not exists status text not null default 'pending',
  add column if not exists ordered_on date,
  add column if not exists received_on date,
  add column if not exists delivered_on date,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists belt_order_lines_status_idx on public.belt_order_lines (status, created_at desc);

create table if not exists public.billing_settings (
  id text primary key check (id = 'monthly_fees'),
  kids_fee_cents integer not null check (kids_fee_cents > 0),
  adults_fee_cents integer not null check (adults_fee_cents > 0),
  free_trial_promotion_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.billing_settings
  add column if not exists free_trial_promotion_enabled boolean not null default true;

insert into public.billing_settings (id, kids_fee_cents, adults_fee_cents, free_trial_promotion_enabled)
values ('monthly_fees', 2500, 3000, true)
on conflict (id) do nothing;

alter table public.billing_settings enable row level security;

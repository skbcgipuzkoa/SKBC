create table if not exists public.treasury_access_settings (
  id text primary key check (id = 'treasurer'),
  access_token text not null,
  enabled boolean not null default true,
  updated_by text not null default 'alvaro' check (updated_by in ('alvaro')),
  updated_at timestamptz not null default now()
);

alter table public.treasury_access_settings enable row level security;

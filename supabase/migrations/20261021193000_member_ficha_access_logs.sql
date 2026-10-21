create table if not exists public.member_ficha_access_logs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references public.members(id) on delete cascade,
  accessed_at timestamptz not null default now()
);

create index if not exists member_ficha_access_logs_member_accessed_idx
  on public.member_ficha_access_logs (member_id, accessed_at desc);

alter table public.member_ficha_access_logs enable row level security;

comment on table public.member_ficha_access_logs is
  'Aperturas de fichas publicas para estadistica interna; no almacena IP, dispositivo ni ubicacion.';

create table public.anandi_access (
  dojo_slug text primary key references public.dojos(slug) on delete cascade,
  token text unique,
  revision uuid not null default gen_random_uuid(),
  username text,
  password_hash text,
  attempts integer not null default 0,
  window_started timestamptz not null default now(),
  check ((username is null) = (password_hash is null))
);
alter table public.anandi_access enable row level security;
revoke all on public.anandi_access from public, anon, authenticated;
grant select, insert, update on public.anandi_access to service_role;

create function public.reserve_anandi_attempt(p_revision uuid)
returns boolean language sql set search_path = '' as $$
  with reservation as (
    update public.anandi_access
    set attempts = case when window_started <= now() - interval '5 minutes' then 1 else attempts + 1 end,
        window_started = case when window_started <= now() - interval '5 minutes' then now() else window_started end
    where dojo_slug = 'anandi' and revision = p_revision and token is not null
      and (attempts < 10 or window_started <= now() - interval '5 minutes')
    returning 1
  )
  select exists(select 1 from reservation);
$$;
revoke all on function public.reserve_anandi_attempt(uuid) from public, anon, authenticated;
grant execute on function public.reserve_anandi_attempt(uuid) to service_role;

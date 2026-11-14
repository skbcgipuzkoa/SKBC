begin;
alter table public.dojos
  add column registered_at timestamptz default now(),
  add column opened_on date,
  add column location text,
  add column sensei text,
  add column contact text,
  add column notes text,
  add column opening_members integer check (opening_members >= 0);
update public.dojos set registered_at = null;

create table public.dojo_closure_history (
  id uuid primary key default gen_random_uuid(),
  dojo_slug text not null,
  dojo_name text not null,
  location text,
  closed_on date not null,
  reason text not null,
  members integer not null
);
alter table public.dojo_closure_history enable row level security;
revoke all on public.dojo_closure_history from public, anon, authenticated;
grant select, insert on public.dojo_closure_history to service_role;

create function public.close_dojo_with_history(p_slug text, p_destinations jsonb, p_reason text)
returns text language plpgsql set search_path = '' as $$
declare
  dojo public.dojos%rowtype;
  member_count integer;
  outcome text;
begin
  if coalesce(length(trim(p_reason)), 0) not between 1 and 500 then
    raise exception 'Indica el motivo del cierre';
  end if;
  lock table public.dojos in share row exclusive mode;
  lock table public.dojo_memberships in share row exclusive mode;
  select * into strict dojo from public.dojos where slug = p_slug;
  select count(*) into member_count from public.dojo_memberships where dojo_slug = p_slug and status = 'active';
  outcome := public.close_dojo(p_slug, p_destinations);
  insert into public.dojo_closure_history(dojo_slug, dojo_name, location, closed_on, reason, members)
  values (p_slug, dojo.name, dojo.location, (now() at time zone 'Europe/Madrid')::date, trim(p_reason), member_count);
  return outcome;
end;
$$;
revoke all on function public.close_dojo_with_history(text,jsonb,text) from public, anon, authenticated;
grant execute on function public.close_dojo_with_history(text,jsonb,text) to service_role;
commit;

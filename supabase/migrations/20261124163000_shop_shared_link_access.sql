create table public.shop_email_access (
  id uuid primary key,
  email text not null,
  code_hash text not null,
  created_at timestamptz not null default now(),
  attempts smallint not null default 0,
  verified_at timestamptz
);
create index shop_email_access_recent on public.shop_email_access (created_at desc);
create index shop_email_access_email on public.shop_email_access (email, created_at desc);
alter table public.shop_email_access enable row level security;
revoke all on public.shop_email_access from anon, authenticated;
grant select on public.shop_email_access to service_role;

create function public.shop_members_for_email(p_email text)
returns table(id uuid, display_name text, class text, family_id uuid)
language sql stable set search_path = '' as $$
  with registered as (
    select m.id, link.family_unit_id
    from public.members m
    left join public.family_unit_members link on link.member_id = m.id
    where m.status = 'active' and m.class in ('adults','kids')
      and p_email = any(regexp_split_to_array(lower(trim(coalesce(m.family_email, ''))), '[,;[:space:]]+'))
  )
  select m.id, m.display_name::text, m.class::text, link.family_unit_id
  from public.members m
  left join public.family_unit_members link on link.member_id = m.id
  where m.status = 'active' and m.class in ('adults','kids')
    and exists (select 1 from registered r where r.id = m.id or r.family_unit_id = link.family_unit_id)
  order by m.display_name, m.id;
$$;

create function public.shop_request_email_access(p_id uuid, p_email text, p_code_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.shop_members_for_email(p_email)) then return false; end if;
  perform pg_advisory_xact_lock(hashtextextended('skbc-shop-email-access', 0));
  if exists (select 1 from public.shop_email_access where email = p_email and created_at > now() - interval '1 minute')
    or (select count(*) from public.shop_email_access where email = p_email and created_at > now() - interval '1 hour') >= 5
    or (select count(*) from public.shop_email_access where created_at > now() - interval '1 hour') >= 100 then
    return false;
  end if;
  delete from public.shop_email_access where created_at < now() - interval '1 day';
  insert into public.shop_email_access(id, email, code_hash) values (p_id, p_email, p_code_hash);
  return true;
end;
$$;

create function public.shop_verify_email_access(p_id uuid, p_code_hash text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  matched boolean;
begin
  update public.shop_email_access
  set attempts = attempts + 1,
      verified_at = case when code_hash = p_code_hash then clock_timestamp() else null end
  where id = p_id and verified_at is null and attempts < 5 and created_at > clock_timestamp() - interval '10 minutes'
  returning verified_at is not null into matched;
  return coalesce(matched, false);
end;
$$;

revoke all on function public.shop_members_for_email(text), public.shop_request_email_access(uuid,text,text),
  public.shop_verify_email_access(uuid,text) from public, anon, authenticated;
grant execute on function public.shop_members_for_email(text), public.shop_request_email_access(uuid,text,text),
  public.shop_verify_email_access(uuid,text) to service_role;

create table public.dojo_enrollment_requests (
  id uuid primary key default gen_random_uuid(),
  dojo_slug text not null references public.dojos(slug),
  first_name text not null,
  last_name text,
  member_class public.member_class not null,
  created_at timestamptz not null default now(),
  approved_member uuid references public.members(id),
  foreign key (dojo_slug, member_class) references public.dojo_groups(dojo_slug, member_class)
);
alter table public.dojo_enrollment_requests enable row level security;
revoke all on public.dojo_enrollment_requests from anon, authenticated;

create function public.approve_dojo_enrollment(p_request uuid, p_existing uuid)
returns uuid language plpgsql set search_path = '' as $$
declare
  request public.dojo_enrollment_requests%rowtype;
  member uuid;
begin
  select * into request from public.dojo_enrollment_requests where id = p_request for update;
  if not found then raise exception 'Solicitud no disponible'; end if;
  if request.approved_member is not null then return request.approved_member; end if;
  perform 1 from public.dojos where slug = request.dojo_slug and archived_at is null for share;
  if not found then raise exception 'Dojo archivado'; end if;
  if p_existing is null then
    insert into public.members(first_name,last_name,class,dojo)
    values (request.first_name,request.last_name,request.member_class,
      case when request.dojo_slug = 'anandi' then 'anandi' else 'gainberri' end)
    returning id into member;
  else
    select id into member from public.members where id = p_existing and class = request.member_class;
    if not found then raise exception 'Ficha incompatible'; end if;
  end if;
  insert into public.dojo_memberships(member_id,dojo_slug,status,validated_at)
  values(member,request.dojo_slug,'active',now())
  on conflict (member_id,dojo_slug) do update set status = 'active', validated_at = now();
  update public.dojo_enrollment_requests set approved_member = member where id = p_request;
  return member;
end;
$$;
revoke all on function public.approve_dojo_enrollment(uuid,uuid) from public, anon, authenticated;
grant execute on function public.approve_dojo_enrollment(uuid,uuid) to service_role;

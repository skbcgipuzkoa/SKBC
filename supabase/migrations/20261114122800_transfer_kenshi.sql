begin;
alter table public.members drop constraint members_dojo_class_check;
alter table public.members add constraint members_dojo_fkey foreign key (dojo) references public.dojos(slug);
alter table public.members add constraint members_anandi_adults_check check (dojo <> 'anandi' or class = 'adults');

create function public.transfer_kenshi(p_member uuid, p_destination text)
returns void language plpgsql set search_path = '' as $$
declare
  kenshi public.members%rowtype;
begin
  lock table public.dojos in share row exclusive mode;
  lock table public.dojo_memberships in share row exclusive mode;
  select * into strict kenshi from public.members where id = p_member for update;
  if not exists (
    select 1 from public.dojos d join public.dojo_groups g on g.dojo_slug = d.slug
    where d.slug = p_destination and d.archived_at is null and g.member_class = kenshi.class
  ) then raise exception 'El dojo no admite esta clase'; end if;
  if kenshi.dojo = p_destination then return; end if;
  update public.dojo_memberships set status = 'inactive'
    where member_id = p_member and dojo_slug = kenshi.dojo;
  insert into public.dojo_memberships(member_id, dojo_slug, status, validated_at)
    values(p_member, p_destination, kenshi.status, now())
    on conflict (member_id, dojo_slug) do update set status = excluded.status, validated_at = now();
  update public.members set dojo = p_destination, updated_at = now() where id = p_member;
end;
$$;
revoke all on function public.transfer_kenshi(uuid,text) from public, anon, authenticated;
grant execute on function public.transfer_kenshi(uuid,text) to service_role;
commit;

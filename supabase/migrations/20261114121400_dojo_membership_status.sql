create function public.set_dojo_membership_status(p_slug text, p_member uuid, p_active boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.dojos where slug = p_slug and archived_at is null for share;
  if not found then
    raise exception 'El dojo no está activo';
  end if;

  update public.dojo_memberships dm
  set status = case when p_active then 'active'::public.member_status else 'inactive'::public.member_status end
  where dm.dojo_slug = p_slug and dm.member_id = p_member
    and (not p_active or exists (
      select 1 from public.members m
      join public.dojo_groups dg on dg.member_class = m.class
      where m.id = dm.member_id and dg.dojo_slug = dm.dojo_slug
    ));

  if not found then
    raise exception 'La inscripción no está disponible';
  end if;
end;
$$;

revoke all on function public.set_dojo_membership_status(text, uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_dojo_membership_status(text, uuid, boolean) to service_role;

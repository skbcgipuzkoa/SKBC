create function public.close_dojo(p_slug text, p_destinations jsonb)
returns text
language plpgsql
set search_path = ''
as $$
declare
  enrollment record;
  destination text;
begin
  -- Serialize closure and enrollment changes, including new enrollments.
  lock table public.dojos in share row exclusive mode;
  lock table public.dojo_memberships in share row exclusive mode;
  if p_slug = 'gainberri' or not exists (
    select 1 from public.dojos where slug = p_slug and archived_at is null
  ) then
    raise exception 'El dojo no se puede cerrar';
  end if;
  if p_destinations is null or jsonb_typeof(p_destinations) <> 'object' then
    raise exception 'Faltan las decisiones de cierre';
  end if;

  if not exists (select 1 from public.dojo_memberships where dojo_slug = p_slug)
     and not exists (select 1 from public.classes where dojo_slug = p_slug)
     and not exists (select 1 from public.dojo_enrollment_requests where dojo_slug = p_slug) then
    delete from public.dojo_senseis where dojo_slug = p_slug;
    delete from public.dojo_groups where dojo_slug = p_slug;
    delete from public.dojos where slug = p_slug;
    return 'deleted';
  end if;

  for enrollment in
    select dm.member_id, dm.validated_at, m.class
    from public.dojo_memberships dm
    join public.members m on m.id = dm.member_id
    where dm.dojo_slug = p_slug and dm.status = 'active'
  loop
    if not (p_destinations ? enrollment.member_id::text) then
      raise exception 'Falta decidir qué hacer con todos los kenshis';
    end if;
    destination := p_destinations ->> enrollment.member_id::text;
    if destination is not null then
      if destination = p_slug or not exists (
        select 1 from public.dojo_groups g
        join public.dojos d on d.slug = g.dojo_slug
        where g.dojo_slug = destination and g.member_class = enrollment.class
          and d.archived_at is null
      ) then
        raise exception 'El dojo de destino no admite la clase del kenshi';
      end if;
      insert into public.dojo_memberships (member_id, dojo_slug, status, validated_at)
      values (enrollment.member_id, destination, 'active', enrollment.validated_at)
      on conflict (member_id, dojo_slug) do update set status = 'active';
    end if;
  end loop;

  update public.dojo_memberships set status = 'inactive' where dojo_slug = p_slug;
  update public.dojos set archived_at = now() where slug = p_slug;
  return 'archived';
end;
$$;

revoke all on function public.close_dojo(text, jsonb) from public, anon, authenticated;
grant execute on function public.close_dojo(text, jsonb) to service_role;

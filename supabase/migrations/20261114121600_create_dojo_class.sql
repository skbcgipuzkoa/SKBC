create function public.create_dojo_class(p_slug text, p_name text, p_date date, p_group public.member_class)
returns void
language plpgsql
set search_path = ''
as $$
begin
  perform 1 from public.dojos where slug = p_slug and archived_at is null for share;
  if not found then
    raise exception 'El dojo no está activo';
  end if;

  if p_name is null or length(trim(p_name)) not between 1 and 100 then
    raise exception 'Nombre de clase no válido';
  end if;
  insert into public.classes (dojo_slug, class_date, class_group, name)
    values (p_slug, p_date, p_group, trim(p_name));
end;
$$;

revoke all on function public.create_dojo_class(text, text, date, public.member_class) from public, anon, authenticated;
grant execute on function public.create_dojo_class(text, text, date, public.member_class) to service_role;

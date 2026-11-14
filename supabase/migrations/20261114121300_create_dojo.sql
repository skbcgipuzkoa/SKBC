
create function public.create_dojo(p_slug text, p_name text, p_color text, p_kids boolean)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.dojos (slug, name, accent_color) values (p_slug, p_name, p_color);
  insert into public.dojo_groups (dojo_slug, member_class) values (p_slug, 'adults');
  if p_kids then
    insert into public.dojo_groups (dojo_slug, member_class) values (p_slug, 'kids');
  end if;
end;
$$;

revoke all on function public.create_dojo(text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.create_dojo(text, text, text, boolean) to service_role;
